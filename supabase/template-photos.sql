-- ============================================================================
-- Template categories + required photos (Phase 2 of inspections v2)
-- ============================================================================
-- Run AFTER property-structure.sql. Additive and idempotent.
--
-- - Templates get a category (interior / exterior / general) so exterior
--   templates naturally apply to buildings and interior to units.
-- - Each checklist item can require photos, with a minimum count. The item
--   can't be marked done until that many photos are uploaded (enforced in the
--   app on both client and server).
-- ============================================================================

do $$ begin
  create type template_category as enum ('interior', 'exterior', 'general');
exception when duplicate_object then null; end $$;

alter table inspection_templates
  add column if not exists category template_category not null default 'general';

alter table inspection_template_items
  add column if not exists photo_required boolean not null default false;
alter table inspection_template_items
  add column if not exists min_photos integer not null default 0;

-- Snapshot the requirement onto completed items so the record shows what was
-- required at the time, independent of later template edits.
alter table property_inspection_items
  add column if not exists photo_required boolean not null default false;
alter table property_inspection_items
  add column if not exists min_photos integer not null default 0;
