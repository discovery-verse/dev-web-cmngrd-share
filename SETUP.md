# Host setup

This app ships empty. Nothing in the repository is a member, an admin, or a
mail credential. Pick a database, create the first Higher Ground admin, then
send sign-in mail through Resend or SendGrid so messages are not filtered as
Firebase or Supabase default mail.

The Next.js app in this repository talks to **Firestore**. The Supabase chapter
is the equivalent database, access rules, and auth setup if you are replacing
Firestore. It does not add a Supabase client to the app.

Do not commit `.env.local`, service-account JSON, or provider API keys.

Glenn built this template. He runs [Zavior](https://zavior.ai/). He also serves on the boards of SGDCC Foundation and IIPCC Singapore, the RegTech subcommittee of the Singapore FinTech Association, and the council of the Singapore AI Association. Questions: [discoveryversemedia@gmail.com](mailto:discoveryversemedia@gmail.com). More on [LinkedIn](https://www.linkedin.com/in/glenntwh/).

## 1. Add the database (Firestore)

The running app uses this path.

1. Create a Firebase project and register a web app.
2. Create a **Firestore** database in Native mode. Use the `(default)` database. Leave `NEXT_PUBLIC_FIRESTORE_DB_ID` unset unless this app shares the project with another app.
3. Enable **Cloud Storage** (Build → Storage → Get started). Uploads are stored under a `cmngrd/` prefix.
4. Copy `.env.local.example` to `.env.local` and fill in `NEXT_PUBLIC_FIREBASE_*` from Project settings → Your apps.
5. Enable **Authentication → Sign-in method → Email link (passwordless)**. Add `localhost` and your production domain under Authorized domains.
6. Point `.firebaserc` at your project id (`your-project-id` is only a placeholder).
7. Deploy the rules and indexes. The rules are the API: contact details and admin writes are enforced there, not in the UI.

   ```bash
   npm install
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```

8. Create a service-account key with Firestore access and keep it outside the repo. Seed `config/app` and the three sample events (`summit`, `community`, `circle`). Rules read `config/app`; without that document, new message threads are blocked.

   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json npm run seed -- --rooms
   ```

`npm run demo:dev` runs the same app against local emulators with fictional sample people. That data is not a production database.

## 2. Supabase instead of Firestore

Use this chapter when you want Postgres rather than Firestore. Skip section 1. The SQL below matches the app's model. Review the policies before you put real people in the project.

1. Create a Supabase project. It creates the Postgres database. Do not also create Firestore for this path.
2. In the SQL editor, run:

```sql
create table public.members (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  title text not null default '',
  company text not null default '',
  location text not null default '',
  about text not null default '',
  interests text not null default '',
  groups text[] not null default '{}',
  events text[] not null default '{}',
  photo_url text,
  cover_url text,
  name_lower text not null default '',
  company_lower text not null default '',
  created_at timestamptz not null default now()
);

create table public.member_contacts (
  member_id uuid primary key references public.members (id) on delete cascade,
  email text not null default '',
  phone text not null default '',
  linkedin text not null default '',
  links jsonb not null default '[]'::jsonb
);

create table public.connections (
  id text primary key,
  users uuid[] not null,
  requested_by uuid not null,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now()
);

create table public.threads (
  id text primary key,
  participants uuid[] not null,
  participant_names jsonb not null default '{}'::jsonb,
  last_message text not null default '',
  last_sender_id uuid,
  last_message_at timestamptz,
  reads jsonb not null default '{}'::jsonb
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null references public.threads (id) on delete cascade,
  sender_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.events (
  id text primary key,
  name text not null,
  short_name text not null,
  sort_order int not null default 0,
  allow_signups boolean not null default true,
  info_content text not null default ''
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id),
  author_id uuid not null,
  author_name text not null,
  title text not null,
  body text not null default '',
  link text not null default '',
  topic text not null,
  image_url text,
  reacted_by uuid[] not null default '{}',
  reaction_count int not null default 0,
  comment_count int not null default 0,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id),
  name text not null,
  topic text not null default '',
  image_url text not null default '',
  hidden boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.room_participants (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,
  name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  sender_id uuid not null,
  sender_name text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null,
  target_type text not null,
  target_id text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

create table public.banned (
  user_id uuid primary key references auth.users (id) on delete cascade,
  banned_at timestamptz not null default now()
);

create table public.config (
  id text primary key,
  dm_requires_connection boolean not null default false
);

insert into public.events (id, name, short_name, sort_order) values
  ('summit', 'Annual Community Summit', 'Summit', 1),
  ('community', 'Community', 'Community', 2),
  ('circle', 'Members Circle', 'Circle', 3);

insert into public.config (id, dm_requires_connection) values ('app', false);
```

3. Turn on row level security. These policies follow `firestore.rules`: nothing is readable while signed out; a contact row is readable only by its owner or someone with an accepted connection; banned users cannot write; Higher Ground checks `admins`; a new direct message requires an accepted connection when `config.dm_requires_connection` is true.

```sql
alter table public.members enable row level security;
alter table public.member_contacts enable row level security;
alter table public.connections enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.events enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.room_messages enable row level security;
alter table public.reports enable row level security;
alter table public.admins enable row level security;
alter table public.banned enable row level security;
alter table public.config enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.banned where user_id = auth.uid());
$$;

create or replace function public.is_connected(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and auth.uid() = any (users)
      and other = any (users)
  );
$$;

create policy members_read on public.members
  for select to authenticated using (true);
create policy members_update_own on public.members
  for update to authenticated
  using (id = auth.uid() and not public.is_banned())
  with check (id = auth.uid() and not public.is_banned());

create policy contacts_owner on public.member_contacts
  for select to authenticated using (member_id = auth.uid());
create policy contacts_connected on public.member_contacts
  for select to authenticated using (public.is_connected(member_id));
create policy contacts_write_own on public.member_contacts
  for all to authenticated
  using (member_id = auth.uid() and not public.is_banned())
  with check (member_id = auth.uid() and not public.is_banned());

create policy config_read on public.config
  for select to authenticated using (true);

create policy threads_participant on public.threads
  for select to authenticated using (auth.uid() = any (participants));
create policy threads_insert on public.threads
  for insert to authenticated
  with check (
    auth.uid() = any (participants)
    and not public.is_banned()
    and (
      not (select dm_requires_connection from public.config where id = 'app')
      or public.is_connected((select p from unnest(participants) as p where p <> auth.uid() limit 1))
    )
  );

create policy messages_in_thread on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.threads t
      where t.id = thread_id and auth.uid() = any (t.participants)
    )
  );

