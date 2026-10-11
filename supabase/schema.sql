-- Pocket Ledger schema. Run once in Supabase → SQL Editor.
-- The app reads and writes only through its server routes using the secret key,
-- so RLS stays enabled with no policies: the public anon key cannot touch these tables.

create table if not exists public.ledgers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100 and name = btrim(name)),
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  amount numeric(11, 2) not null check (amount > 0 and amount <= 999999999),
  currency text not null check (currency in ('INR', 'USD', 'EUR', 'GBP')),
  date date not null,
  time time not null,
  timezone text not null check (char_length(timezone) <= 100),
  location text not null default '' check (char_length(location) <= 250),
  recorded_at timestamptz not null default now()
);

create index if not exists expenses_ledger_recorded_idx on public.expenses (ledger_id, recorded_at desc);
create index if not exists ledgers_created_idx on public.ledgers (created_at desc);

alter table public.ledgers enable row level security;
alter table public.expenses enable row level security;
revoke all on public.ledgers, public.expenses from anon, authenticated;
