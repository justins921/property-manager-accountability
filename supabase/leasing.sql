-- ============================================================================
-- Leasing: tenants, leases, rent ledger, owner requests (Phase 1 of PM)
-- ============================================================================
-- Run AFTER super-admin.sql. Additive and idempotent (safe to re-run).
--
--   tenants          → people who rent units (org-scoped)
--   leases           → a unit rented to one or more tenants
--   lease_tenants    → join table (more than one tenant per lease)
--   ledger_entries   → append-only rent ledger per lease. Balance is always
--                      computed from entries; no running balance is stored.
--   owner_requests   → manager → owner asks (spending, decisions,
--                      reimbursements). Feeds the Owner Scorecard.
--
-- Roles: members (owners + managers) read and write; only owners delete
-- tenants and leases and answer owner requests. Ledger entries and owner
-- requests can never be deleted, so both scorecards stay honest.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type lease_status as enum ('upcoming', 'active', 'ended', 'terminated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ledger_entry_type as enum ('charge', 'payment', 'credit', 'late_fee', 'deposit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash', 'check', 'zelle', 'ach', 'money_order', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type owner_request_type as enum ('spending', 'decision', 'reimbursement');
exception when duplicate_object then null; end $$;

do $$ begin
  create type owner_request_status as enum ('pending', 'approved', 'declined', 'withdrawn');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Tenants
-- ----------------------------------------------------------------------------
create table if not exists tenants (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  email       text,
  phone       text,
  notes       text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists tenants_org_idx on tenants (org_id);

-- ----------------------------------------------------------------------------
-- Leases
-- ----------------------------------------------------------------------------
create table if not exists leases (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations (id) on delete cascade,
  property_id         uuid not null references properties (id) on delete cascade,
  -- No cascade: a unit with lease history can't be deleted out from under it.
  unit_id             uuid not null references units (id),
  vacancy_id          uuid references vacancies (id) on delete set null,
  start_date          date not null,
  end_date            date,                       -- null = month-to-month
  monthly_rent        numeric(12, 2) not null check (monthly_rent >= 0),
  rent_due_day        integer not null default 1 check (rent_due_day between 1 and 28),
  security_deposit    numeric(12, 2) not null default 0 check (security_deposit >= 0),
  late_fee_amount     numeric(12, 2) not null default 0 check (late_fee_amount >= 0),
  late_fee_grace_days integer not null default 5 check (late_fee_grace_days between 0 and 27),
  -- First due date the cron may post an automatic rent charge for. Stops a
  -- lease entered for an existing tenant from back-billing months of rent.
  billing_start_date  date not null,
  status              lease_status not null default 'upcoming',
  ended_on            date,                       -- actual move-out / end
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (ended_on is null or ended_on >= start_date)
);
create index if not exists leases_org_idx on leases (org_id);
create index if not exists leases_unit_idx on leases (unit_id);
create index if not exists leases_property_idx on leases (property_id);
create index if not exists leases_vacancy_idx on leases (vacancy_id);

-- One active lease per unit, enforced by the database.
create unique index if not exists leases_one_active_per_unit
  on leases (unit_id) where status = 'active';

drop trigger if exists leases_set_updated_at on leases;
create trigger leases_set_updated_at
  before update on leases
  for each row execute function set_updated_at();

create table if not exists lease_tenants (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  lease_id    uuid not null references leases (id) on delete cascade,
  -- No cascade: a tenant who is on a lease can't be deleted.
  tenant_id   uuid not null references tenants (id),
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (lease_id, tenant_id)
);
create index if not exists lease_tenants_tenant_idx on lease_tenants (tenant_id);
create index if not exists lease_tenants_org_idx on lease_tenants (org_id);

-- ----------------------------------------------------------------------------
-- Rent ledger (append-only)
-- ----------------------------------------------------------------------------
create table if not exists ledger_entries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  lease_id        uuid not null references leases (id) on delete cascade,
  type            ledger_entry_type not null,
  -- Always positive; the type decides whether it raises or lowers the balance.
  amount          numeric(12, 2) not null check (amount > 0),
  entry_date      date not null,
  memo            text,
  payment_method  payment_method,
  reference       text,                           -- check #, confirmation #
  -- Set only on entries the cron posts ('rent:2026-10', 'late:2026-10').
  -- Unique per lease, so re-running the cron never double-posts. NULLs
  -- (manual entries) never collide.
  auto_key        text,
  created_by      uuid references auth.users (id) on delete set null, -- null = system
  created_at      timestamptz not null default now(),
  unique (lease_id, auto_key)
);
create index if not exists ledger_entries_lease_idx on ledger_entries (lease_id);
create index if not exists ledger_entries_org_idx on ledger_entries (org_id);

-- created_at is the audit timestamp, so clients can't set it.
create or replace function force_created_at_now()
returns trigger
language plpgsql
as $$
begin
  new.created_at = now();
  return new;
end;
$$;

drop trigger if exists ledger_entries_force_created_at on ledger_entries;
create trigger ledger_entries_force_created_at
  before insert on ledger_entries
  for each row execute function force_created_at_now();

-- ----------------------------------------------------------------------------
-- Owner requests
-- ----------------------------------------------------------------------------
create table if not exists owner_requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  property_id    uuid references properties (id) on delete set null,
  vacancy_id     uuid references vacancies (id) on delete set null,
  type           owner_request_type not null,
  title          text not null,
  details        text,
  amount         numeric(12, 2) check (amount is null or amount >= 0),
  due_by         date not null,
  status         owner_request_status not null default 'pending',
  requested_by   uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  responded_by   uuid references auth.users (id) on delete set null,
  responded_at   timestamptz,
  response_note  text
);
create index if not exists owner_requests_org_idx on owner_requests (org_id);
create index if not exists owner_requests_status_idx on owner_requests (org_id, status);

