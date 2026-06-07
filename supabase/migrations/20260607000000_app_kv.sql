-- World Cup Family Draft — shared key/value store
--
-- The app keeps its shared state in two rows ("<league>:wc:state" and
-- "<league>:wc:scores"). Keys are namespaced by a short league code so several
-- family pools can share one Supabase project without colliding.
--
-- This is a casual, link-shared family game with no per-user accounts, so the
-- anon key is granted read/write. Anyone who has the invite link (and thus the
-- league code) can read and update that league's data — which is exactly the
-- intended sharing model. Do not store anything sensitive here.

create table if not exists public.app_kv (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_kv enable row level security;

drop policy if exists "app_kv anon read"   on public.app_kv;
drop policy if exists "app_kv anon insert" on public.app_kv;
drop policy if exists "app_kv anon update" on public.app_kv;

create policy "app_kv anon read"
  on public.app_kv for select
  using (true);

create policy "app_kv anon insert"
  on public.app_kv for insert
  with check (true);

create policy "app_kv anon update"
  on public.app_kv for update
  using (true)
  with check (true);
