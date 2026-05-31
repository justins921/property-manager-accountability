-- ============================================================================
-- Custom inspection templates — additive migration
-- ============================================================================
-- Run AFTER routine-inspections.sql. Idempotent and additive.
--
-- Lets owners build reusable checklist templates (e.g. "Monthly drive-by",
-- "Annual deep inspection"), each tied to a cadence, and run several inspection
-- types per property at once. Existing single-schedule data keeps working.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Templates + their checklist items
-- ----------------------------------------------------------------------------
create table if not exists inspection_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  name        text not null,
  frequency   inspection_frequency not null default 'monthly',
  description text,
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists inspection_templates_org_idx on inspection_templates (org_id);

drop trigger if exists inspection_templates_set_updated_at on inspection_templates;
create trigger inspection_templates_set_updated_at
  before update on inspection_templates
  for each row execute function set_updated_at();

create table if not exists inspection_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references inspection_templates (id) on delete cascade,
  org_id      uuid not null references organizations (id) on delete cascade,
  label       text not null,
  hint        text,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists inspection_template_items_template_idx
  on inspection_template_items (template_id);

-- ----------------------------------------------------------------------------
-- Link schedules + inspections to a template; allow many schedules per property
-- ----------------------------------------------------------------------------
alter table inspection_schedules
  add column if not exists template_id uuid references inspection_templates (id) on delete cascade;

-- Drop the old "one schedule per property" constraint, allow one-per-template.
alter table inspection_schedules
  drop constraint if exists inspection_schedules_property_id_key;
do $$ begin
  alter table inspection_schedules
    add constraint inspection_schedules_property_template_key
    unique (property_id, template_id);
exception when duplicate_object then null; end $$;

alter table property_inspections
  add column if not exists template_id uuid references inspection_templates (id) on delete set null;

-- Snapshot the area label so completed inspections render even if a template
-- is later edited or deleted.
alter table property_inspection_items
  add column if not exists area_label text;

-- ----------------------------------------------------------------------------
-- RLS: members read templates; owners manage them.
-- ----------------------------------------------------------------------------
alter table inspection_templates      enable row level security;
alter table inspection_template_items enable row level security;

drop policy if exists "members read templates" on inspection_templates;
create policy "members read templates" on inspection_templates
  for select using (is_org_member(org_id));
drop policy if exists "owners insert templates" on inspection_templates;
create policy "owners insert templates" on inspection_templates
  for insert with check (is_org_owner(org_id));
drop policy if exists "owners update templates" on inspection_templates;
create policy "owners update templates" on inspection_templates
  for update using (is_org_owner(org_id)) with check (is_org_owner(org_id));
drop policy if exists "owners delete templates" on inspection_templates;
create policy "owners delete templates" on inspection_templates
  for delete using (is_org_owner(org_id));

drop policy if exists "members read template items" on inspection_template_items;
create policy "members read template items" on inspection_template_items
  for select using (is_org_member(org_id));
drop policy if exists "owners insert template items" on inspection_template_items;
create policy "owners insert template items" on inspection_template_items
  for insert with check (is_org_owner(org_id));
drop policy if exists "owners update template items" on inspection_template_items;
create policy "owners update template items" on inspection_template_items
  for update using (is_org_owner(org_id)) with check (is_org_owner(org_id));
drop policy if exists "owners delete template items" on inspection_template_items;
create policy "owners delete template items" on inspection_template_items
  for delete using (is_org_owner(org_id));
