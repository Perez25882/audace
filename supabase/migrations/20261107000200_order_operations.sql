create function audace_private.available(p_sku uuid, p_on_hand integer, p_now timestamptz) returns integer
language sql stable set search_path = ''
as $$
  select greatest(0, p_on_hand - coalesce(sum(quantity),0))::integer
  from public.audace_reservations where sku_id = p_sku and state = 'held' and expires_at > p_now
$$;

create function public.audace_public_shop() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',v.id,'sku',v.code,'slug',v.slug,'colour',v.colour,'sleeve',v.sleeve,
        'name',p.name,'description',p.description,'specifications',p.specifications,'sizeGuide',p.size_guide,
        'published',true,'pricePesewas',v.price_pesewas,
        'images',(select jsonb_agg(jsonb_build_object('src',i.path,'width',i.width,'height',i.height,'alt',i.alt,'label',i.label) order by i.position)
                  from public.audace_images i where i.variant_id = v.id),
        'sizes',coalesce((select jsonb_agg(jsonb_build_object('label',s.size,'stock',
                  audace_private.available(s.id,b.on_hand,statement_timestamp())) order by s.created_at,s.id)
                  from public.audace_skus s left join public.audace_stock b on b.sku_id = s.id
                  where s.variant_id = v.id and s.active),'[]'::jsonb)
      ) order by v.sort_order,v.id)
      from public.audace_variants v join public.audace_products p on p.id = v.product_id
      where v.published and p.published and exists(select 1 from public.audace_images i where i.variant_id = v.id)
    ),'[]'::jsonb),
    'methods',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'label',d.label,'regions',jsonb_build_array(d.region),
      'feePesewas',d.fee_pesewas) order by d.region,d.label) from public.audace_delivery d where d.active),'[]'::jsonb),
    'shippingReturns',(select shipping_returns from public.audace_settings where singleton)
  )
$$;

create function audace_private.quote(p_lines jsonb, p_region text, p_delivery uuid, p_lock boolean) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  delivery public.audace_delivery%rowtype;
  snapshots jsonb;
  subtotal bigint;
  can_supply boolean;
  as_of timestamptz;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or octet_length(p_lines::text) > 20000 then
    raise exception using errcode = 'P0001', message = 'invalid_items';
  end if;
  if jsonb_array_length(p_lines) not between 1 and 100 or exists (
    select from jsonb_array_elements(p_lines) x
    where jsonb_typeof(x) <> 'object'
      or coalesce(x->>'variantId','') !~ '^[a-z0-9-]{1,80}$'
      or length(coalesce(x->>'size','')) not between 1 and 40
      or coalesce(jsonb_typeof(x->'quantity'),'') <> 'number'
      or coalesce(x->>'quantity','') !~ '^[1-9][0-9]?$'
  ) or exists (
    select from jsonb_array_elements(p_lines) x group by x->>'variantId', x->>'size' having count(*) > 1
  ) then raise exception using errcode = 'P0001', message = 'invalid_items'; end if;

  if p_lock then
    -- Lock catalogue and inventory in consistent order, then re-read prices and stock.
    perform p.id from public.audace_products p where p.id in (
      select v.product_id from public.audace_variants v where v.id in (select x->>'variantId' from jsonb_array_elements(p_lines) x)
    ) order by p.id for share;
    perform v.id from public.audace_variants v where v.id in (select x->>'variantId' from jsonb_array_elements(p_lines) x)
      order by v.id for share;
    perform s.id from public.audace_skus s join jsonb_array_elements(p_lines) x
      on s.variant_id = x->>'variantId' and s.size = x->>'size' order by s.id for share of s;
    perform b.sku_id from public.audace_stock b join public.audace_skus s on s.id = b.sku_id
      join jsonb_array_elements(p_lines) x on s.variant_id = x->>'variantId' and s.size = x->>'size'
      order by b.sku_id for update of b;
    select * into delivery from public.audace_delivery where id = p_delivery and region = p_region and active for share;
  else
    select * into delivery from public.audace_delivery where id = p_delivery and region = p_region and active;
  end if;
  if not found then raise exception using errcode = 'P0001', message = 'delivery_unavailable'; end if;

  as_of := clock_timestamp();
  select jsonb_agg(jsonb_build_object('sku_id',s.id,'sku',s.code,'product_name',p.name,'colour',v.colour,
    'sleeve',v.sleeve,'size',s.size,'quantity',(x->>'quantity')::integer,'price_pesewas',v.price_pesewas) order by s.id),
    sum(v.price_pesewas * (x->>'quantity')::integer),
    bool_and((x->>'quantity')::integer <= audace_private.available(s.id,b.on_hand,as_of))
  into snapshots,subtotal,can_supply
  from jsonb_array_elements(p_lines) x
  join public.audace_variants v on v.id = x->>'variantId' and v.published and v.price_pesewas is not null
  join public.audace_products p on p.id = v.product_id and p.published
  join public.audace_skus s on s.variant_id = v.id and s.size = x->>'size' and s.active
  join public.audace_stock b on b.sku_id = s.id;

  if snapshots is null or jsonb_array_length(snapshots) <> jsonb_array_length(p_lines) or not coalesce(can_supply,false) then
    raise exception using errcode = 'P0001', message = 'item_unavailable';
  end if;
  return jsonb_build_object('subtotal',subtotal,'delivery',delivery.fee_pesewas,
    'total',subtotal + delivery.fee_pesewas,'deliveryLabel',delivery.label,'items',snapshots);
