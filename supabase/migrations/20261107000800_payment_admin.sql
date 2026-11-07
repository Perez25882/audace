create function public.audace_admin_payments(p_search text default '',p_filter text default '',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
  perform audace_private.require_admin();
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
    select a.id,a.order_id,o.public_ref,a.reference,a.state,a.provider_status,a.provider_channel,a.expected_pesewas,a.created_at,
      o.allocation_status,o.financial_review,a.last_error,j.state as job_state,j.last_error as reconciliation_error
    from public.audace_payment_attempts a join public.audace_orders o on o.id=a.order_id
    left join public.audace_payment_jobs j on j.attempt_id=a.id
    where (coalesce(p_search,'')='' or strpos(lower(o.public_ref),lower(left(p_search,40)))>0)
      and (coalesce(p_filter,'')='' or (p_filter='pending' and a.state in ('created','initializing','initialized','pending'))
        or (p_filter='failed' and a.state in ('failed','abandoned'))
        or (p_filter='review' and (a.state='review' or o.allocation_status='review' or o.financial_review or j.state='review'))
        or (p_filter='success' and a.state='success'))
    order by a.created_at desc,a.id limit 51 offset greatest(coalesce(p_offset,0),0)
  ) x;
  return result;
end $$;

create function public.audace_admin_payment_detail(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
begin
  perform audace_private.require_admin();
  return jsonb_build_object(
    'attempts',(select coalesce(jsonb_agg(to_jsonb(a) - 'authorization_url' order by a.created_at),'[]') from public.audace_payment_attempts a where a.order_id=p_order),
    'receipts',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.audace_payment_receipts r where r.order_id=p_order),
    'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.id),'[]') from public.audace_payment_history h
      join public.audace_payment_attempts a on a.id=h.attempt_id where a.order_id=p_order),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.received_at),'[]') from public.audace_payment_events e
      join public.audace_payment_attempts a on a.reference=e.reference where a.order_id=p_order),
    'refunds',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at),'[]') from public.audace_refund_requests r where r.order_id=p_order),
    'disputes',(select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at),'[]') from public.audace_disputes d where d.order_id=p_order)
  );
end $$;

revoke all on function public.audace_admin_payments(text,text,integer),public.audace_admin_payment_detail(uuid) from public,anon,authenticated,service_role;
grant execute on function public.audace_admin_payments(text,text,integer),public.audace_admin_payment_detail(uuid) to authenticated;
