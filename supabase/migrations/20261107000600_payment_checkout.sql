create function public.audace_payment_rate(p_bucket text,p_limit integer) returns boolean
language plpgsql security definer set search_path=''
as $$
declare used integer;
begin
  if p_bucket !~ '^[a-z0-9:-]{1,100}$' or p_limit not between 1 and 200 then return false; end if;
  insert into audace_private.payment_limits(bucket,count,expires_at) values(p_bucket,1,clock_timestamp()+interval '1 minute')
  on conflict(bucket) do update set count=case when payment_limits.expires_at <= clock_timestamp() then 1 else payment_limits.count+1 end,
    expires_at=case when payment_limits.expires_at <= clock_timestamp() then clock_timestamp()+interval '1 minute' else payment_limits.expires_at end
  returning count into used;
  delete from audace_private.payment_limits where expires_at < clock_timestamp()-interval '1 day';
  return used <= p_limit;
end $$;

create function public.audace_payment_begin(p_request uuid,p_access text,p_lines jsonb,p_delivery uuid,p_contact jsonb,p_expected bigint) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare existing public.audace_orders%rowtype;
declare attempt public.audace_payment_attempts%rowtype;
declare quote jsonb;
declare created jsonb;
begin
  if p_request is null or p_access !~ '^[0-9a-f]{64}$' or p_access is null or p_expected is null or p_expected < 1 then
    raise exception using errcode='22023',message='invalid_checkout';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,1703));
  select * into existing from public.audace_orders where request_id=p_request for update;
  if found then
    if existing.access_hash is distinct from p_access then raise exception using errcode='42501',message='order_access_denied'; end if;
    if existing.request_hash is distinct from sha256(convert_to(jsonb_build_array(p_lines,p_delivery,p_contact)::text,'UTF8')) then
      raise exception using errcode='23505',message='request_conflict';
    end if;
  else
    created := public.audace_place_pending(p_request,p_lines,p_delivery,p_contact);
    select * into existing from public.audace_orders where id=(created->>'id')::uuid for update;
    update public.audace_orders set access_hash=p_access,checkout_lines=p_lines where id=existing.id;
  end if;
  if existing.total_pesewas <> p_expected then raise exception using errcode='P0001',message='price_changed'; end if;
  if existing.financial_review or existing.allocation_status='review' then
    raise exception using errcode='P0001',message='order_review_required';
  end if;

  select * into attempt from public.audace_payment_attempts where order_id=existing.id
    order by created_at desc,id desc limit 1;
  if attempt.id is null or (attempt.state in ('failed','abandoned') and existing.payment_status in ('failed','cancelled')) then
    if (select count(*) from public.audace_payment_attempts where order_id=existing.id) >= 5
      or exists(select from public.audace_payment_receipts where order_id=existing.id) then
      raise exception using errcode='P0001',message='retry_unavailable';
    end if;
    if attempt.id is not null then
      quote := audace_private.quote(p_lines,p_contact->>'region',p_delivery,true);
      if (quote->>'total')::bigint <> existing.total_pesewas then raise exception using errcode='P0001',message='price_changed'; end if;
      update public.audace_orders set payment_status='pending',fulfilment_status='unfulfilled',
        expires_at=clock_timestamp()+interval '15 minutes',updated_at=clock_timestamp() where id=existing.id
        returning * into existing;
      update public.audace_reservations set state='held',expires_at=existing.expires_at,updated_at=clock_timestamp() where order_id=existing.id;
      insert into public.audace_order_history(order_id,payment_status,fulfilment_status,event)
      values(existing.id,'pending','unfulfilled','payment_retry_reserved');
    end if;
    insert into public.audace_payment_attempts(order_id,expected_pesewas) values(existing.id,existing.total_pesewas) returning * into attempt;
    insert into public.audace_payment_jobs(attempt_id) values(attempt.id);
    insert into public.audace_payment_history(attempt_id,event) values(attempt.id,'attempt_created');
  end if;
  return jsonb_build_object('orderId',existing.id,'attemptId',attempt.id,'reference',attempt.reference,
    'amount',attempt.expected_pesewas,'state',attempt.state,'authorizationUrl',attempt.authorization_url);
end $$;

create function public.audace_payment_context(p_reference text) returns jsonb
language sql stable security definer set search_path=''
as $$
select jsonb_build_object('attemptId',a.id,'orderId',o.id,'reference',a.reference,'amount',a.expected_pesewas,
  'currency',a.currency,'environment',a.environment,'email',c.email,'state',a.state,'authorizationUrl',a.authorization_url,
  'expiresAt',o.expires_at,'payment',o.payment_status)
from public.audace_payment_attempts a join public.audace_orders o on o.id=a.order_id
join public.audace_order_contacts c on c.order_id=o.id where a.reference=p_reference
$$;