end
$$;

create function public.audace_checkout_quote(p_lines jsonb, p_region text, p_delivery uuid) returns jsonb
language sql security definer set search_path = ''
as $$ select audace_private.quote(p_lines,p_region,p_delivery,false) - 'items' $$;

create function public.audace_place_pending(p_request uuid, p_lines jsonb, p_delivery uuid, p_contact jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  existing public.audace_orders%rowtype;
  quote jsonb;
  fingerprint bytea;
begin
  if p_request is null or p_contact is null or jsonb_typeof(p_contact) <> 'object'
    or octet_length(p_contact::text) > 5000 or p_lines is null or octet_length(p_lines::text) > 20000 then
    raise exception using errcode = '22023', message = 'invalid_request';
  end if;
  fingerprint := sha256(convert_to(jsonb_build_array(p_lines,p_delivery,p_contact)::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,1703));
  select * into existing from public.audace_orders where request_id = p_request;
  if found then
    if existing.request_hash <> fingerprint then raise exception using errcode = '23505', message = 'request_conflict'; end if;
  else
    quote := audace_private.quote(p_lines,p_contact->>'region',p_delivery,true);
    insert into public.audace_orders (request_id,request_hash,subtotal_pesewas,delivery_pesewas,delivery_id,delivery_label,expires_at)
    values (p_request,fingerprint,(quote->>'subtotal')::bigint,(quote->>'delivery')::bigint,p_delivery,
      quote->>'deliveryLabel',clock_timestamp() + interval '15 minutes')
    returning * into existing;
    insert into public.audace_order_contacts (order_id,name,email,phone,region,city,address,directions)
    values (existing.id,btrim(p_contact->>'name'),lower(btrim(p_contact->>'email')),p_contact->>'phone',
      p_contact->>'region',btrim(p_contact->>'city'),btrim(p_contact->>'address'),coalesce(btrim(p_contact->>'directions'),''));
    insert into public.audace_order_items (order_id,sku_id,sku,product_name,colour,sleeve,size,quantity,price_pesewas)
    select existing.id,i.sku_id,i.sku,i.product_name,i.colour,i.sleeve,i.size,i.quantity,i.price_pesewas
    from jsonb_to_recordset(quote->'items') i(sku_id uuid,sku text,product_name text,colour text,sleeve text,
      size text,quantity integer,price_pesewas bigint);
    insert into public.audace_reservations (order_id,sku_id,quantity,expires_at)
    select order_id,sku_id,quantity,existing.expires_at from public.audace_order_items where order_id = existing.id;
    insert into public.audace_order_history (order_id,payment_status,fulfilment_status,event)
    values (existing.id,'pending','unfulfilled','reservation_created');
  end if;
  return jsonb_build_object('id',existing.id,'reference',existing.public_ref,'payment',existing.payment_status,
    'total',existing.total_pesewas,'expiresAt',existing.expires_at);
end
$$;

create function audace_private.stop_order(p_id uuid, p_payment text, p_event text, p_actor uuid) returns boolean
language plpgsql set search_path = ''
as $$
declare current_payment text;
begin
  select payment_status into current_payment from public.audace_orders where id = p_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'order_missing'; end if;
  if current_payment = p_payment then return false; end if;
  if current_payment <> 'pending' or p_payment not in ('failed','cancelled') then
    raise exception using errcode = 'P0001', message = 'invalid_transition';
  end if;
  update public.audace_orders set payment_status = p_payment, fulfilment_status = 'cancelled',updated_at = clock_timestamp() where id = p_id;
  update public.audace_reservations set state = 'released',updated_at = clock_timestamp() where order_id = p_id and state = 'held';
  insert into public.audace_order_history (order_id,actor,payment_status,fulfilment_status,event)
  values (p_id,p_actor,p_payment,'cancelled',p_event);
  return true;
end
$$;

create function public.audace_release_payment(p_order uuid, p_failed boolean) returns boolean
language sql security definer set search_path = ''
as $$
  select audace_private.stop_order(p_order,case when p_failed then 'failed' else 'cancelled' end,
    case when p_failed then 'payment_failed' else 'payment_cancelled' end,null)
$$;

create function public.audace_expire_orders(p_limit integer default 100) returns integer
language plpgsql security definer set search_path = ''
as $$
declare pending uuid;
declare processed integer := 0;
begin
  for pending in select id from public.audace_orders where payment_status = 'pending' and expires_at <= clock_timestamp()
    order by expires_at,id limit least(greatest(coalesce(p_limit,100),1),500) for update skip locked
  loop
    perform audace_private.stop_order(pending,'cancelled','reservation_expired',null);
    processed := processed + 1;
  end loop;
  return processed;
end
$$;

-- The trusted payment verifier is a Phase 4 integration. No admin or guest grants.
create function public.audace_finalize_verified(p_order uuid, p_reference text, p_amount bigint, p_currency text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare current_order public.audace_orders%rowtype;
declare line record;
declare remaining integer;
begin
  select * into current_order from public.audace_orders where id = p_order for update;
  if not found then raise exception using errcode = 'P0001', message = 'order_missing'; end if;
  if p_amount is distinct from current_order.total_pesewas or p_currency is distinct from current_order.currency
    or p_reference is null or p_reference !~ '^[A-Za-z0-9._=-]{1,120}$'
  then raise exception using errcode = 'P0001', message = 'payment_mismatch'; end if;
  if current_order.payment_status = 'paid' and current_order.verified_reference = p_reference then return false; end if;
  if current_order.payment_status <> 'pending' then raise exception using errcode = 'P0001', message = 'invalid_transition'; end if;

  perform b.sku_id from public.audace_stock b join public.audace_reservations r on r.sku_id = b.sku_id
    where r.order_id = p_order order by b.sku_id for update of b;
  if current_order.expires_at <= clock_timestamp() or not exists (select from public.audace_order_items where order_id = p_order)
    or exists (
      select from public.audace_order_items i left join public.audace_reservations r using (order_id,sku_id)
      where i.order_id = p_order and (r.state is distinct from 'held' or r.quantity is distinct from i.quantity or r.expires_at <= clock_timestamp())
    )
  then raise exception using errcode = 'P0001', message = 'reservation_unavailable'; end if;

  for line in select sku_id,quantity from public.audace_reservations where order_id = p_order order by sku_id
  loop
    update public.audace_stock set on_hand = on_hand - line.quantity, updated_at = clock_timestamp()
      where sku_id = line.sku_id returning on_hand into remaining;
    if not found then raise exception using errcode = 'P0001', message = 'reservation_unavailable'; end if;
    insert into public.audace_movements (sku_id,order_id,delta,balance,reason)
    values (line.sku_id,p_order,-line.quantity,remaining,'Verified order stock finalization');
  end loop;
  update public.audace_reservations set state = 'finalized',updated_at = clock_timestamp() where order_id = p_order;
  update public.audace_orders set payment_status = 'paid',verified_reference = p_reference,
    verified_at = clock_timestamp(),updated_at = clock_timestamp() where id = p_order;
  insert into public.audace_order_history (order_id,payment_status,fulfilment_status,event)
  values (p_order,'paid','unfulfilled','payment_verified');
  return true;
end
$$;

revoke all on all functions in schema audace_private from public, anon, authenticated, service_role;
revoke all on function public.audace_public_shop(), public.audace_checkout_quote(jsonb,text,uuid),
  public.audace_place_pending(uuid,jsonb,uuid,jsonb), public.audace_release_payment(uuid,boolean),
  public.audace_expire_orders(integer), public.audace_finalize_verified(uuid,text,bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.audace_public_shop(), public.audace_checkout_quote(jsonb,text,uuid) to anon, authenticated;
grant execute on function public.audace_place_pending(uuid,jsonb,uuid,jsonb), public.audace_release_payment(uuid,boolean),
  public.audace_expire_orders(integer), public.audace_finalize_verified(uuid,text,bigint,text) to service_role;
