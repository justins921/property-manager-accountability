-- ============================================================================
-- Property structure: Buildings + Units (Phase 1 of inspections v2)
-- ============================================================================
-- Run AFTER inspection-templates.sql. Additive and idempotent.
--
-- A property (address) can contain multiple buildings, and each building can
-- contain multiple units. Exterior inspections target buildings; interior
-- inspections target units. A single-family home is simply one building with
-- one unit. Inspection schedules and occurrences can now point at a specific
-- building or unit (or stay property-level when both are null).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Buildings + Units
-- ----------------------------------------------------------------------------
create table if not exists buildings (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  property_id uuid not null references properties (id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists buildings_property_idx on buildings (property_id);
create index if not exists buildings_org_idx on buildings (org_id);

create table if not exists units (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  property_id uuid not null references properties (id) on delete cascade,
  building_id uuid not null references buildings (id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists units_building_idx on units (building_id);
create index if not exists units_property_idx on units (property_id);
create index if not exists units_org_idx on units (org_id);

-- ----------------------------------------------------------------------------
-- Targeting: schedules + inspections can point at a building or unit
-- ----------------------------------------------------------------------------
alter table inspection_schedules
  add column if not exists building_id uuid references buildings (id) on delete cascade;
alter table inspection_schedules
  add column if not exists unit_id uuid references units (id) on delete cascade;

-- Replace the old (property, template) uniqueness with one that includes the
-- target, so the same template can apply to many buildings/units.
alter table inspection_schedules
  drop constraint if exists inspection_schedules_property_template_key;
do $$ begin
  alter table inspection_schedules
    add constraint inspection_schedules_target_template_key
    unique (property_id, building_id, unit_id, template_id);
exception when duplicate_object then null; end $$;

alter table property_inspections
  add column if not exists building_id uuid references buildings (id) on delete set null;
alter table property_inspections
  add column if not exists unit_id uuid references units (id) on delete set null;

-- ----------------------------------------------------------------------------
-- RLS — members read/write within their org; owners delete.
-- ----------------------------------------------------------------------------
alter table buildings enable row level security;
alter table units     enable row level security;

drop policy if exists "members read buildings" on buildings;
create policy "members read buildings" on buildings
  for select using (is_org_member(org_id));
drop policy if exists "members write buildings" on buildings;
create policy "members write buildings" on buildings
  for insert with check (is_org_member(org_id));
drop policy if exists "members update buildings" on buildings;
create policy "members update buildings" on buildings
  for update using (is_org_member(org_id)) with check (is_org_member(org_id));
drop policy if exists "owners delete buildings" on buildings;
create policy "owners delete buildings" on buildings
  for delete using (is_org_owner(org_id));

drop policy if exists "members read units" on units;
create policy "members read units" on units
  for select using (is_org_member(org_id));
drop policy if exists "members write units" on units;
create policy "members write units" on units
  for insert with check (is_org_member(org_id));
drop policy if exists "members update units" on units;
create policy "members update units" on units
  for update using (is_org_member(org_id)) with check (is_org_member(org_id));
drop policy if exists "owners delete units" on units;
create policy "owners delete units" on units
  for delete using (is_org_owner(org_id));
