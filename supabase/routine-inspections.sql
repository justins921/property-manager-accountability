-- ============================================================================
-- Routine Property Inspections — additive migration
-- ============================================================================
-- Run this in the Supabase SQL editor AFTER schema.sql. It is idempotent and
-- additive (no changes to existing vacancy tables), so it's safe to re-run.
--
-- Adds the "ongoing upkeep" accountability pillar: per-property recurring
-- inspection schedules, the inspection occurrences managers complete with
-- photos, and a reminder log parallel to the vacancy one.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type inspection_frequency as enum (
    'weekly', 'monthly', 'quarterly', 'semiannual', 'annual'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type inspection_item_result as enum ('pass', 'needs_attention', 'na');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- One recurring schedule per property.
create table if not exists inspection_schedules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  property_id   uuid not null references properties (id) on delete cascade,
  manager_id    uuid references auth.users (id) on delete set null,
  frequency     inspection_frequency not null default 'monthly',
  anchor_date   date not null default current_date,
  next_due_date date not null,
  active        boolean not null default true,
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (property_id)
);
create index if not exists inspection_schedules_org_idx on inspection_schedules (org_id);
create index if not exists inspection_schedules_due_idx
  on inspection_schedules (active, next_due_date);

drop trigger if exists inspection_schedules_set_updated_at on inspection_schedules;
create trigger inspection_schedules_set_updated_at
  before update on inspection_schedules
  for each row execute function set_updated_at();

-- A single inspection occurrence (cron-generated or ad-hoc).
create table if not exists property_inspections (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  property_id   uuid not null references properties (id) on delete cascade,
  schedule_id   uuid references inspection_schedules (id) on delete set null,
  manager_id    uuid references auth.users (id) on delete set null,
  due_date      date not null,
  completed_at  timestamptz,
  completed_by  uuid references auth.users (id),
  overall_notes text,
  created_at    timestamptz not null default now()
);
create index if not exists property_inspections_org_idx on property_inspections (org_id);
create index if not exists property_inspections_property_idx on property_inspections (property_id);
create index if not exists property_inspections_manager_idx on property_inspections (manager_id);

-- One row per checklist area within an inspection.
create table if not exists property_inspection_items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  inspection_id uuid not null references property_inspections (id) on delete cascade,
  area_key      text not null,
  result        inspection_item_result not null default 'pass',
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists property_inspection_items_inspection_idx
  on property_inspection_items (inspection_id);

-- Photos, linked to an inspection (and optionally a specific item).
create table if not exists property_inspection_media (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  inspection_id uuid not null references property_inspections (id) on delete cascade,
  item_id       uuid references property_inspection_items (id) on delete cascade,
  storage_path  text not null,
  caption       text,
  created_at    timestamptz not null default now()
);
create index if not exists property_inspection_media_inspection_idx
  on property_inspection_media (inspection_id);

-- Reminder audit/dedupe, parallel to the vacancy `reminders` table.
create table if not exists inspection_reminders (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  inspection_id   uuid not null references property_inspections (id) on delete cascade,
  reminder_type   reminder_type not null,
  message         text not null,
  recipient_email text,
  sent_at         timestamptz not null default now(),
  unique (inspection_id, reminder_type)
);
create index if not exists inspection_reminders_inspection_idx
  on inspection_reminders (inspection_id);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table inspection_schedules        enable row level security;
alter table property_inspections        enable row level security;
alter table property_inspection_items   enable row level security;
alter table property_inspection_media   enable row level security;
alter table inspection_reminders        enable row level security;

-- Schedules: members read; owners manage (set cadence / responsible manager).
drop policy if exists "members read schedules" on inspection_schedules;
create policy "members read schedules" on inspection_schedules
  for select using (is_org_member(org_id));
drop policy if exists "owners insert schedules" on inspection_schedules;
create policy "owners insert schedules" on inspection_schedules
  for insert with check (is_org_owner(org_id));
drop policy if exists "owners update schedules" on inspection_schedules;
create policy "owners update schedules" on inspection_schedules
  for update using (is_org_owner(org_id)) with check (is_org_owner(org_id));
drop policy if exists "owners delete schedules" on inspection_schedules;
create policy "owners delete schedules" on inspection_schedules
  for delete using (is_org_owner(org_id));

-- Inspections: members read; members create (ad-hoc) and complete.
drop policy if exists "members read inspections" on property_inspections;
create policy "members read inspections" on property_inspections
  for select using (is_org_member(org_id));
drop policy if exists "members write inspections" on property_inspections;
create policy "members write inspections" on property_inspections
  for insert with check (is_org_member(org_id));
drop policy if exists "members update inspections" on property_inspections;
create policy "members update inspections" on property_inspections
  for update using (is_org_member(org_id)) with check (is_org_member(org_id));
drop policy if exists "owners delete inspections" on property_inspections;
create policy "owners delete inspections" on property_inspections
  for delete using (is_org_owner(org_id));

-- Items
drop policy if exists "members read items" on property_inspection_items;
create policy "members read items" on property_inspection_items
  for select using (is_org_member(org_id));
drop policy if exists "members write items" on property_inspection_items;
create policy "members write items" on property_inspection_items
  for insert with check (is_org_member(org_id));
drop policy if exists "members update items" on property_inspection_items;
create policy "members update items" on property_inspection_items
  for update using (is_org_member(org_id)) with check (is_org_member(org_id));
drop policy if exists "members delete items" on property_inspection_items;
create policy "members delete items" on property_inspection_items
  for delete using (is_org_member(org_id));

-- Media
drop policy if exists "members read insp media" on property_inspection_media;
create policy "members read insp media" on property_inspection_media
  for select using (is_org_member(org_id));
drop policy if exists "members write insp media" on property_inspection_media;
create policy "members write insp media" on property_inspection_media
  for insert with check (is_org_member(org_id));
drop policy if exists "members delete insp media" on property_inspection_media;
create policy "members delete insp media" on property_inspection_media
  for delete using (is_org_member(org_id));

-- Reminders: read-only to members; written by the service-role cron.
drop policy if exists "members read insp reminders" on inspection_reminders;
create policy "members read insp reminders" on inspection_reminders
  for select using (is_org_member(org_id));

-- ----------------------------------------------------------------------------
-- Private storage bucket for routine-inspection photos.
-- Files are keyed as: {org_id}/{inspection_id}/{filename}
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('property-media', 'property-media', false)
on conflict (id) do nothing;

drop policy if exists "org members read property media" on storage.objects;
create policy "org members read property media" on storage.objects
  for select using (
    bucket_id = 'property-media'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "org members upload property media" on storage.objects;
create policy "org members upload property media" on storage.objects
  for insert with check (
    bucket_id = 'property-media'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "org members delete property media" on storage.objects;
create policy "org members delete property media" on storage.objects
  for delete using (
    bucket_id = 'property-media'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  );
