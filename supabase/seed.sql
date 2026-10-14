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

-- The owner's house, so a local sign-in lands in the app shell. (The real first house is made
-- through /setup in T15.)
insert into public.profiles (id, display_name) values ('5eed0000-0000-4000-8000-000000000001', 'Kavya');
insert into public.houses (id, name, created_by, settings) values (
  '5eed0000-0000-4000-8000-000000000101', 'The apartment', '5eed0000-0000-4000-8000-000000000001',
  '{"timezone":"America/New_York","feeling_weights":{"anxious":20,"frustrated":15,"confused":5,"fine":0,"meh":-5,"thanks":0},"invite_ttl_days":7}'
);
insert into public.house_members (house_id, user_id, role)
values ('5eed0000-0000-4000-8000-000000000101', '5eed0000-0000-4000-8000-000000000001', 'admin');

-- The apartment's rooms (FRONTEND §4.1; same list as lib/domain/rooms.ts).
insert into public.rooms (id, house_id, name, floor, kind, element, sort_order) values
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Front door', 'first', 'entry', NULL, 0),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Hallway', 'first', 'common', NULL, 1),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Air', 'first', 'bedroom', 'air', 2),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Fire', 'first', 'bedroom', 'fire', 3),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Water', 'first', 'bedroom', 'water', 4),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Bathroom 1', 'first', 'bath', NULL, 5),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Bathroom 2', 'first', 'bath', NULL, 6),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Kitchen', 'first', 'common', NULL, 7),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Living room', 'first', 'common', NULL, 8),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Stairs', 'first', 'common', NULL, 9),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Downstairs living room', 'basement', 'common', NULL, 10),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Bathroom 3', 'basement', 'bath', NULL, 11),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Laundry', 'basement', 'utility', NULL, 12),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Craft room', 'basement', 'common', NULL, 13),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Earth', 'basement', 'bedroom', 'earth', 14),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Fitness space', 'basement', 'common', NULL, 15),
  (gen_random_uuid(), '5eed0000-0000-4000-8000-000000000101', 'Garden', 'outside', 'outdoor', NULL, 16);

-- The owner lives in Air.
update public.house_members set room_id = (select id from public.rooms where name = 'Air' and house_id = '5eed0000-0000-4000-8000-000000000101')
where user_id = '5eed0000-0000-4000-8000-000000000001';
