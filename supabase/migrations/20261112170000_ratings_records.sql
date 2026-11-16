-- CSFC 프로토타입: 선수 지표·등급 + 경기 기록 (2026-11-12)
-- Supabase SQL Editor에 그대로 붙여 넣어 실행. 기존 테이블·화면은 건드리지 않음 (추가만)

-- ── 1. 설정 ────────────────────────────────────────────
-- rating_visibility: super(슈퍼만) | admin(운영진, 기본) | leader_grade(팀장은 등급만) | leader_all(팀장도 지표까지)
-- rating_grades: [{"grade":"S","min":8.5}, ...] 지표 평균이 min 이상이면 그 등급
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('rating_visibility', '"admin"'),
  ('rating_grades', '[{"grade":"S","min":8.5},{"grade":"A","min":7},{"grade":"B","min":5.5},{"grade":"C","min":4},{"grade":"D","min":0}]')
on conflict (key) do nothing;

revoke all on public.app_settings from anon;
grant select, insert, update on public.app_settings to authenticated;
alter table public.app_settings enable row level security;
create policy "app_settings_read" on public.app_settings for select to authenticated
  using ((select private.is_admin()) or (select private.is_leader()));
create policy "app_settings_write_super" on public.app_settings for all to authenticated
  using ((select private.is_super())) with check ((select private.is_super()));

create or replace function private.rating_visibility() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select value #>> '{}' from public.app_settings where key = 'rating_visibility'), 'admin')
$$;

-- 지표 숫자를 볼 수 있는지
create or replace function private.can_see_ratings() returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.rating_visibility()
    when 'super' then private.is_super()
    when 'leader_all' then private.is_admin() or private.is_leader()
    else private.is_admin()
  end
$$;

-- 지표를 입력할 수 있는지 (팀장은 입력 불가)
create or replace function private.can_write_ratings() returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.rating_visibility() when 'super' then private.is_super() else private.is_admin() end
$$;
revoke all on function private.rating_visibility(), private.can_see_ratings(), private.can_write_ratings() from public, anon;
grant execute on function private.rating_visibility(), private.can_see_ratings(), private.can_write_ratings() to authenticated;

