-- ============================================================================
-- Platform super admin flag.
--
-- Role hierarchy:
--   super admin  (profiles.is_super_admin) — platform operator. Sees every org
--                on /admin and manages users + roles across all orgs.
--   owner        (org_members.role)       — full control of their own org.
--   manager      (org_members.role)       — day-to-day work in their org.
--
-- The flag can only be changed with the service role (SQL editor / server).
-- A trigger blocks users from granting it to themselves through the
-- "update own profile" / "insert own profile" RLS policies.
-- Safe to re-run.
-- ============================================================================

alter table profiles
  add column if not exists is_super_admin boolean not null default false;

create or replace function guard_super_admin_flag()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Service role and direct SQL (no JWT) may change the flag.
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.is_super_admin then
    raise exception 'is_super_admin can only be set by the platform operator';
  end if;

  if tg_op = 'UPDATE' and new.is_super_admin is distinct from old.is_super_admin then
    raise exception 'is_super_admin can only be changed by the platform operator';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_super_admin on profiles;
create trigger profiles_guard_super_admin
  before insert or update on profiles
  for each row execute function guard_super_admin_flag();

-- Justin is the platform super admin.
update profiles
  set is_super_admin = true
  where lower(email) = 'justin.sobojinski@gmail.com';
