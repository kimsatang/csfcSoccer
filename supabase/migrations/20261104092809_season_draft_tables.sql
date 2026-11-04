-- 시즌 고정팀 + 팀장 스네이크 드래프트 (1) 테이블·RLS
-- 시즌: 기간 동안 같은 팀 유지 (예: 2026년 11월 매주 월요일)

create table public.seasons (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  starts_on     date not null,
  ends_on       date not null,
  match_weekday smallint not null default 1 check (match_weekday between 0 and 6), -- 0=일 … 1=월
  status        text not null default 'DRAFTING' check (status in ('DRAFTING','ACTIVE','CLOSED')),
  created_at    timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.season_teams (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.seasons(id) on delete cascade,
  slot        smallint not null check (slot between 0 and 2),        -- 0=빨강 1=파랑 2=노랑
  name        text not null,
  captain_id  uuid not null references public.members(id),
  vice_id     uuid not null references public.members(id),
  draft_order smallint not null check (draft_order between 0 and 2), -- 1라운드 지명 순서
  unique (season_id, slot),
  unique (season_id, draft_order),
  unique (season_id, captain_id),
  unique (season_id, vice_id),
  check (captain_id <> vice_id)
);
create index season_teams_captain_id_idx on public.season_teams(captain_id);
create index season_teams_vice_id_idx on public.season_teams(vice_id);

create table public.draft_picks (
  season_id uuid not null references public.seasons(id) on delete cascade,
  pick_no   int not null check (pick_no >= 1),
  team_id   uuid not null references public.season_teams(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  picked_at timestamptz not null default now(),
  primary key (season_id, pick_no),
  unique (season_id, member_id)
);
create index draft_picks_team_id_idx on public.draft_picks(team_id);
create index draft_picks_member_id_idx on public.draft_picks(member_id);

alter table public.matches add column season_id uuid references public.seasons(id) on delete set null;
create index matches_season_id_idx on public.matches(season_id);

-- 권한 / RLS (운영진만)
revoke all on public.seasons, public.season_teams, public.draft_picks from anon;
grant select, insert, update, delete on public.seasons, public.season_teams, public.draft_picks to authenticated;
alter table public.seasons      enable row level security;
alter table public.season_teams enable row level security;
alter table public.draft_picks  enable row level security;

create policy "seasons_all_by_admin" on public.seasons
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "season_teams_all_by_admin" on public.season_teams
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "draft_picks_all_by_admin" on public.draft_picks
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
