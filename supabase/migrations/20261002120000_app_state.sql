-- Applied by the Supabase GitHub integration when this lands on the
-- production branch. It can also be pasted into the SQL editor by hand.
--
-- The whole app keeps one shared row: both phones read and write it, so the
-- log, the ratings, the schedule and the bookshelf are the same everywhere.

create table if not exists public.app_state (
  room text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- The site is a static page, so its anon key is public by necessity. These
-- policies scope what that key can do to this one row: it can read it and
-- write it, and it can touch nothing else in the database.
--
-- Anyone who has the site's URL can therefore change this row. That is the
-- trade for having no login. If you would rather lock it down, replace the
-- two policies below with ones that check a passphrase, or turn on Supabase
-- auth and require auth.uid() is not null.

drop policy if exists "read the shared room" on public.app_state;
create policy "read the shared room"
  on public.app_state for select
  using (room = 'nogatv');

drop policy if exists "write the shared room" on public.app_state;
create policy "write the shared room"
  on public.app_state for all
  using (room = 'nogatv')
  with check (room = 'nogatv');

-- Lets the other phone hear about a change without reloading. Wrapped so the
-- whole file can be run again without erroring on an already added table.
do $$
begin
  alter publication supabase_realtime add table public.app_state;
exception
  when duplicate_object then null;
end
$$;

insert into public.app_state (room) values ('nogatv')
  on conflict (room) do nothing;