create function public.audace_payment_claim_init(p_attempt uuid) returns uuid
language plpgsql security definer set search_path=''
as $$
declare token uuid := gen_random_uuid();
declare existing public.audace_payment_attempts%rowtype;
declare order_row public.audace_orders%rowtype;
begin
  select o.* into order_row from public.audace_orders o join public.audace_payment_attempts a on a.order_id=o.id where a.id=p_attempt for update of o;
  if not found or order_row.payment_status <> 'pending' or order_row.expires_at <= clock_timestamp() then return null; end if;
  select * into existing from public.audace_payment_attempts where id=p_attempt for update;
  if existing.state not in ('created','initializing') or existing.authorization_url is not null
    or existing.init_lease_until > clock_timestamp() then return null; end if;
  update public.audace_payment_attempts set state='initializing',init_lease=token,init_lease_until=clock_timestamp()+interval '45 seconds',
    updated_at=clock_timestamp() where id=p_attempt;
  return token;
end $$;

create function public.audace_payment_save_init(p_attempt uuid,p_lease uuid,p_url text,p_error text) returns boolean
language plpgsql security definer set search_path=''
as $$
begin
  if p_url is not null and (length(p_url)>1000 or p_url !~ '^https?://') then raise exception 'invalid_checkout_url'; end if;
  update public.audace_payment_attempts set authorization_url=p_url,state=case when p_url is null then 'created' else 'initialized' end,
    last_error=left(p_error,80),init_lease=null,init_lease_until=null,updated_at=clock_timestamp()
    where id=p_attempt and init_lease=p_lease and state='initializing';
  if not found then return false; end if;
  insert into public.audace_payment_history(attempt_id,event,details)
  values(p_attempt,case when p_url is null then 'initialization_uncertain' else 'checkout_initialized' end,
    jsonb_build_object('error',left(p_error,80)));
  return true;
end $$;

create function public.audace_payment_access(p_order uuid,p_access text) returns jsonb
language sql stable security definer set search_path=''
as $$
select jsonb_build_object(
  'orderId',o.id,'reference',o.public_ref,'payment',o.payment_status,'allocation',o.allocation_status,'review',o.financial_review,
  'fulfilment',o.fulfilment_status,'amount',o.total_pesewas,'subtotal',o.subtotal_pesewas,'deliveryFee',o.delivery_pesewas,
  'deliveryMethod',o.delivery_label,'expiresAt',o.expires_at,'canResume',o.expires_at>statement_timestamp(),
  'attempt',(select jsonb_build_object('reference',a.reference,'state',a.state,'providerStatus',a.provider_status,
    'authorizationUrl',a.authorization_url) from public.audace_payment_attempts a where a.order_id=o.id order by a.created_at desc,a.id desc limit 1),
  'verified',exists(select from public.audace_payment_receipts r where r.order_id=o.id),
  'items',(select coalesce(jsonb_agg(jsonb_build_object('variantId',s.variant_id,'name',i.product_name,'colour',i.colour,
    'sleeve',i.sleeve,'size',i.size,'quantity',i.quantity,'unitPesewas',i.price_pesewas) order by i.sku),'[]')
    from public.audace_order_items i join public.audace_skus s on s.id=i.sku_id where i.order_id=o.id),
  'delivery',(select jsonb_build_object('name',c.name,'region',c.region,'city',c.city,'address',c.address,'directions',c.directions)
    from public.audace_order_contacts c where c.order_id=o.id)
) from public.audace_orders o where o.id=p_order and o.access_hash=p_access and p_access ~ '^[0-9a-f]{64}$'
$$;

create function public.audace_payment_record_event(p_id text,p_type text,p_ref text,p_provider text,p_evidence jsonb) returns boolean
language plpgsql security definer set search_path=''
as $$
declare attempt uuid;
declare order_uuid uuid;
begin
  if p_id !~ '^[0-9a-f]{64}$' or p_type not in ('charge.success','refund.pending','refund.processing','refund.needs-attention',
    'refund.failed','refund.processed','charge.dispute.create','charge.dispute.remind','charge.dispute.resolve')
    or octet_length(p_evidence::text)>3000 then raise exception 'invalid_event'; end if;
  insert into public.audace_payment_events(id,event_type,reference,provider_id,evidence)
  values(p_id,p_type,p_ref,p_provider,p_evidence) on conflict(id) do nothing;
  if not found then
    update public.audace_payment_events set duplicates=duplicates+1 where id=p_id;
    return false;
  end if;
  select id,order_id into attempt,order_uuid from public.audace_payment_attempts where reference=p_ref;
  if attempt is not null then
    perform id from public.audace_orders where id=order_uuid for update;
    insert into public.audace_payment_history(attempt_id,event,details) values(attempt,'webhook_received',jsonb_build_object('type',p_type,'receipt',p_id));
    insert into public.audace_payment_jobs(attempt_id) values(attempt)
    on conflict(attempt_id) do update set state='ready',next_at=clock_timestamp(),
      generation=audace_payment_jobs.generation+1,updated_at=clock_timestamp();
    if p_type <> 'charge.success' then
      update public.audace_orders set financial_review=true,updated_at=clock_timestamp() where id=order_uuid;
      if p_type like 'charge.dispute.%' and p_provider is not null then
        insert into public.audace_disputes(order_id,provider_id,event_type) values(order_uuid,p_provider,p_type) on conflict do nothing;
      end if;
    end if;
  end if;
  return true;