-- ── 2. 선수 지표 ───────────────────────────────────────
create table if not exists public.member_ratings (
  member_id  uuid primary key references public.members(id) on delete cascade,
  attack     smallint check (attack between 1 and 10),
  technique  smallint check (technique between 1 and 10),
  pass       smallint check (pass between 1 and 10),
  defense    smallint check (defense between 1 and 10),
  physical   smallint check (physical between 1 and 10),
  speed      smallint check (speed between 1 and 10),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger member_ratings_touch before update on public.member_ratings
  for each row execute function private.touch_updated_at();

revoke all on public.member_ratings from anon;
grant select, insert, update, delete on public.member_ratings to authenticated;
alter table public.member_ratings enable row level security;
create policy "member_ratings_read" on public.member_ratings for select to authenticated
  using ((select private.can_see_ratings()));
create policy "member_ratings_write" on public.member_ratings for all to authenticated
  using ((select private.can_write_ratings())) with check ((select private.can_write_ratings()));

create or replace function private.grade_for(p_avg numeric, p_steps jsonb) returns text
language sql immutable set search_path = '' as $$
  with steps as (
    select s->>'grade' as grade, (s->>'min')::numeric as min
      from jsonb_array_elements(coalesce(nullif(p_steps, 'null'::jsonb),
        '[{"grade":"S","min":8.5},{"grade":"A","min":7},{"grade":"B","min":5.5},{"grade":"C","min":4},{"grade":"D","min":0}]'::jsonb)) s
  )
  select coalesce(
    (select grade from steps where p_avg >= min order by min desc limit 1),
    (select grade from steps order by min asc limit 1))
$$;

-- 등급만 (숫자 없이). 지표를 볼 수 있거나, 팀장 '등급만' 공개일 때
create or replace function public.list_member_grades() returns table (member_id uuid, grade text)
language plpgsql stable security definer set search_path = '' as $$
declare v_steps jsonb;
begin
  if not (private.can_see_ratings()
          or (private.rating_visibility() = 'leader_grade' and (private.is_admin() or private.is_leader()))) then
    return;
  end if;
  select value into v_steps from public.app_settings where key = 'rating_grades';
  return query
    select r.member_id, private.grade_for(
      (select avg(v) from unnest(array[r.attack, r.technique, r.pass, r.defense, r.physical, r.speed]) v), v_steps)
      from public.member_ratings r
     where coalesce(r.attack, r.technique, r.pass, r.defense, r.physical, r.speed) is not null;
end $$;
revoke all on function public.list_member_grades() from public, anon;
grant execute on function public.list_member_grades() to authenticated;

-- ── 3. 경기 기록 ───────────────────────────────────────
-- 경기일의 게임(1경기·2경기…): 시즌 팀 vs 시즌 팀. 점수는 골 기록으로 계산
create table if not exists public.day_games (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references public.seasons(id) on delete cascade,
  played_on    date not null,
  game_no      smallint not null check (game_no between 1 and 20),
  home_team_id uuid not null references public.season_teams(id) on delete cascade,
  away_team_id uuid not null references public.season_teams(id) on delete cascade,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (season_id, played_on, game_no),
  check (home_team_id <> away_team_id)
);
create index if not exists day_games_day_idx on public.day_games (played_on);

-- 골: team_id = 점수가 올라가는 팀. 득점자는 회원 또는 이름(용병), 둘 다 없으면 "모름"
create table if not exists public.day_goals (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.day_games(id) on delete cascade,
  team_id     uuid not null references public.season_teams(id) on delete cascade,
  kind        text not null default 'GOAL' check (kind in ('GOAL', 'OWN_GOAL')),
  scorer_id   uuid references public.members(id) on delete set null,
  scorer_name text check (char_length(scorer_name) <= 30),
  assist_id   uuid references public.members(id) on delete set null,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (assist_id is null or assist_id <> scorer_id),
  check (kind = 'GOAL' or assist_id is null)
);
create index if not exists day_goals_game_idx on public.day_goals (game_id);
create index if not exists day_goals_scorer_idx on public.day_goals (scorer_id);
create index if not exists day_goals_assist_idx on public.day_goals (assist_id);

create or replace function private.check_day_goal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.day_games g where g.id = new.game_id and new.team_id in (g.home_team_id, g.away_team_id)) then
    raise exception '그 게임에 나오지 않는 팀입니다.';
  end if;
  return new;
end $$;
create trigger day_goals_check before insert or update on public.day_goals
  for each row execute function private.check_day_goal();

-- 경기일 MVP (하루 1명)
create table if not exists public.day_mvps (
  season_id  uuid not null references public.seasons(id) on delete cascade,
  played_on  date not null,
  member_id  uuid not null references public.members(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (season_id, played_on)
);

-- 권한: 보기 = 운영진·팀장, 기록 = 운영진(슈퍼 포함) + 그 게임 두 팀의 팀장·부팀장, MVP = 운영진
revoke all on public.day_games, public.day_goals, public.day_mvps from anon;
grant select, insert, update, delete on public.day_games, public.day_goals, public.day_mvps to authenticated;
alter table public.day_games enable row level security;
alter table public.day_goals enable row level security;
alter table public.day_mvps enable row level security;

create policy "day_games_read" on public.day_games for select to authenticated
  using ((select private.is_admin()) or (select private.is_leader()));
create policy "day_games_write" on public.day_games for all to authenticated
  using ((select private.is_admin()) or private.leads_team(home_team_id) or private.leads_team(away_team_id))
  with check ((select private.is_admin()) or private.leads_team(home_team_id) or private.leads_team(away_team_id));

create policy "day_goals_read" on public.day_goals for select to authenticated
  using ((select private.is_admin()) or (select private.is_leader()));
create policy "day_goals_write" on public.day_goals for all to authenticated
  using ((select private.is_admin()) or exists (
    select 1 from public.day_games g where g.id = game_id and (private.leads_team(g.home_team_id) or private.leads_team(g.away_team_id))))
  with check ((select private.is_admin()) or exists (
    select 1 from public.day_games g where g.id = game_id and (private.leads_team(g.home_team_id) or private.leads_team(g.away_team_id))));

create policy "day_mvps_read" on public.day_mvps for select to authenticated
  using ((select private.is_admin()) or (select private.is_leader()));
create policy "day_mvps_write" on public.day_mvps for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
