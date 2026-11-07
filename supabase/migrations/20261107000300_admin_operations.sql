create function public.audace_set_product(p_id text, p_description text, p_size_guide text, p_published boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := audace_private.require_admin(true);
begin
  update public.audace_products set description = btrim(p_description), size_guide = nullif(btrim(p_size_guide),''),
    published = p_published, updated_at = clock_timestamp() where id = p_id;
  if not found then raise exception using errcode = 'P0001', message = 'product_missing'; end if;
  insert into public.audace_audit(actor,operation,target,details)
  values (actor_id,'product_updated',p_id,jsonb_build_object('published',p_published));
end
$$;

create function public.audace_set_variant(p_id text, p_price bigint, p_published boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := audace_private.require_admin(true);
begin
  update public.audace_variants set price_pesewas = p_price,published = p_published,updated_at = clock_timestamp() where id = p_id;
  if not found then raise exception using errcode = 'P0001', message = 'variant_missing'; end if;
  insert into public.audace_audit(actor,operation,target,details)
  values (actor_id,'variant_updated',p_id,jsonb_build_object('pricePesewas',p_price,'published',p_published));
end
$$;

create function public.audace_add_size(p_variant text, p_size text, p_code text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := audace_private.require_admin(true);
declare size_id uuid;
begin
  insert into public.audace_skus(variant_id,size,code) values (p_variant,btrim(p_size),upper(btrim(p_code))) returning id into size_id;
  insert into public.audace_stock(sku_id) values (size_id);
  insert into public.audace_audit(actor,operation,target) values (actor_id,'size_added',size_id::text);
  return size_id;
end
$$;

create function public.audace_set_size_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := audace_private.require_admin(true);
begin
  update public.audace_skus set active = p_active where id = p_id;
  if not found then raise exception using errcode = 'P0001', message = 'sku_missing'; end if;
  insert into public.audace_audit(actor,operation,target,details)
  values (actor_id,'size_status_changed',p_id::text,jsonb_build_object('active',p_active));
end
$$;

create function public.audace_adjust_stock(p_sku uuid, p_expected integer, p_count integer, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := audace_private.require_admin();
declare previous integer;
declare free_units integer;
begin
  if p_count is null or p_count not between 0 and 1000000 or coalesce(length(btrim(p_reason)),0) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'invalid_adjustment';
  end if;
  select on_hand into previous from public.audace_stock where sku_id = p_sku for update;
  if not found then raise exception using errcode = 'P0001', message = 'sku_missing'; end if;
  if previous is distinct from p_expected then raise exception using errcode = 'P0001', message = 'stock_changed'; end if;
  if previous = p_count then return; end if;
  free_units := audace_private.available(p_sku,previous,clock_timestamp());
  if p_count < previous - free_units then raise exception using errcode = 'P0001', message = 'stock_reserved'; end if;
  update public.audace_stock set on_hand = p_count,updated_at = clock_timestamp() where sku_id = p_sku;
  insert into public.audace_movements(sku_id,actor,delta,balance,reason)
  values (p_sku,actor_id,p_count - previous,p_count,btrim(p_reason));
  insert into public.audace_audit(actor,operation,target,details)
  values (actor_id,'stock_adjusted',p_sku::text,jsonb_build_object('delta',p_count - previous,'balance',p_count));
end
$$;

create function public.audace_set_delivery(p_id uuid,p_region text,p_label text,p_fee bigint,p_active boolean) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := audace_private.require_admin(true);
declare method_id uuid := p_id;
begin
  if method_id is null then
    insert into public.audace_delivery(region,label,fee_pesewas,active)
    values (p_region,btrim(p_label),p_fee,p_active) returning id into method_id;
  else
    update public.audace_delivery set region=p_region,label=btrim(p_label),fee_pesewas=p_fee,active=p_active,
      updated_at=clock_timestamp() where id=method_id;
    if not found then raise exception using errcode = 'P0001', message = 'delivery_missing'; end if;
  end if;
  insert into public.audace_audit(actor,operation,target,details)
  values (actor_id,'delivery_saved',method_id::text,jsonb_build_object('active',p_active,'feePesewas',p_fee,'region',p_region));
  return method_id;
end
$$;

create function public.audace_set_settings(p_threshold integer,p_shipping_returns text) returns void
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := audace_private.require_admin(true);
begin
  insert into public.audace_settings(singleton,low_stock_threshold,shipping_returns)
  values (true,p_threshold,nullif(btrim(p_shipping_returns),''))
  on conflict (singleton) do update set low_stock_threshold=excluded.low_stock_threshold,
    shipping_returns=excluded.shipping_returns,updated_at=clock_timestamp();
  insert into public.audace_audit(actor,operation,target,details)
  values (actor_id,'settings_updated','store',jsonb_build_object('threshold',p_threshold));
end
$$;

create function public.audace_admin_order_action(p_order uuid,p_action text) returns void
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := audace_private.require_admin();
declare existing public.audace_orders%rowtype;
declare expected text;
begin
  if p_action = 'cancel_pending' then
    if audace_private.stop_order(p_order,'cancelled','admin_cancelled',actor_id) then
      insert into public.audace_audit(actor,operation,target) values (actor_id,p_action,p_order::text);
    end if;
    return;
  end if;
  select * into existing from public.audace_orders where id = p_order for update;
  if not found then raise exception using errcode = 'P0001', message = 'order_missing'; end if;
  expected := case p_action when 'processing' then 'unfulfilled' when 'shipped' then 'processing' when 'delivered' then 'shipped' end;
  if existing.payment_status <> 'paid' or expected is null or existing.fulfilment_status <> expected then
    raise exception using errcode = 'P0001', message = 'invalid_transition';
  end if;
  update public.audace_orders set fulfilment_status=p_action,updated_at=clock_timestamp() where id=p_order;
  insert into public.audace_order_history(order_id,actor,payment_status,fulfilment_status,event)
  values (p_order,actor_id,'paid',p_action,'fulfilment_updated');
  insert into public.audace_audit(actor,operation,target,details)
  values (actor_id,'fulfilment_updated',p_order::text,jsonb_build_object('status',p_action));
end
$$;

create function public.audace_admin_inventory(p_search text,p_filter text,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
  perform audace_private.require_admin();
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
    select s.id,s.code,s.size,s.active,v.colour,v.sleeve,b.on_hand,stock.free_units as available,
      stock.free_units <= cfg.threshold as low
    from public.audace_skus s join public.audace_variants v on v.id=s.variant_id
    join public.audace_stock b on b.sku_id=s.id
    cross join lateral (select audace_private.available(s.id,b.on_hand,statement_timestamp()) as free_units) stock
    cross join lateral (select coalesce((select low_stock_threshold from public.audace_settings where singleton),3) as threshold) cfg
    where (p_filter is null or p_filter = '' or
      (p_filter = 'out' and s.active and stock.free_units=0) or
      (p_filter = 'low' and s.active and stock.free_units between 1 and cfg.threshold) or
      (p_filter = 'inactive' and not s.active))
      and (coalesce(p_search,'') = '' or strpos(lower(concat_ws(' ',s.code,s.size,v.colour,v.sleeve)),lower(left(p_search,100))) > 0)
    order by s.code limit 51 offset greatest(coalesce(p_offset,0),0)
  ) x;
  return result;
end
$$;

create function public.audace_admin_metrics() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare orders jsonb;
declare stock jsonb;
begin
  perform audace_private.require_admin();
  select jsonb_build_object('total',count(*),
    'pending',count(*) filter (where payment_status='pending' and expires_at > statement_timestamp()),
    'paid',count(*) filter (where payment_status='paid' and verified_at is not null),
    'fulfilment',count(*) filter (where payment_status='paid' and fulfilment_status in ('unfulfilled','processing','shipped')),
    'revenue',coalesce(sum(total_pesewas) filter (where payment_status='paid' and verified_at is not null),0)::text)
  into orders from public.audace_orders;
  select jsonb_build_object('out',count(*) filter (where a.free_units=0),
    'low',count(*) filter (where a.free_units between 1 and cfg.threshold))
  into stock from public.audace_stock b join public.audace_skus s on s.id=b.sku_id and s.active
    cross join lateral (select audace_private.available(b.sku_id,b.on_hand,statement_timestamp()) as free_units) a
    cross join lateral (select coalesce((select low_stock_threshold from public.audace_settings where singleton),3) as threshold) cfg;
  return orders || stock;
end
$$;

revoke all on function public.audace_set_product(text,text,text,boolean),public.audace_set_variant(text,bigint,boolean),
  public.audace_add_size(text,text,text),public.audace_set_size_active(uuid,boolean),
  public.audace_adjust_stock(uuid,integer,integer,text),public.audace_set_delivery(uuid,text,text,bigint,boolean),
  public.audace_set_settings(integer,text),public.audace_admin_order_action(uuid,text),
  public.audace_admin_inventory(text,text,integer),public.audace_admin_metrics()
  from public, anon, authenticated, service_role;
grant execute on function public.audace_set_product(text,text,text,boolean),public.audace_set_variant(text,bigint,boolean),
  public.audace_add_size(text,text,text),public.audace_set_size_active(uuid,boolean),
  public.audace_adjust_stock(uuid,integer,integer,text),public.audace_set_delivery(uuid,text,text,bigint,boolean),
  public.audace_set_settings(integer,text),public.audace_admin_order_action(uuid,text),
  public.audace_admin_inventory(text,text,integer),public.audace_admin_metrics() to authenticated;
