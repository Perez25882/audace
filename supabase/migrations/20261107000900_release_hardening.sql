-- Preserve financial evidence arriving after fulfilment has begun.
-- Record explicit application schema access so a dump/restore does not depend on template defaults.
grant usage on schema public to anon,authenticated,service_role;

create or replace function audace_private.payment_order_guard() returns trigger
language plpgsql set search_path=''
as $$
begin
  if exists(select from public.audace_payment_attempts where order_id=old.id)
    and row(new.subtotal_pesewas,new.delivery_pesewas,new.delivery_id,new.delivery_label,new.request_id,new.request_hash,new.access_hash,new.checkout_lines)
    is distinct from row(old.subtotal_pesewas,old.delivery_pesewas,old.delivery_id,old.delivery_label,old.request_id,old.request_hash,old.access_hash,old.checkout_lines) then
    raise exception 'immutable_order';
  end if;
  -- A hold must block the NEXT fulfilment transition, not the recording of that hold.
  if new.fulfilment_status is distinct from old.fulfilment_status
    and new.fulfilment_status in ('processing','shipped','delivered') and
    (new.allocation_status <> 'allocated' or new.financial_review
      or not exists(select from public.audace_payment_receipts where order_id=new.id and resolution='allocated')) then
    raise exception 'payment_review_required';
  end if;
  return new;
end $$;
revoke all on function audace_private.payment_order_guard() from public,anon,authenticated,service_role;

-- Owner exception resolution accepts a 500-character reason; retain the whole audit reason.
alter table public.audace_movements drop constraint audace_movements_reason_check;
alter table public.audace_movements add constraint audace_movements_reason_check
  check (length(btrim(reason)) between 1 and 500);

create table audace_private.worker_heartbeats (
  name text primary key check (name='payments'),
  last_run_at timestamptz not null,
  claimed integer not null check (claimed between 0 and 5),
  processed integer not null check (processed between 0 and claimed)
);
revoke all on audace_private.worker_heartbeats from public,anon,authenticated,service_role;

create function public.audace_worker_heartbeat(p_claimed integer,p_processed integer) returns void
language sql security definer set search_path=''
as $$
  insert into audace_private.worker_heartbeats(name,last_run_at,claimed,processed)
  values('payments',clock_timestamp(),p_claimed,p_processed)
  on conflict(name) do update set last_run_at=excluded.last_run_at,claimed=excluded.claimed,processed=excluded.processed
$$;

create function public.audace_operational_health() returns jsonb
language sql stable security definer set search_path=''
as $$
  with queue as (
    select count(*) filter(where state='ready' and next_at<=statement_timestamp()) as due,
      count(*) filter(where state='ready' and next_at<statement_timestamp()-interval '5 minutes') as overdue,
      count(*) filter(where state='review') as manual_review,
      count(*) filter(where state='ready' and last_error is not null) as retry_jobs
    from public.audace_payment_jobs
  ), orders as (
    select count(*) filter(where allocation_status='review') as inventory_review,
      count(*) filter(where financial_review) as financial_review,
      count(*) filter(where allocation_status='allocated' and
        (payment_status<>'paid' or not exists(select from public.audace_payment_receipts r where r.order_id=o.id and r.resolution='allocated'))) as inconsistent
    from public.audace_orders o
  ), worker as (
    select max(last_run_at) as last_run from audace_private.worker_heartbeats
  )
  select jsonb_build_object(
    'status',case when coalesce(last_run>statement_timestamp()-interval '5 minutes',false) and overdue=0 and inconsistent=0
      and retry_jobs=0 and manual_review=0 and inventory_review=0 and financial_review=0 then 'healthy' else 'degraded' end,
    'dueJobs',due,'overdueJobs',overdue,'manualReviewJobs',manual_review,'retryJobs',retry_jobs,
    'inventoryReviewOrders',inventory_review,'financialReviewOrders',financial_review,
    'inconsistentAllocations',inconsistent,'workerRecent',coalesce(last_run>statement_timestamp()-interval '5 minutes',false),
    'lastWorkerRun',last_run)
  from queue,orders,worker
$$;
revoke all on function public.audace_worker_heartbeat(integer,integer),public.audace_operational_health()
  from public,anon,authenticated,service_role;
grant execute on function public.audace_worker_heartbeat(integer,integer),public.audace_operational_health() to service_role;