-- Keep the response clock honest: the server stamps created_at and
-- responded_at; what was asked (and when it's due) can't be changed after
-- it's sent; and a request that has been answered or withdrawn is final.
create or replace function guard_owner_request()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
    new.status = 'pending';
    new.responded_by = null;
    new.responded_at = null;
    return new;
  end if;

  new.org_id = old.org_id;
  new.requested_by = old.requested_by;
  new.created_at = old.created_at;
  new.type = old.type;
  new.title = old.title;
  new.details = old.details;
  new.amount = old.amount;
  new.due_by = old.due_by;
  new.property_id = old.property_id;
  new.vacancy_id = old.vacancy_id;

  if old.status <> 'pending' then
    raise exception 'This request has already been %', old.status;
  end if;

  if new.status in ('approved', 'declined') then
    new.responded_at = now();
    new.responded_by = coalesce(auth.uid(), new.responded_by);
  else
    new.responded_at = null;
    new.responded_by = null;
  end if;
  return new;
end;
$$;

drop trigger if exists owner_requests_guard on owner_requests;
create trigger owner_requests_guard
  before insert or update on owner_requests
  for each row execute function guard_owner_request();

-- ----------------------------------------------------------------------------
-- Vacancies ↔ units
-- ----------------------------------------------------------------------------
alter table vacancies
  add column if not exists unit_id uuid references units (id) on delete set null;
create index if not exists vacancies_unit_idx on vacancies (unit_id);

-- Backfill: link old vacancies to a unit only when exactly one unit in the
-- same property has the same name as unit_number. Safe to re-run.
update vacancies v
set unit_id = u.id
from units u
where v.unit_id is null
  and u.property_id = v.property_id
  and lower(trim(u.name)) = lower(trim(v.unit_number))
  and (
    select count(*) from units u2
    where u2.property_id = v.property_id
      and lower(trim(u2.name)) = lower(trim(v.unit_number))
  ) = 1;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table tenants        enable row level security;
alter table leases         enable row level security;
alter table lease_tenants  enable row level security;
alter table ledger_entries enable row level security;
alter table owner_requests enable row level security;

-- tenants: members read/write; owners delete.
drop policy if exists "members read tenants" on tenants;
create policy "members read tenants" on tenants
  for select using (is_org_member(org_id));
drop policy if exists "members write tenants" on tenants;
create policy "members write tenants" on tenants
  for insert with check (is_org_member(org_id));
drop policy if exists "members update tenants" on tenants;
create policy "members update tenants" on tenants
  for update using (is_org_member(org_id)) with check (is_org_member(org_id));
drop policy if exists "owners delete tenants" on tenants;
create policy "owners delete tenants" on tenants
  for delete using (is_org_owner(org_id));

-- leases: members read/write (unit must be in the same org); owners delete.
drop policy if exists "members read leases" on leases;
create policy "members read leases" on leases
  for select using (is_org_member(org_id));
drop policy if exists "members write leases" on leases;
create policy "members write leases" on leases
  for insert with check (
    is_org_member(org_id)
    and exists (
      select 1 from units u
      where u.id = leases.unit_id and u.org_id = leases.org_id and u.property_id = leases.property_id
    )
  );
drop policy if exists "members update leases" on leases;
create policy "members update leases" on leases
  for update using (is_org_member(org_id)) with check (is_org_member(org_id));
drop policy if exists "owners delete leases" on leases;
create policy "owners delete leases" on leases
  for delete using (is_org_owner(org_id));

-- lease_tenants: members manage links between their own leases and tenants.
drop policy if exists "members read lease tenants" on lease_tenants;
create policy "members read lease tenants" on lease_tenants
  for select using (is_org_member(org_id));
drop policy if exists "members write lease tenants" on lease_tenants;
create policy "members write lease tenants" on lease_tenants
  for insert with check (
    is_org_member(org_id)
    and exists (select 1 from leases l where l.id = lease_tenants.lease_id and l.org_id = lease_tenants.org_id)
    and exists (select 1 from tenants t where t.id = lease_tenants.tenant_id and t.org_id = lease_tenants.org_id)
  );
drop policy if exists "members delete lease tenants" on lease_tenants;
create policy "members delete lease tenants" on lease_tenants
  for delete using (is_org_member(org_id));

-- ledger_entries: members read and add manual entries as themselves.
-- No update or delete policy: mistakes are fixed with a reversing entry.
drop policy if exists "members read ledger" on ledger_entries;
create policy "members read ledger" on ledger_entries
  for select using (is_org_member(org_id));
drop policy if exists "members write ledger" on ledger_entries;
create policy "members write ledger" on ledger_entries
  for insert with check (
    is_org_member(org_id)
    and created_by = auth.uid()
    and auto_key is null
    and exists (select 1 from leases l where l.id = ledger_entries.lease_id and l.org_id = ledger_entries.org_id)
  );

-- owner_requests: members read and create (as themselves); owners approve
-- or decline; only the requester can withdraw. No delete.
drop policy if exists "members read owner requests" on owner_requests;
create policy "members read owner requests" on owner_requests
  for select using (is_org_member(org_id));
drop policy if exists "members create owner requests" on owner_requests;
create policy "members create owner requests" on owner_requests
  for insert with check (is_org_member(org_id) and requested_by = auth.uid());
drop policy if exists "owners answer owner requests" on owner_requests;
create policy "owners answer owner requests" on owner_requests
  for update using (is_org_owner(org_id) and status = 'pending')
  with check (is_org_owner(org_id) and status in ('approved', 'declined'));
drop policy if exists "requester edits own pending request" on owner_requests;
drop policy if exists "requester withdraws own pending request" on owner_requests;
create policy "requester withdraws own pending request" on owner_requests
  for update using (
    is_org_member(org_id) and requested_by = auth.uid() and status = 'pending'
  ) with check (
    is_org_member(org_id) and requested_by = auth.uid() and status = 'withdrawn'
  );
