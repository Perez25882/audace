create schema if not exists audace_private;
revoke all on schema audace_private from public, anon, authenticated, service_role;

create table public.audace_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','operator')),
  created_at timestamptz not null default now()
);

create table public.audace_products (
  id text primary key check (id ~ '^[a-z0-9-]{1,80}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null check (length(btrim(description)) between 1 and 2000),
  specifications jsonb not null default '[]' check (jsonb_typeof(specifications) = 'array'),
  size_guide text check (length(size_guide) <= 2000),
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.audace_variants (
  id text primary key check (id ~ '^[a-z0-9-]{1,80}$'),
  product_id text not null references public.audace_products(id),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  code text not null unique check (code ~ '^[A-Z0-9-]{1,80}$'),
  colour text not null check (colour in ('Cream','Black','Burgundy','White')),
  sleeve text not null check (sleeve in ('Short sleeve','Long sleeve')),
  sort_order integer not null default 0,
  price_pesewas bigint check (price_pesewas between 0 and 1000000000),
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (product_id, colour, sleeve)
);

create table public.audace_images (
  variant_id text not null references public.audace_variants(id),
  position integer not null check (position > 0),
  path text not null check (path ~ '^/garments/[a-z0-9-]+[.]webp$'),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  alt text not null,
  label text not null,
  source_page integer not null check (source_page > 0),
  source_xref integer not null check (source_xref > 0),
  primary key (variant_id, position)
);

create table public.audace_skus (
  id uuid primary key default gen_random_uuid(),
  variant_id text not null references public.audace_variants(id),
  size text not null check (length(size) between 1 and 40 and size = btrim(size)),
  code text not null unique check (code ~ '^[A-Z0-9-]{1,120}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index audace_sku_size_key on public.audace_skus (variant_id, lower(size));

create table public.audace_stock (
  sku_id uuid primary key references public.audace_skus(id),
  on_hand integer not null default 0 check (on_hand between 0 and 1000000),
  updated_at timestamptz not null default now()
);

create table public.audace_delivery (
  id uuid primary key default gen_random_uuid(),
  region text not null check (region in ('Ahafo','Ashanti','Bono','Bono East','Central','Eastern',
    'Greater Accra','North East','Northern','Oti','Savannah','Upper East','Upper West','Volta','Western','Western North')),
  label text not null check (length(btrim(label)) between 1 and 100),
  fee_pesewas bigint not null check (fee_pesewas between 0 and 1000000000),
  active boolean not null default false,
  updated_at timestamptz not null default now()
);
create unique index audace_delivery_region_label on public.audace_delivery (region, lower(label));

create table public.audace_settings (
  singleton boolean primary key default true check (singleton),
  low_stock_threshold integer not null default 3 check (low_stock_threshold between 0 and 1000000),
  shipping_returns text check (length(shipping_returns) <= 3000),
  updated_at timestamptz not null default now()
);

create table public.audace_orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  request_hash bytea not null,
  public_ref text not null unique default ('AD-' || upper(replace(gen_random_uuid()::text, '-', ''))),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','cancelled','refunded')),
  fulfilment_status text not null default 'unfulfilled' check (fulfilment_status in ('unfulfilled','processing','shipped','delivered','cancelled')),
  verified_at timestamptz,
  verified_reference text unique,
  currency text not null default 'GHS' check (currency = 'GHS'),
  subtotal_pesewas bigint not null check (subtotal_pesewas >= 0),
  delivery_pesewas bigint not null check (delivery_pesewas >= 0),
  total_pesewas bigint generated always as (subtotal_pesewas + delivery_pesewas) stored,
  delivery_id uuid not null references public.audace_delivery(id),
  delivery_label text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((payment_status in ('paid','refunded') and verified_at is not null and verified_reference is not null)
      or (payment_status in ('pending','failed','cancelled') and verified_at is null and verified_reference is null)),
  check ((payment_status = 'pending' and fulfilment_status = 'unfulfilled')
      or (payment_status in ('failed','cancelled') and fulfilment_status = 'cancelled')
      or (payment_status = 'paid' and fulfilment_status in ('unfulfilled','processing','shipped','delivered'))
      or (payment_status = 'refunded' and fulfilment_status in ('cancelled','delivered')))
);
create index audace_orders_expiring on public.audace_orders (expires_at,id) where payment_status = 'pending';
create index audace_orders_created on public.audace_orders (created_at desc, id);
create index audace_orders_status on public.audace_orders (payment_status,fulfilment_status,created_at desc);

create table public.audace_order_contacts (
  order_id uuid primary key references public.audace_orders(id),
  name text not null check (length(btrim(name)) between 1 and 100),
  email text not null check (length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  phone text not null check (phone ~ '^[+]233[235][0-9]{8}$'),
  region text not null,
  city text not null check (length(btrim(city)) between 1 and 100),
  address text not null check (length(btrim(address)) between 1 and 240),
  directions text not null default '' check (length(directions) <= 400)
);

create table public.audace_order_items (
  order_id uuid not null references public.audace_orders(id),
  sku_id uuid not null references public.audace_skus(id),
  sku text not null,
  product_name text not null,
  colour text not null,
  sleeve text not null,
  size text not null,
  quantity integer not null check (quantity between 1 and 99),
  price_pesewas bigint not null check (price_pesewas between 0 and 1000000000),
  primary key (order_id, sku_id)
);

create table public.audace_reservations (
  order_id uuid not null,
  sku_id uuid not null,
  quantity integer not null check (quantity between 1 and 99),
  state text not null default 'held' check (state in ('held','released','finalized')),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (order_id, sku_id),
  foreign key (order_id, sku_id) references public.audace_order_items(order_id, sku_id)
);
create index audace_reservations_stock on public.audace_reservations (sku_id, expires_at) where state = 'held';

create table public.audace_movements (
  id bigint generated always as identity primary key,
  sku_id uuid not null references public.audace_skus(id),
  order_id uuid references public.audace_orders(id),
  actor uuid references auth.users(id) on delete set null,
  delta integer not null check (delta <> 0),
  balance integer not null check (balance between 0 and 1000000),
  reason text not null check (length(btrim(reason)) between 1 and 240),
  created_at timestamptz not null default now()
);
create index audace_movements_sku_time on public.audace_movements (sku_id, id desc);

create table public.audace_order_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.audace_orders(id),
  actor uuid references auth.users(id) on delete set null,
  payment_status text not null,
  fulfilment_status text not null,
  event text not null,
  created_at timestamptz not null default now()
);
create index audace_order_history_timeline on public.audace_order_history (order_id,id);

create table public.audace_audit (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id) on delete set null,
  operation text not null,
  target text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create function public.audace_admin_role() returns text
language sql stable security definer set search_path = ''
as $$ select role from public.audace_admins where user_id = (select auth.uid()) $$;
revoke all on function public.audace_admin_role() from public, anon, authenticated, service_role;
grant execute on function public.audace_admin_role() to authenticated;

-- PostgREST tables are private. An authenticated account has read access only after an explicit role assignment.
do $$
declare t text;
begin
  foreach t in array array['admins','products','variants','images','skus','stock','delivery','settings',
    'orders','order_contacts','order_items','reservations','movements','order_history','audit']
  loop
    execute format('alter table public.%I enable row level security', 'audace_' || t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', 'audace_' || t);
    if t <> 'admins' then
      execute format('grant select on table public.%I to authenticated', 'audace_' || t);
      execute format('create policy admin_read on public.%I for select to authenticated using ((select public.audace_admin_role()) is not null)', 'audace_' || t);
    end if;
  end loop;
end
$$;

create function audace_private.require_admin(p_owner boolean default false) returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare role_name text := public.audace_admin_role();
begin
  if role_name is null or (p_owner and role_name <> 'owner') then
    raise exception using errcode = '42501', message = 'Admin permission required';
  end if;
  return auth.uid();
end
$$;
revoke all on function audace_private.require_admin(boolean) from public, anon, authenticated, service_role;
