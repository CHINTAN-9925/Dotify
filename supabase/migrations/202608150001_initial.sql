create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'drifter' check (char_length(display_name) between 1 and 20),
  selected_skin text not null default 'default',
  moderation_status text not null default 'active' check (moderation_status in ('active', 'restricted', 'banned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  games bigint not null default 0,
  deaths bigint not null default 0,
  kills bigint not null default 0,
  total_mass bigint not null default 0,
  best_mass bigint not null default 0,
  best_chain integer not null default 0,
  play_seconds bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.cosmetic_catalog (
  id text primary key,
  name text not null,
  unlock_kind text not null check (unlock_kind in ('default', 'achievement', 'stat')),
  unlock_value integer,
  active boolean not null default true,
  asset_version integer not null default 1
);

create table public.player_cosmetics (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cosmetic_id text not null references public.cosmetic_catalog(id),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, cosmetic_id)
);

create table public.play_sessions (
  id bigint generated always as identity primary key,
  idempotency_key text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id text not null,
  mass integer not null check (mass >= 0),
  best_chain integer not null default 0 check (best_chain >= 0),
  reason text not null,
  updated_at timestamptz not null default now()
);

create index play_sessions_user_updated_idx on public.play_sessions(user_id, updated_at desc);
create index player_stats_best_mass_idx on public.player_stats(best_mass desc);
create index player_stats_best_chain_idx on public.player_stats(best_chain desc);

insert into public.cosmetic_catalog(id, name, unlock_kind) values ('default', 'Signal White', 'default');

alter table public.profiles enable row level security;
alter table public.player_stats enable row level security;
alter table public.cosmetic_catalog enable row level security;
alter table public.player_cosmetics enable row level security;
alter table public.play_sessions enable row level security;

create policy "profiles are readable" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "users read own stats" on public.player_stats for select to authenticated using ((select auth.uid()) = user_id);
create policy "catalog is readable" on public.cosmetic_catalog for select to authenticated using (active);
create policy "users read own cosmetics" on public.player_cosmetics for select to authenticated using ((select auth.uid()) = user_id);
create policy "users read own sessions" on public.play_sessions for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.player_stats from authenticated, anon;
revoke insert, update, delete on public.player_cosmetics from authenticated, anon;
revoke insert, update, delete on public.play_sessions from authenticated, anon;
revoke insert, update, delete on public.cosmetic_catalog from authenticated, anon;

create or replace function public.create_player_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id) on conflict do nothing;
  insert into public.player_stats(user_id) values (new.id) on conflict do nothing;
  insert into public.player_cosmetics(user_id, cosmetic_id) values (new.id, 'default') on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.create_player_profile();