create policy admins_read_self on public.admins
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy reports_admin on public.reports
  for select to authenticated using (public.is_admin());
create policy reports_insert on public.reports
  for insert to authenticated with check (reporter_id = auth.uid() and not public.is_banned());
```

Tighten write policies for posts, rooms, and connections the same way before production: members cannot grant their own `events` membership, and only an admin creates rooms. `firestore.rules` is the full list of those checks.

4. Create a Storage bucket named `cmngrd`. Allow a signed-in user to upload only under their own prefix, for example `cmngrd/<user id>/`.
5. Enable email magic-link auth. Send it with Resend or SendGrid (section 4), using Supabase Dashboard → Authentication → SMTP. Do not leave Supabase's built-in mailer on.
6. After the first sign-in, copy the user id from Authentication → Users and insert it:

   ```sql
   insert into public.admins (user_id) values ('<user-uuid>');
   ```

7. Keep these in the host environment, not in git:

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ```

   The service role key bypasses row level security. Use it only on the server.

## 3. Set up the Higher Ground admin

Higher Ground is the admin console at `/higherground`. A signed-in member who is not in `admins` sees "Admins only".

**Firestore**

1. Sign in once at `/signin` so Firebase Auth creates the user.
2. Copy that uid from Authentication → Users.
3. Grant it:

   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json npm run seed -- --admin <uid>
   ```

   That writes `admins/{uid}`.
4. Open `/higherground` and request a magic link to the same email.

**Supabase**

Use the insert in section 2 instead of `npm run seed -- --admin`. The seed script talks to Firestore.

## 4. Send mail with Resend or SendGrid

Sign-in still creates the link in the app (`sendSignInLinkToEmail` on `/signin`, and the same flow on `/higherground`). Do not send that mail with Firebase's built-in sender (`noreply@<project>.firebaseapp.com`) or Supabase's built-in mailer. Those shared domains are often filtered.

Pick one provider. Verify a domain you control before you send anything. API keys stay in the provider dashboard and in the SMTP form. Do not commit them.

### Resend

1. Add the sending domain in Resend and publish the DNS records it shows: SPF, DKIM, and a DMARC record (`v=DMARC1; p=none` is enough to start). Wait until Resend marks the domain verified.
2. Create an API key.
3. Point the auth product at Resend's SMTP server:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key
   - From: an address on the verified domain, such as `sign-in@yourdomain.com`
4. Firestore hosts paste those values into Firebase Authentication → Templates → SMTP settings and turn the custom SMTP server on. Supabase hosts paste them into Authentication → SMTP settings.

### SendGrid

1. Authenticate the domain in SendGrid (Settings → Sender Authentication → Domain Authentication) and publish its SPF and DKIM records. Add DMARC on the same domain. A Single Sender works only if you do not have a domain yet; a verified domain filters better.
2. Create an API key with mail send permission.
3. SMTP settings:
   - Host: `smtp.sendgrid.net`
   - Port: `587`
   - Username: `apikey`
   - Password: the SendGrid API key (the username is the literal word `apikey`)
   - From: an address on the authenticated domain
4. Paste those into the same Firebase or Supabase SMTP form as above.

Send a link from `/signin`. It should arrive from your verified address. If it still arrives from `noreply@<project>.firebaseapp.com`, the custom SMTP server is not on.
