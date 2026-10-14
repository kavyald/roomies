-- The policy helpers move to a `private` schema the REST API doesn't expose (DEPLOYMENT §8,
-- ARCHITECTURE §5.2), so nobody can call them as RPCs. Policies point at functions by oid, so
-- every policy keeps working without being recreated. The server names one of them
-- (`private.no_house_exists()`, for setup status), so `app_writer` and `service_role` may look the
-- schema up; the browser's `authenticated` role only runs them inside policies.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to app_writer, service_role;

alter function public.is_member(uuid) set schema private;
alter function public.is_admin(uuid) set schema private;
alter function public.shares_house(uuid) set schema private;
alter function public.no_house_exists() set schema private;
alter function public.member_role(uuid, uuid) set schema private;
alter function public.can_claim_house(uuid) set schema private;
alter function public.poll_is_open(uuid) set schema private;
alter function public.only_feeling_weights_changed(uuid, text, text, text, uuid, timestamptz, jsonb)
  set schema private;
