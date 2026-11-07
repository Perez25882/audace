create function public.audace_payment_apply(p_reference text,p_data jsonb) returns text
language plpgsql security definer set search_path=''
as $$
declare attempt public.audace_payment_attempts%rowtype;
declare order_row public.audace_orders%rowtype;
declare receipt public.audace_payment_receipts%rowtype;
declare provider text := p_data->>'providerId';
declare provider_state text := p_data->>'status';
declare allocated boolean := false;
declare email text;
begin
  select o.* into order_row from public.audace_orders o join public.audace_payment_attempts a on a.order_id=o.id
    where a.reference=p_reference for update of o;
  if not found then raise exception 'unknown_payment'; end if;
  select * into attempt from public.audace_payment_attempts where reference=p_reference for update;
  select c.email into email from public.audace_order_contacts c where c.order_id=order_row.id;

  if p_data->>'reference' is distinct from attempt.reference
    or p_data->>'domain' is distinct from attempt.environment
    or p_data->>'currency' is distinct from attempt.currency
    or p_data->>'orderId' is distinct from attempt.order_id::text
    or p_data->>'attemptId' is distinct from attempt.id::text
    or p_data->>'email' is distinct from email
    or coalesce(p_data->>'amount','') !~ '^[0-9]{1,14}$'
    or (p_data->>'amount')::bigint is distinct from attempt.expected_pesewas
    or provider_state is null or provider_state not in ('success','failed','abandoned','pending','ongoing','processing','queued','reversed')
  then
    update public.audace_payment_attempts set state='review',last_error='verification_mismatch',updated_at=clock_timestamp() where id=attempt.id;
    update public.audace_orders set financial_review=true where id=order_row.id and payment_status='paid';
    insert into public.audace_payment_history(attempt_id,event) values(attempt.id,'verification_rejected');
    return 'review';
  end if;

  if provider_state <> 'success' then
    if attempt.state='success' then
      if provider_state='reversed' then
        update public.audace_orders set financial_review=true,updated_at=clock_timestamp() where id=order_row.id;
        insert into public.audace_payment_history(attempt_id,event) values(attempt.id,'reversal_review');
        return 'review';
      end if;
      return 'success';
    end if;
    if provider_state='reversed' then
      update public.audace_payment_attempts set state='review',provider_status=provider_state,updated_at=clock_timestamp() where id=attempt.id;
      update public.audace_orders set financial_review=true where id=order_row.id;
      return 'review';
    end if;
    update public.audace_payment_attempts set state=case when provider_state in ('failed','abandoned') then provider_state else 'pending' end,
      provider_status=provider_state,updated_at=clock_timestamp() where id=attempt.id;
    if provider_state in ('failed','abandoned') and order_row.payment_status='pending' then
      perform audace_private.stop_order(order_row.id,'failed','provider_' || provider_state,null);
    end if;
    if attempt.provider_status is distinct from provider_state then
      insert into public.audace_payment_history(attempt_id,event,details)
      values(attempt.id,'provider_status',jsonb_build_object('status',provider_state));
    end if;
    return case when provider_state in ('failed','abandoned') then provider_state else 'pending' end;
  end if;

  if provider is null or provider !~ '^[0-9]{1,20}$' or p_data->>'channel' is null
    or length(p_data->>'channel') not between 1 and 40 or p_data->>'paidAt' is null then
    raise exception 'invalid_verification';
  end if;
  select * into receipt from public.audace_payment_receipts where provider_id=provider or attempt_id=attempt.id;
  if found then
    if receipt.attempt_id <> attempt.id or receipt.provider_id <> provider then
      update public.audace_payment_attempts set state='review',last_error='transaction_conflict' where id=attempt.id;
      update public.audace_orders set financial_review=true where id in (order_row.id,receipt.order_id);
      insert into public.audace_payment_history(attempt_id,event) values(attempt.id,'transaction_conflict');
      return 'review';
    end if;
    return case when order_row.allocation_status='allocated' and not order_row.financial_review then 'success' else 'review' end;
  end if;

  if order_row.payment_status='pending' and order_row.expires_at>clock_timestamp()
    and not exists(select from public.audace_payment_receipts where order_id=order_row.id) then
    begin
      allocated := public.audace_finalize_verified(order_row.id,attempt.reference,attempt.expected_pesewas,'GHS');
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'reservation_unavailable' then raise; end if;
      allocated := false;
    end;
  end if;

  insert into public.audace_payment_receipts(provider_id,attempt_id,order_id,amount_pesewas,currency,environment,channel,resolution,paid_at)
  values(provider,attempt.id,order_row.id,attempt.expected_pesewas,'GHS','test',p_data->>'channel',
    case when allocated then 'allocated'
      when exists(select from public.audace_payment_receipts where order_id=order_row.id) then 'duplicate'
      else 'inventory_review' end,(p_data->>'paidAt')::timestamptz);

  update public.audace_payment_attempts set state='success',provider_status='success',provider_channel=p_data->>'channel',
    last_error=null,updated_at=clock_timestamp() where id=attempt.id;
  if allocated then
    update public.audace_orders set allocation_status='allocated',updated_at=clock_timestamp() where id=order_row.id;
  elsif order_row.payment_status='paid' then
    update public.audace_orders set financial_review=true,updated_at=clock_timestamp() where id=order_row.id;
  else
    update public.audace_orders set payment_status='paid',fulfilment_status='unfulfilled',allocation_status='review',
      verified_at=clock_timestamp(),verified_reference=attempt.reference,updated_at=clock_timestamp() where id=order_row.id;
    update public.audace_reservations set state='released',updated_at=clock_timestamp() where order_id=order_row.id and state='held';
    insert into public.audace_order_history(order_id,payment_status,fulfilment_status,event)
    values(order_row.id,'paid','unfulfilled','paid_inventory_review');
  end if;
  insert into public.audace_payment_history(attempt_id,event,details)
  values(attempt.id,'payment_verified',jsonb_build_object('providerId',provider,'allocated',allocated));
  return case when allocated then 'success' else 'review' end;
