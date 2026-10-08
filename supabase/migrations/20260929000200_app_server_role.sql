-- The role the Next.js server connects as (ARCHITECTURE §4.1). It owns nothing and can read or
-- write nothing by itself: each UnitOfWork transaction switches role with `set local role`:
--   members → authenticated (+ their JWT claims), so RLS applies exactly as in the browser
--   jobs    → service_role (bypasses RLS; the system actor)
-- The password is set per environment: seed.sql locally, the dashboard/CLI on hosted projects.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_server') then
    create role app_server with login noinherit;
  end if;
end
$$;

grant authenticated to app_server;
grant service_role to app_server;
