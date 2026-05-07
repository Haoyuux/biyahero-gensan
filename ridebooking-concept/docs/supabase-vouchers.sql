create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric not null check (discount_value >= 0),
  max_discount_amount numeric,
  minimum_fare numeric not null default 0,
  minimum_distance_km numeric not null default 0,
  usage_limit integer,
  per_user_limit integer not null default 1,
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_vouchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  code text not null,
  status text not null default 'available' check (status in ('available', 'used', 'expired')),
  added_at timestamptz not null default now(),
  used_at timestamptz,
  ride_id text
);

alter table public.rides add column if not exists voucher_id uuid references public.vouchers(id) on delete set null;
alter table public.rides add column if not exists user_voucher_id uuid references public.user_vouchers(id) on delete set null;
alter table public.rides add column if not exists voucher_code text;
alter table public.rides add column if not exists voucher_discount numeric not null default 0;
alter table public.rides add column if not exists original_fare numeric;
alter table public.rides add column if not exists final_fare numeric;
alter table public.rides add column if not exists voucher_discount_paid boolean not null default false;
alter table public.rides add column if not exists voucher_discount_paid_at timestamptz;
alter table public.rides add column if not exists voucher_discount_paid_by text;

alter table public.vouchers enable row level security;
alter table public.user_vouchers enable row level security;

create policy "Authenticated users can read active vouchers"
  on public.vouchers for select
  using (auth.role() = 'authenticated');

create policy "Service role can manage vouchers"
  on public.vouchers for all
  using (auth.role() = 'service_role');

create policy "Users can read their vouchers"
  on public.user_vouchers for select
  using (auth.uid() = user_id);

create policy "Users can add their vouchers"
  on public.user_vouchers for insert
  with check (auth.uid() = user_id);

create policy "Users can update their vouchers"
  on public.user_vouchers for update
  using (auth.uid() = user_id);

create policy "Service role can manage user vouchers"
  on public.user_vouchers for all
  using (auth.role() = 'service_role');
