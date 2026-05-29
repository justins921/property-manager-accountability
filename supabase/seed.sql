-- ============================================================================
-- Optional demo seed data.
--
-- Supabase manages auth.users, so seeding realistic data is easiest AFTER you
-- have signed up at least one user through the app. Then:
--   1. Find your user id:  select id, email from auth.users;
--   2. Replace :owner_id below and run this file in the SQL editor.
--
-- This creates one organization, two properties, and three vacancies in
-- different states so the dashboards, scorecard, and reminders have something
-- to show.
-- ============================================================================

-- \set owner_id '00000000-0000-0000-0000-000000000000'

do $$
declare
  v_owner    uuid := '00000000-0000-0000-0000-000000000000'; -- ← replace me
  v_org      uuid;
  v_prop_a   uuid;
  v_prop_b   uuid;
begin
  insert into organizations (name, created_by)
  values ('Demo Holdings', v_owner)
  returning id into v_org;

  insert into org_members (org_id, user_id, role)
  values (v_org, v_owner, 'owner');

  insert into properties (org_id, name, address, manager_id)
  values (v_org, 'Maple Court', '120 Maple St', v_owner)
  returning id into v_prop_a;

  insert into properties (org_id, name, address, manager_id)
  values (v_org, 'Oak Ridge', '88 Oak Ave', v_owner)
  returning id into v_prop_b;

  -- On-track vacancy
  insert into vacancies (
    org_id, property_id, manager_id, unit_number, monthly_rent,
    move_out_date, expected_make_ready_date, expected_listing_date,
    expected_lease_signing_date, expected_move_in_date, created_by, stage
  ) values (
    v_org, v_prop_a, v_owner, '101', 1500,
    current_date - 5, current_date + 9, current_date + 12,
    current_date + 26, current_date + 37, v_owner, 'make_ready'
  );

  -- Overdue vacancy (make-ready missed)
  insert into vacancies (
    org_id, property_id, manager_id, unit_number, monthly_rent,
    move_out_date, expected_make_ready_date, expected_listing_date,
    expected_lease_signing_date, expected_move_in_date, created_by, stage
  ) values (
    v_org, v_prop_a, v_owner, '205', 1800,
    current_date - 30, current_date - 7, current_date - 4,
    current_date + 10, current_date + 21, v_owner, 'make_ready'
  );

  -- Completed vacancy (for scorecard history)
  insert into vacancies (
    org_id, property_id, manager_id, unit_number, monthly_rent,
    move_out_date, expected_make_ready_date, expected_listing_date,
    expected_lease_signing_date, expected_move_in_date,
    actual_make_ready_date, date_listed, date_applications_received,
    date_lease_signed, actual_move_in_date, created_by, stage, closed_at
  ) values (
    v_org, v_prop_b, v_owner, '12', 1650,
    current_date - 60, current_date - 46, current_date - 43,
    current_date - 30, current_date - 19,
    current_date - 45, current_date - 42, current_date - 36,
    current_date - 31, current_date - 18, v_owner, 'completed', now()
  );
end $$;