end $$;

create function public.audace_payment_claim_jobs(p_limit integer default 5,p_attempt uuid default null) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
  with candidates as (
    select attempt_id from public.audace_payment_jobs
    where state='ready' and (p_attempt is null or attempt_id=p_attempt) and next_at <= clock_timestamp()
      and (lease_until is null or lease_until <= clock_timestamp())
    order by next_at,attempt_id limit least(greatest(coalesce(p_limit,5),1),5) for update skip locked
  ), claimed as (
    update public.audace_payment_jobs j set lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds',
      runs=runs+1,claimed_generation=j.generation,updated_at=clock_timestamp()
    from candidates c where j.attempt_id=c.attempt_id returning j.attempt_id,j.lease,j.runs
  )
  select coalesce(jsonb_agg(jsonb_build_object('attemptId',c.attempt_id,'lease',c.lease,'runs',c.runs,'reference',a.reference)),'[]')
  into result from claimed c join public.audace_payment_attempts a on a.id=c.attempt_id;
  return result;
end $$;

create function public.audace_payment_finish_job(p_attempt uuid,p_lease uuid,p_done boolean,p_error text) returns void
language plpgsql security definer set search_path=''
as $$
begin
  update public.audace_payment_jobs j set
    state=case when j.generation is distinct from j.claimed_generation then 'ready' when p_done then 'done'
      when a.created_at < clock_timestamp()-interval '7 days' then 'review' else 'ready' end,
    next_at=case when j.generation is distinct from j.claimed_generation then clock_timestamp()
      else clock_timestamp()+make_interval(secs => least(3600,30 * power(2,least(j.runs,7))::integer)) end,
    lease=null,lease_until=null,last_error=left(p_error,80),updated_at=clock_timestamp()
  from public.audace_payment_attempts a where j.attempt_id=p_attempt and a.id=j.attempt_id and j.lease=p_lease;
end $$;

create function public.audace_payment_request_check(p_order uuid,p_access text) returns text
language plpgsql security definer set search_path=''
as $$
declare attempt public.audace_payment_attempts%rowtype;
begin
  perform id from public.audace_orders where id=p_order and access_hash=p_access and p_access ~ '^[0-9a-f]{64}$' for update;
  if not found then
    raise exception using errcode='42501',message='order_access_denied';
  end if;
  select * into attempt from public.audace_payment_attempts where order_id=p_order order by created_at desc,id desc limit 1 for update;
  if not found or attempt.next_verification_at > clock_timestamp() then return null; end if;
  update public.audace_payment_attempts set next_verification_at=clock_timestamp()+interval '10 seconds' where id=attempt.id;
  insert into public.audace_payment_jobs(attempt_id) values(attempt.id)
  on conflict(attempt_id) do update set state='ready',next_at=clock_timestamp(),
    generation=audace_payment_jobs.generation+1,updated_at=clock_timestamp();
  return attempt.reference;
end $$;

do $$
declare fn regprocedure;
begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'audace_payment_%'
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',fn);
    execute format('grant execute on function %s to service_role',fn);
  end loop;
end $$;

create function public.audace_payment_retry_input(p_order uuid,p_access text) returns jsonb
language sql stable security definer set search_path=''
as $$
  select jsonb_build_object('requestId',o.request_id,'lines',o.checkout_lines,'total',o.total_pesewas,'deliveryId',o.delivery_id,
    'contact',jsonb_build_object('name',c.name,'email',c.email,'phone',c.phone,'region',c.region,'city',c.city,'address',c.address,'directions',c.directions))
  from public.audace_orders o join public.audace_order_contacts c on c.order_id=o.id
  where o.id=p_order and o.access_hash=p_access and p_access ~ '^[0-9a-f]{64}$'
$$;

create function public.audace_payment_note_error(p_attempt uuid,p_code text) returns void
language plpgsql security definer set search_path=''
as $$
begin
  if p_code <> 'verification_mismatch' then raise exception 'invalid_error'; end if;
  perform o.id from public.audace_orders o join public.audace_payment_attempts a on a.order_id=o.id
    where a.id=p_attempt for update of o;
  update public.audace_payment_attempts set state='review',last_error=p_code,updated_at=clock_timestamp() where id=p_attempt;
  update public.audace_orders set financial_review=true where payment_status='paid' and id=(select order_id from public.audace_payment_attempts where id=p_attempt);
  insert into public.audace_payment_history(attempt_id,event) values(p_attempt,p_code);
end $$;
revoke all on function public.audace_payment_retry_input(uuid,text),public.audace_payment_note_error(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.audace_payment_retry_input(uuid,text),public.audace_payment_note_error(uuid,text) to service_role;
