-- aehT database schema. Run this once in Supabase → SQL Editor → New query.
-- It is idempotent: re-running it is safe.

-- ---------------------------------------------------------------------------
-- Profiles: one row per user (display name, app settings, streak activity)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  settings jsonb not null default '{}'::jsonb,
  activity jsonb not null default '{"days": [], "answered": 0, "correct": 0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Folders (courses / subjects)
-- ---------------------------------------------------------------------------
create table if not exists public.folders (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists folders_user_idx on public.folders (user_id);

-- ---------------------------------------------------------------------------
-- Study kits. `data` holds cards, questions, concepts, mastery, guide,
-- summary, podcast script, chat and test history. The (potentially large)
-- extracted source material lives in its own column so it is only loaded
-- when a kit is opened.
-- ---------------------------------------------------------------------------
create table if not exists public.kits (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id text,
  title text not null default '',
  data jsonb not null default '{}'::jsonb,
  source_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kits_user_updated_idx on public.kits (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Daily AI usage counter (protects the server-side Gemini key from abuse)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  count integer not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Row level security: every user can only ever see and change their own rows
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.kits enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "profiles: own row" on public.profiles;
create policy "profiles: own row" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "folders: own rows" on public.folders;
create policy "folders: own rows" on public.folders
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "kits: own rows" on public.kits;
create policy "kits: own rows" on public.kits
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_usage: read own" on public.ai_usage;
create policy "ai_usage: read own" on public.ai_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Users can only *increase* their own counter, through this function.
create or replace function public.bump_ai_usage()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.ai_usage (user_id, day, count)
  values (uid, current_date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count into n;
  return n;
end;
$$;
revoke all on function public.bump_ai_usage() from public, anon;
grant execute on function public.bump_ai_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- Create a profile automatically when someone signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Storage: private buckets for uploaded source files and podcast audio.
-- Files are stored under "<user id>/..." and only that user can touch them.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('sources', 'sources', false), ('podcasts', 'podcasts', false)
on conflict (id) do nothing;

drop policy if exists "aeht storage: own folder read" on storage.objects;
create policy "aeht storage: own folder read" on storage.objects
  for select to authenticated
  using (bucket_id in ('sources', 'podcasts') and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "aeht storage: own folder insert" on storage.objects;
create policy "aeht storage: own folder insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('sources', 'podcasts') and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "aeht storage: own folder update" on storage.objects;
create policy "aeht storage: own folder update" on storage.objects
  for update to authenticated
  using (bucket_id in ('sources', 'podcasts') and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "aeht storage: own folder delete" on storage.objects;
create policy "aeht storage: own folder delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('sources', 'podcasts') and (storage.foldername(name))[1] = (select auth.uid())::text);
