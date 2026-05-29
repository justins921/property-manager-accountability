-- ============================================================================
-- Property Manager Accountability Platform — Database Schema
-- ============================================================================
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- It creates the full schema, Row Level Security policies, and the
-- private storage bucket used for move-out / ready-for-market media.
--
-- Multi-tenancy model:
--   organization  → an owner's portfolio (the paying customer / tenant boundary)
--   org_members   → users (owners and managers) belonging to an organization
--   property      → belongs to an organization, optionally has an assigned manager
--   vacancy       → belongs to a property, owned by a responsible manager
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type member_role as enum ('owner', 'manager');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vacancy_stage as enum (
    'created',        -- vacancy created, timer running
    'inspected',      -- move-out inspection uploaded
    'make_ready',     -- turn work in progress
    'ready',          -- ready-for-market verified
    'listed',         -- unit listed for lease
    'application',    -- application(s) received
    'leased',         -- lease signed
    'completed'       -- moved in / vacancy closed
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type inspection_type as enum ('move_out', 'ready_for_market');
exception when duplicate_object then null; end $$;

do $$ begin
  create type media_type as enum ('video', 'photo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deadline_type as enum ('make_ready', 'listing', 'lease_signing', 'move_in');
exception when duplicate_object then null; end $$;

do $$ begin
  create type delay_reason as enum (
    'waiting_contractor',
    'waiting_materials',
    'waiting_owner_approval',
    'leasing_issue',
    'market_conditions',
    'tenant_delay',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type reminder_type as enum (
    'pre_deadline',  -- 1 day before
    'deadline_day',  -- due today
    'overdue_3',
    'overdue_7',
    'overdue_14'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table if not exists profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  created_at  timestamptz not null default now()
);

create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now()
);

create table if not exists org_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        member_role not null default 'manager',
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists org_members_user_idx on org_members (user_id);
create index if not exists org_members_org_idx on org_members (org_id);

create table if not exists properties (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  name        text not null,
  address     text,
  manager_id  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists properties_org_idx on properties (org_id);

create table if not exists vacancies (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references organizations (id) on delete cascade,
  property_id                 uuid not null references properties (id) on delete cascade,
  manager_id                  uuid references auth.users (id) on delete set null,
  unit_number                 text not null,
  monthly_rent                numeric(12, 2) not null check (monthly_rent >= 0),

  -- Step 1: the commitments
  move_out_date               date not null,
  expected_make_ready_date    date not null,
  expected_listing_date       date not null,
  expected_lease_signing_date date not null,
  expected_move_in_date       date not null,

  -- Step 7: actuals
  actual_make_ready_date      date,
  date_listed                 date,
  date_applications_received  date,
  date_lease_signed           date,
  actual_move_in_date         date,

  stage                       vacancy_stage not null default 'created',
  closed_at                   timestamptz,
  created_by                  uuid not null references auth.users (id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists vacancies_org_idx on vacancies (org_id);
create index if not exists vacancies_property_idx on vacancies (property_id);
create index if not exists vacancies_manager_idx on vacancies (manager_id);

create table if not exists inspections (
  id                  uuid primary key default gen_random_uuid(),
  vacancy_id          uuid not null references vacancies (id) on delete cascade,
  org_id              uuid not null references organizations (id) on delete cascade,
  type                inspection_type not null,
  damage_notes        text,
  estimated_turn_cost numeric(12, 2),
  completion_notes    text,
  created_by          uuid not null references auth.users (id),
  created_at          timestamptz not null default now()
);
create index if not exists inspections_vacancy_idx on inspections (vacancy_id);

create table if not exists inspection_media (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections (id) on delete cascade,
  org_id        uuid not null references organizations (id) on delete cascade,
  media_type    media_type not null,
  storage_path  text not null,
  caption       text,
  created_at    timestamptz not null default now()
);
create index if not exists inspection_media_inspection_idx on inspection_media (inspection_id);

create table if not exists delay_explanations (
  id            uuid primary key default gen_random_uuid(),
  vacancy_id    uuid not null references vacancies (id) on delete cascade,
  org_id        uuid not null references organizations (id) on delete cascade,
  deadline_type deadline_type not null,
  reason        delay_reason not null,
  notes         text,
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now()
);
create index if not exists delay_explanations_vacancy_idx on delay_explanations (vacancy_id);

-- Audit trail of reminders sent, also used to dedupe so a reminder fires once.
create table if not exists reminders (
  id              uuid primary key default gen_random_uuid(),
  vacancy_id      uuid not null references vacancies (id) on delete cascade,
  org_id          uuid not null references organizations (id) on delete cascade,
  reminder_type   reminder_type not null,
  deadline_type   deadline_type not null,
  message         text not null,
  recipient_email text,
  sent_at         timestamptz not null default now(),
  unique (vacancy_id, deadline_type, reminder_type)
);
create index if not exists reminders_vacancy_idx on reminders (vacancy_id);

-- ----------------------------------------------------------------------------
-- updated_at trigger for vacancies
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vacancies_set_updated_at on vacancies;
create trigger vacancies_set_updated_at
  before update on vacancies
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- Security-definer helpers (avoid recursive RLS evaluation on org_members)
-- ----------------------------------------------------------------------------
create or replace function is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from org_members
    where org_id = target_org and user_id = auth.uid()
  );
$$;

create or replace function is_org_owner(target_org uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from org_members
    where org_id = target_org and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table profiles            enable row level security;
alter table organizations       enable row level security;
alter table org_members         enable row level security;
alter table properties          enable row level security;
alter table vacancies           enable row level security;
alter table inspections         enable row level security;
alter table inspection_media    enable row level security;
alter table delay_explanations  enable row level security;
alter table reminders           enable row level security;

-- profiles: a user can read profiles of anyone in a shared org, and edit their own.
drop policy if exists "read own or shared profiles" on profiles;
create policy "read own or shared profiles" on profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from org_members m1
      join org_members m2 on m1.org_id = m2.org_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );

drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "insert own profile" on profiles;
create policy "insert own profile" on profiles
  for insert with check (id = auth.uid());

-- organizations: members can read; owners can update; any authed user can create.
drop policy if exists "members read orgs" on organizations;
create policy "members read orgs" on organizations
  for select using (is_org_member(id));

drop policy if exists "create org" on organizations;
create policy "create org" on organizations
  for insert with check (created_by = auth.uid());

drop policy if exists "owners update org" on organizations;
create policy "owners update org" on organizations
  for update using (is_org_owner(id)) with check (is_org_owner(id));

-- org_members: members read membership of their orgs; owners manage members.
-- A user may also insert themselves as the first owner of an org they created.
drop policy if exists "read org members" on org_members;
create policy "read org members" on org_members
  for select using (user_id = auth.uid() or is_org_member(org_id));

drop policy if exists "insert org members" on org_members;
create policy "insert org members" on org_members
  for insert with check (
    is_org_owner(org_id)
    or (
      user_id = auth.uid()
      and exists (select 1 from organizations o where o.id = org_id and o.created_by = auth.uid())
    )
  );

drop policy if exists "owners update members" on org_members;
create policy "owners update members" on org_members
  for update using (is_org_owner(org_id)) with check (is_org_owner(org_id));

drop policy if exists "owners delete members" on org_members;
create policy "owners delete members" on org_members
  for delete using (is_org_owner(org_id));

-- Generic helper macro pattern: members can read; owners + managers can write.
-- properties
drop policy if exists "members read properties" on properties;
create policy "members read properties" on properties
  for select using (is_org_member(org_id));
drop policy if exists "members write properties" on properties;
create policy "members write properties" on properties
  for insert with check (is_org_member(org_id));
drop policy if exists "members update properties" on properties;
create policy "members update properties" on properties
  for update using (is_org_member(org_id)) with check (is_org_member(org_id));
drop policy if exists "owners delete properties" on properties;
create policy "owners delete properties" on properties
  for delete using (is_org_owner(org_id));

-- vacancies
drop policy if exists "members read vacancies" on vacancies;
create policy "members read vacancies" on vacancies
  for select using (is_org_member(org_id));
drop policy if exists "members write vacancies" on vacancies;
create policy "members write vacancies" on vacancies
  for insert with check (is_org_member(org_id));
drop policy if exists "members update vacancies" on vacancies;
create policy "members update vacancies" on vacancies
  for update using (is_org_member(org_id)) with check (is_org_member(org_id));
drop policy if exists "owners delete vacancies" on vacancies;
create policy "owners delete vacancies" on vacancies
  for delete using (is_org_owner(org_id));

-- inspections
drop policy if exists "members read inspections" on inspections;
create policy "members read inspections" on inspections
  for select using (is_org_member(org_id));
drop policy if exists "members write inspections" on inspections;
create policy "members write inspections" on inspections
  for insert with check (is_org_member(org_id));
drop policy if exists "members update inspections" on inspections;
create policy "members update inspections" on inspections
  for update using (is_org_member(org_id)) with check (is_org_member(org_id));
drop policy if exists "members delete inspections" on inspections;
create policy "members delete inspections" on inspections
  for delete using (is_org_member(org_id));

-- inspection_media
drop policy if exists "members read media" on inspection_media;
create policy "members read media" on inspection_media
  for select using (is_org_member(org_id));
drop policy if exists "members write media" on inspection_media;
create policy "members write media" on inspection_media
  for insert with check (is_org_member(org_id));
drop policy if exists "members delete media" on inspection_media;
create policy "members delete media" on inspection_media
  for delete using (is_org_member(org_id));

-- delay_explanations
drop policy if exists "members read delays" on delay_explanations;
create policy "members read delays" on delay_explanations
  for select using (is_org_member(org_id));
drop policy if exists "members write delays" on delay_explanations;
create policy "members write delays" on delay_explanations
  for insert with check (is_org_member(org_id));

-- reminders (read-only to members; written by the service role cron job)
drop policy if exists "members read reminders" on reminders;
create policy "members read reminders" on reminders
  for select using (is_org_member(org_id));

-- ----------------------------------------------------------------------------
-- Private storage bucket for move-out / ready-for-market media.
-- Files are keyed as: {org_id}/{vacancy_id}/{filename}
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vacancy-media', 'vacancy-media', false)
on conflict (id) do nothing;

drop policy if exists "org members read media files" on storage.objects;
create policy "org members read media files" on storage.objects
  for select using (
    bucket_id = 'vacancy-media'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "org members upload media files" on storage.objects;
create policy "org members upload media files" on storage.objects
  for insert with check (
    bucket_id = 'vacancy-media'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "org members delete media files" on storage.objects;
create policy "org members delete media files" on storage.objects
  for delete using (
    bucket_id = 'vacancy-media'
    and is_org_member(((storage.foldername(name))[1])::uuid)
  );
