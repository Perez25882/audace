alter table public.audace_orders
  add column checkout_lines jsonb check (jsonb_typeof(checkout_lines) = 'array'),
  add column access_hash text check (access_hash ~ '^[0-9a-f]{64}$'),
  add column allocation_status text not null default 'unpaid' check (allocation_status in ('unpaid','allocated','review')),
  add column financial_review boolean not null default false;

-- Historical verification alone does not establish provider receipts.
update public.audace_orders set allocation_status = 'review', financial_review = true where payment_status in ('paid','refunded');

create table public.audace_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.audace_orders(id),
  reference text not null unique default ('ADT-' || replace(gen_random_uuid()::text,'-','')),
  environment text not null default 'test' check (environment = 'test'),
  expected_pesewas bigint not null check (expected_pesewas between 1 and 10000000000000),
  currency text not null default 'GHS' check (currency = 'GHS'),
  state text not null default 'created' check (state in ('created','initializing','initialized','pending','success','failed','abandoned','review')),
  provider_status text,
  provider_channel text,
  authorization_url text check (length(authorization_url) <= 1000),
  init_lease uuid,
  init_lease_until timestamptz,
  next_verification_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index audace_one_active_attempt on public.audace_payment_attempts(order_id)
  where state in ('created','initializing','initialized','pending');
create index audace_payment_attempts_order on public.audace_payment_attempts(order_id,created_at desc);

create table public.audace_payment_receipts (
  provider_id text primary key check (provider_id ~ '^[0-9]{1,20}$' and provider_id::numeric between 1 and 18446744073709551615),
  attempt_id uuid not null unique references public.audace_payment_attempts(id),
  order_id uuid not null references public.audace_orders(id),
  amount_pesewas bigint not null check (amount_pesewas between 1 and 10000000000000),
  currency text not null check (currency = 'GHS'),
  environment text not null check (environment = 'test'),
  channel text not null check (length(channel) between 1 and 40),
  resolution text not null check (resolution in ('allocated','inventory_review','duplicate')),
  paid_at timestamptz not null,
  verified_at timestamptz not null default now()
);
create index audace_receipts_order on public.audace_payment_receipts(order_id);

create table public.audace_payment_events (
  id text primary key check (id ~ '^[0-9a-f]{64}$'),
  event_type text not null check (length(event_type) <= 80),
  reference text check (length(reference) <= 120),
  provider_id text check (length(provider_id) <= 80),
  evidence jsonb not null default '{}',
  duplicates integer not null default 0 check (duplicates >= 0),
  received_at timestamptz not null default now()
);
create index audace_payment_events_ref on public.audace_payment_events(reference,received_at desc);

create table public.audace_payment_jobs (
  attempt_id uuid primary key references public.audace_payment_attempts(id),
  state text not null default 'ready' check (state in ('ready','done','review')),
  next_at timestamptz not null default now(),
  lease uuid,
  lease_until timestamptz,
  generation bigint not null default 0,
  claimed_generation bigint,
  runs integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);
create index audace_payment_jobs_due on public.audace_payment_jobs(next_at) where state = 'ready';

create table public.audace_payment_history (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references public.audace_payment_attempts(id),
  event text not null,
  details jsonb not null default '{}',
  actor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index audace_payment_history_attempt on public.audace_payment_history(attempt_id,id);

create table public.audace_refund_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  provider_id text not null references public.audace_payment_receipts(provider_id),
  order_id uuid not null references public.audace_orders(id),
  amount_pesewas bigint not null check (amount_pesewas > 0),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  state text not null default 'requested' check (state in ('requested','pending','processing','needs_attention','failed','processed')),
  provider_reference text unique,
  verified_at timestamptz,
  actor uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (state <> 'processed' or (verified_at is not null and provider_reference is not null))
);

create table public.audace_disputes (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.audace_orders(id),
  provider_id text not null,
  event_type text not null,
  state text not null default 'review',
  created_at timestamptz not null default now(),
  unique (provider_id,event_type)
);

create table audace_private.payment_limits (
  bucket text primary key,
  count integer not null,
  expires_at timestamptz not null
);

do $$
declare t text;
begin
  foreach t in array array['payment_attempts','payment_receipts','payment_events','payment_jobs','payment_history','refund_requests','disputes']
  loop
    execute format('alter table public.%I enable row level security','audace_' || t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role','audace_' || t);
    execute format('grant select on table public.%I to authenticated','audace_' || t);
    execute format('create policy admin_read on public.%I for select to authenticated using ((select public.audace_admin_role()) is not null)','audace_' || t);
  end loop;
end $$;

create function audace_private.payment_immutable() returns trigger language plpgsql set search_path = ''
as $$
begin
  if row(new.order_id,new.reference,new.environment,new.expected_pesewas,new.currency)
    is distinct from row(old.order_id,old.reference,old.environment,old.expected_pesewas,old.currency) then
    raise exception using errcode='P0001',message='immutable_payment';
  end if;
  return new;
end $$;
create trigger immutable_payment before update on public.audace_payment_attempts
for each row execute function audace_private.payment_immutable();
revoke all on function audace_private.payment_immutable() from public,anon,authenticated,service_role;
