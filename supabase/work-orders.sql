-- ============================================================================
-- Maintenance work orders
-- ============================================================================
-- Run AFTER leasing.sql. Additive and idempotent (safe to re-run).
--
--   work_orders       → a repair, created by a manager or submitted by a
--                       tenant through their unit's request link (no login)
--   work_order_media  → photos, stored in the same private 'property-media'
--                       bucket Inspections uses, keyed {org_id}/work-orders/…
--
-- Status is exactly four steps, forward only:
--   new → assigned → in_progress → done
-- A trigger enforces the order and stamps when each step happened, so the
-- timeline can feed repair response / close times on the scorecards later.
-- Vendor is a tracking label (name + phone). No vendor accounts.
-- ============================================================================

do $$ begin
  create type work_order_status as enum ('new', 'assigned', 'in_progress', 'done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type work_order_source as enum ('manager', 'tenant');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Per-unit request link token (what a tenant's "request a repair" link uses)
-- ----------------------------------------------------------------------------
alter table units add column if not exists maintenance_token text unique
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
update units
  set maintenance_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
  where maintenance_token is null;

-- ----------------------------------------------------------------------------
-- Work orders
-- ----------------------------------------------------------------------------
create table if not exists work_orders (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  property_id       uuid not null references properties (id) on delete cascade,
  unit_id           uuid references units (id) on delete set null,  -- null = common area
  title             text not null,
  description       text,
  status            work_order_status not null default 'new',
  source            work_order_source not null default 'manager',
  reporter_name     text,                        -- tenant submissions
  reporter_contact  text,
  vendor_name       text,
  vendor_phone      text,
  cost              numeric(12, 2) check (cost is null or cost >= 0),
  completed_on      date,
  assigned_at       timestamptz,
  started_at        timestamptz,
  done_at           timestamptz,
  created_by        uuid references auth.users (id) on delete set null, -- null = tenant
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists work_orders_org_idx on work_orders (org_id);
create index if not exists work_orders_property_idx on work_orders (property_id);
create index if not exists work_orders_unit_idx on work_orders (unit_id);
create index if not exists work_orders_status_idx on work_orders (org_id, status);

drop trigger if exists work_orders_set_updated_at on work_orders;
create trigger work_orders_set_updated_at
  before update on work_orders
  for each row execute function set_updated_at();

-- Forward-only status, one step at a time, with server-stamped timestamps.
create or replace function guard_work_order()
returns trigger
language plpgsql
as $$
declare
  rank_old int;
  rank_new int;
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
    new.status = 'new';
    new.assigned_at = null;
    new.started_at = null;
    new.done_at = null;
    new.completed_on = null;
    return new;
  end if;

  new.org_id = old.org_id;
  new.created_at = old.created_at;
  new.source = old.source;
  new.reporter_name = old.reporter_name;
  new.reporter_contact = old.reporter_contact;
  new.created_by = old.created_by;

  rank_old = array_position(array['new','assigned','in_progress','done']::text[], old.status::text);
  rank_new = array_position(array['new','assigned','in_progress','done']::text[], new.status::text);
  if rank_new <> rank_old and rank_new <> rank_old + 1 then
    raise exception 'Work orders move one step forward at a time (new → assigned → in progress → done)';
  end if;

  if new.status <> 'new' and coalesce(trim(new.vendor_name), '') = '' then
    raise exception 'Assign a vendor before moving this work order forward';
  end if;

  if new.status = 'assigned' and old.status = 'new' then
    new.assigned_at = now();
  elsif new.status = 'in_progress' and old.status = 'assigned' then
    new.started_at = now();
  elsif new.status = 'done' and old.status = 'in_progress' then
    new.done_at = now();
    new.completed_on = coalesce(new.completed_on, current_date);
  else
    new.assigned_at = old.assigned_at;
    new.started_at = old.started_at;
    new.done_at = old.done_at;
  end if;
  return new;
end;
$$;

drop trigger if exists work_orders_guard on work_orders;
create trigger work_orders_guard
  before insert or update on work_orders
  for each row execute function guard_work_order();

-- ----------------------------------------------------------------------------
-- Photos
-- ----------------------------------------------------------------------------
create table if not exists work_order_media (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  work_order_id  uuid not null references work_orders (id) on delete cascade,
  storage_path   text not null,
  caption        text,
  created_at     timestamptz not null default now()
);
create index if not exists work_order_media_wo_idx on work_order_media (work_order_id);

-- ----------------------------------------------------------------------------
-- RLS — members read/write within their org; owners delete work orders.
-- Tenant submissions are inserted by the server after checking the unit's
-- request token.
-- ----------------------------------------------------------------------------
alter table work_orders      enable row level security;
alter table work_order_media enable row level security;

drop policy if exists "members read work orders" on work_orders;
create policy "members read work orders" on work_orders
  for select using (is_org_member(org_id));
drop policy if exists "members create work orders" on work_orders;
create policy "members create work orders" on work_orders
  for insert with check (
    is_org_member(org_id)
    and created_by = auth.uid()
    and source = 'manager'
    and exists (select 1 from properties p where p.id = work_orders.property_id and p.org_id = work_orders.org_id)
    and (
      work_orders.unit_id is null
      or exists (select 1 from units u where u.id = work_orders.unit_id and u.property_id = work_orders.property_id)
    )
  );
drop policy if exists "members update work orders" on work_orders;
create policy "members update work orders" on work_orders
  for update using (is_org_member(org_id)) with check (is_org_member(org_id));
drop policy if exists "owners delete work orders" on work_orders;
create policy "owners delete work orders" on work_orders
  for delete using (is_org_owner(org_id));

drop policy if exists "members read wo media" on work_order_media;
create policy "members read wo media" on work_order_media
  for select using (is_org_member(org_id));
drop policy if exists "members write wo media" on work_order_media;
create policy "members write wo media" on work_order_media
  for insert with check (
    is_org_member(org_id)
    and exists (select 1 from work_orders w where w.id = work_order_media.work_order_id and w.org_id = work_order_media.org_id)
    and split_part(storage_path, '/', 1) = org_id::text
  );
drop policy if exists "members delete wo media" on work_order_media;
create policy "members delete wo media" on work_order_media
  for delete using (is_org_member(org_id));
