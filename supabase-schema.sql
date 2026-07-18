create table if not exists public.customers (
  email text primary key,
  status text not null default 'inactive',
  plan text,
  price_id text,
  paddle_customer_id text,
  paddle_subscription_id text,
  paddle_transaction_id text,
  access_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.paddle_events (
  event_id text primary key,
  event_type text not null,
  occurred_at timestamptz,
  processed_at timestamptz not null default now(),
  payload jsonb not null
);

alter table public.customers enable row level security;
alter table public.paddle_events enable row level security;