end $$;
revoke all on function public.audace_payment_apply(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.audace_payment_apply(text,jsonb) to service_role;
revoke execute on function public.audace_finalize_verified(uuid,text,bigint,text) from service_role;

create function audace_private.payment_order_guard() returns trigger language plpgsql set search_path=''
as $$
begin
  if exists(select from public.audace_payment_attempts where order_id=old.id)
    and row(new.subtotal_pesewas,new.delivery_pesewas,new.delivery_id,new.delivery_label,new.request_id,new.request_hash,new.access_hash,new.checkout_lines)
    is distinct from row(old.subtotal_pesewas,old.delivery_pesewas,old.delivery_id,old.delivery_label,old.request_id,old.request_hash,old.access_hash,old.checkout_lines) then
    raise exception 'immutable_order';
  end if;
  if new.fulfilment_status in ('processing','shipped','delivered') and
    (new.allocation_status <> 'allocated' or new.financial_review
      or not exists(select from public.audace_payment_receipts where order_id=new.id and resolution='allocated')) then
    raise exception 'payment_review_required';
  end if;
  return new;
end $$;
create trigger payment_order_guard before update on public.audace_orders
for each row execute function audace_private.payment_order_guard();
revoke all on function audace_private.payment_order_guard() from public,anon,authenticated,service_role;

create function public.audace_resolve_inventory(p_order uuid,p_reason text) returns void
language plpgsql security definer set search_path=''
as $$
declare actor_id uuid := audace_private.require_admin(true);
declare order_row public.audace_orders%rowtype;
declare item record;
declare balance integer;
begin
  if coalesce(length(btrim(p_reason)),0) not between 1 and 500 then raise exception 'reason_required'; end if;
  select * into order_row from public.audace_orders where id=p_order for update;
  if not found or order_row.payment_status <> 'paid' or order_row.allocation_status <> 'review' or order_row.financial_review
    or (select count(*) from public.audace_payment_receipts where order_id=p_order) <> 1 then
    raise exception 'resolution_unavailable';
  end if;
  perform b.sku_id from public.audace_stock b join public.audace_order_items i on i.sku_id=b.sku_id
    where i.order_id=p_order order by b.sku_id for update of b;
  for item in select i.sku_id,i.quantity from public.audace_order_items i where i.order_id=p_order order by sku_id
  loop
    select on_hand into balance from public.audace_stock where sku_id=item.sku_id;
    if not found or audace_private.available(item.sku_id,balance,clock_timestamp()) < item.quantity then raise exception 'insufficient_stock'; end if;
    update public.audace_stock set on_hand=on_hand-item.quantity,updated_at=clock_timestamp() where sku_id=item.sku_id returning on_hand into balance;
    insert into public.audace_movements(sku_id,order_id,actor,delta,balance,reason)
    values(item.sku_id,p_order,actor_id,-item.quantity,balance,btrim(p_reason));
  end loop;
  update public.audace_payment_receipts set resolution='allocated' where order_id=p_order;
  update public.audace_reservations set state='finalized',updated_at=clock_timestamp() where order_id=p_order;
  update public.audace_orders set allocation_status='allocated',updated_at=clock_timestamp() where id=p_order;
  insert into public.audace_audit(actor,operation,target,details) values(actor_id,'inventory_review_resolved',p_order::text,jsonb_build_object('reason',btrim(p_reason)));
  insert into public.audace_order_history(order_id,actor,payment_status,fulfilment_status,event)
  values(p_order,actor_id,'paid','unfulfilled','inventory_review_resolved');
end $$;

create function public.audace_admin_verify(p_attempt uuid) returns text
language plpgsql security definer set search_path=''
as $$
declare actor_id uuid := audace_private.require_admin();
declare attempt public.audace_payment_attempts%rowtype;
begin
  perform o.id from public.audace_orders o join public.audace_payment_attempts a on a.order_id=o.id
    where a.id=p_attempt for update of o;
  select * into attempt from public.audace_payment_attempts where id=p_attempt for update;
  if not found or attempt.next_verification_at > clock_timestamp() then raise exception 'verification_rate_limited'; end if;
  update public.audace_payment_attempts set next_verification_at=clock_timestamp()+interval '30 seconds' where id=p_attempt;
  insert into public.audace_payment_jobs(attempt_id) values(p_attempt)
  on conflict(attempt_id) do update set state='ready',next_at=clock_timestamp(),
    generation=audace_payment_jobs.generation+1,updated_at=clock_timestamp();
  insert into public.audace_payment_history(attempt_id,event,actor) values(p_attempt,'admin_reverification',actor_id);
  insert into public.audace_audit(actor,operation,target) values(actor_id,'payment_reverification',p_attempt::text);
  return attempt.reference;
end $$;

create function public.audace_request_refund_review(p_request uuid,p_provider text,p_amount bigint,p_reason text) returns uuid
language plpgsql security definer set search_path=''
as $$
declare actor_id uuid := audace_private.require_admin(true);
declare receipt public.audace_payment_receipts%rowtype;
declare existing public.audace_refund_requests%rowtype;
declare reserved bigint;
declare order_uuid uuid;
begin
  select order_id into order_uuid from public.audace_payment_receipts where provider_id=p_provider;
  if not found then raise exception 'payment_missing'; end if;
  perform id from public.audace_orders where id=order_uuid for update;
  select * into existing from public.audace_refund_requests where request_id=p_request;
  if found then
    if existing.provider_id <> p_provider or existing.amount_pesewas <> p_amount or existing.reason <> btrim(p_reason) then
      raise exception 'refund_request_conflict';
    end if;
    return existing.id;
  end if;
  select * into receipt from public.audace_payment_receipts where provider_id=p_provider;
  select coalesce(sum(amount_pesewas),0) into reserved from public.audace_refund_requests where provider_id=p_provider and state <> 'failed';
  if p_request is null or p_amount is null or p_amount<=0 or p_amount+reserved>receipt.amount_pesewas
    or coalesce(length(btrim(p_reason)),0) not between 1 and 500 then raise exception 'invalid_refund_review'; end if;
  insert into public.audace_refund_requests(request_id,provider_id,order_id,amount_pesewas,reason,actor)
  values(p_request,p_provider,receipt.order_id,p_amount,btrim(p_reason),actor_id) returning * into existing;
  insert into public.audace_audit(actor,operation,target,details)
  values(actor_id,'refund_review_requested',existing.id::text,jsonb_build_object('amount',p_amount));
  return existing.id;
end $$;

create or replace function public.audace_admin_metrics() returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare orders jsonb;
declare stock jsonb;
begin
  perform audace_private.require_admin();
  select jsonb_build_object('total',count(*),'pending',count(*) filter(where payment_status='pending' and expires_at>statement_timestamp()),
    'paid',count(*) filter(where payment_status='paid' and verified_at is not null),
    'fulfilment',count(*) filter(where payment_status='paid' and allocation_status='allocated' and not financial_review and fulfilment_status in ('unfulfilled','processing','shipped')),
    'review',count(*) filter(where allocation_status='review' or financial_review or exists(
      select from public.audace_payment_attempts a left join public.audace_payment_jobs j on j.attempt_id=a.id
      where a.order_id=o.id and (a.state='review' or j.state='review'))),
    'revenue',coalesce(sum(total_pesewas) filter(where payment_status='paid' and allocation_status='allocated' and not financial_review
      and exists(select from public.audace_payment_receipts r where r.order_id=o.id and r.resolution='allocated')),0)::text)
  into orders from public.audace_orders o;
  select jsonb_build_object('out',count(*) filter(where a.free_units=0),'low',count(*) filter(where a.free_units between 1 and cfg.threshold))
  into stock from public.audace_stock b join public.audace_skus s on s.id=b.sku_id and s.active
    cross join lateral(select audace_private.available(b.sku_id,b.on_hand,statement_timestamp()) as free_units) a
    cross join lateral(select coalesce((select low_stock_threshold from public.audace_settings where singleton),3) as threshold) cfg;
  return orders || stock;
end $$;

revoke all on function public.audace_resolve_inventory(uuid,text),public.audace_admin_verify(uuid),
  public.audace_request_refund_review(uuid,text,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.audace_resolve_inventory(uuid,text),public.audace_admin_verify(uuid),
  public.audace_request_refund_review(uuid,text,bigint,text) to authenticated;

revoke execute on function public.audace_place_pending(uuid,jsonb,uuid,jsonb) from service_role;
