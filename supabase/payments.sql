-- ============================================================================
-- Online rent collection (Stripe): pay links, autopay, rent reminders
-- ============================================================================
-- Run AFTER leasing.sql. Additive and idempotent (safe to re-run).
--
-- Money goes straight to each organization's own Stripe account (Stripe
-- Connect). The app never sees or stores card or bank numbers: tenants enter
-- them on Stripe's hosted page, and we keep only Stripe IDs plus a display
-- label like "Visa •••• 4242".
--
-- Online payments land in the same ledger_entries table as manual ones, as
-- 'payment' entries with auto_key 'stripe:<payment_intent_id>'. The existing
-- unique (lease_id, auto_key) makes every Stripe payment post exactly once.
--
--   payment_links     → a secure link the manager sends; no tenant login
--   autopay_attempts  → one row per automatic charge attempt (with retries)
--   rent_reminders    → dedupe log for before-due / missed-payment emails
-- ============================================================================

-- Card is a new payment method (bank payments reuse 'ach').
alter type payment_method add value if not exists 'card';

-- ----------------------------------------------------------------------------
-- Organizations ↔ their Stripe account
-- ----------------------------------------------------------------------------
alter table organizations add column if not exists stripe_account_id text unique;
alter table organizations add column if not exists stripe_charges_enabled boolean not null default false;

-- ----------------------------------------------------------------------------
-- Leases: autopay
-- ----------------------------------------------------------------------------
alter table leases add column if not exists stripe_customer_id text;
alter table leases add column if not exists autopay_enabled boolean not null default false;
alter table leases add column if not exists autopay_payment_method_id text;
alter table leases add column if not exists autopay_method_label text;   -- "Visa •••• 4242"
alter table leases add column if not exists autopay_enabled_at timestamptz;

-- Stripe fields are written only by the server (service role). Members may
-- turn autopay OFF, never on: turning it on needs the tenant's consent, which
-- only happens on the pay page.
create or replace function guard_stripe_fields()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;

  if tg_table_name = 'organizations' then
    new.stripe_account_id = old.stripe_account_id;
    new.stripe_charges_enabled = old.stripe_charges_enabled;
  elsif tg_table_name = 'leases' then
    new.stripe_customer_id = old.stripe_customer_id;
    new.autopay_payment_method_id = old.autopay_payment_method_id;
    new.autopay_method_label = old.autopay_method_label;
    new.autopay_enabled_at = old.autopay_enabled_at;
    if new.autopay_enabled and not old.autopay_enabled then
      raise exception 'Autopay can only be turned on by the tenant from their payment link';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_guard_stripe on organizations;
create trigger organizations_guard_stripe
  before update on organizations
  for each row execute function guard_stripe_fields();

drop trigger if exists leases_guard_stripe on leases;
create trigger leases_guard_stripe
  before update on leases
  for each row execute function guard_stripe_fields();

-- ----------------------------------------------------------------------------
-- Pay links
-- ----------------------------------------------------------------------------
do $$ begin
  create type payment_link_kind as enum ('payment', 'autopay');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_link_status as enum ('open', 'processing', 'paid', 'failed', 'void');
exception when duplicate_object then null; end $$;

create table if not exists payment_links (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations (id) on delete cascade,
  lease_id            uuid not null references leases (id) on delete cascade,
  -- Unguessable token in the URL. The link is the tenant's only credential.
  token               text not null unique
                        default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  kind                payment_link_kind not null default 'payment',
  amount              numeric(12, 2) check (amount is null or amount > 0),
  status              payment_link_status not null default 'open',
  stripe_session_id   text,
  payment_intent_id   text,
  sent_to             text[] not null default '{}',
  expires_at          timestamptz not null default now() + interval '30 days',
  paid_at             timestamptz,
  created_by          uuid references auth.users (id) on delete set null, -- null = system
  created_at          timestamptz not null default now(),
  check (kind = 'autopay' or amount is not null)
);
create index if not exists payment_links_lease_idx on payment_links (lease_id);
create index if not exists payment_links_org_idx on payment_links (org_id);

-- ----------------------------------------------------------------------------
-- Autopay attempts (one row per try; failed charges retry)
-- ----------------------------------------------------------------------------
do $$ begin
  create type autopay_attempt_status as enum ('processing', 'succeeded', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists autopay_attempts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations (id) on delete cascade,
  lease_id            uuid not null references leases (id) on delete cascade,
  period              text not null,             -- 'YYYY-MM'
  attempt             integer not null check (attempt between 1 and 3),
  amount              numeric(12, 2) not null check (amount > 0),
  status              autopay_attempt_status not null default 'processing',
  payment_intent_id   text,
  failure_message     text,
  attempted_on        date not null,
  created_at          timestamptz not null default now(),
  unique (lease_id, period, attempt)
);
create index if not exists autopay_attempts_lease_idx on autopay_attempts (lease_id);
create index if not exists autopay_attempts_org_idx on autopay_attempts (org_id);

-- ----------------------------------------------------------------------------
-- Rent reminder log (dedupe: one of each kind per lease per month)
-- ----------------------------------------------------------------------------
create table if not exists rent_reminders (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  lease_id    uuid not null references leases (id) on delete cascade,
  period      text not null,
  kind        text not null check (kind in ('upcoming', 'late', 'autopay_failed')),
  sent_to     text[] not null default '{}',
  sent_at     timestamptz not null default now(),
  unique (lease_id, period, kind)
);
create index if not exists rent_reminders_lease_idx on rent_reminders (lease_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table payment_links    enable row level security;
alter table autopay_attempts enable row level security;
alter table rent_reminders   enable row level security;

-- payment_links: members read, create (as themselves, for their own leases)
-- and void. Status changes from Stripe come from the server.
drop policy if exists "members read payment links" on payment_links;
create policy "members read payment links" on payment_links
  for select using (is_org_member(org_id));
drop policy if exists "members create payment links" on payment_links;
create policy "members create payment links" on payment_links
  for insert with check (
    is_org_member(org_id)
    and created_by = auth.uid()
    and status = 'open'
    and exists (select 1 from leases l where l.id = payment_links.lease_id and l.org_id = payment_links.org_id)
  );
drop policy if exists "members void payment links" on payment_links;
create policy "members void payment links" on payment_links
  for update using (is_org_member(org_id) and status = 'open')
  with check (is_org_member(org_id) and status = 'void');

-- autopay_attempts and rent_reminders: read-only for members; the cron and
-- Stripe webhook write them with the service role.
drop policy if exists "members read autopay attempts" on autopay_attempts;
create policy "members read autopay attempts" on autopay_attempts
  for select using (is_org_member(org_id));
drop policy if exists "members read rent reminders" on rent_reminders;
create policy "members read rent reminders" on rent_reminders
  for select using (is_org_member(org_id));
