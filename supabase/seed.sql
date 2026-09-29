-- Local sample data, loaded by `supabase db reset`. Tests don't rely on it: each test builds its
-- own house (TESTING.md §4). Never used on hosted projects.

-- One existing account, so a returning sign-in has someone to send a code to.
-- owner@roomies.test gets a code; any other email gets nothing (public sign-up is off).
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
) values (
  '00000000-0000-0000-0000-000000000000', '5eed0000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'owner@roomies.test', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values (
  '5eed0000-0000-4000-8000-000000000001', '5eed0000-0000-4000-8000-000000000001',
  '5eed0000-0000-4000-8000-000000000001', 'email',
  '{"sub":"5eed0000-0000-4000-8000-000000000001","email":"owner@roomies.test","email_verified":true}',
  now(), now(), now()
);

-- Local-only password for the server's database role (see migration app_server_role). Hosted
-- projects set their own; this one only ever opens the Docker database on 127.0.0.1.
alter role app_server with password 'app-server-local-only';
