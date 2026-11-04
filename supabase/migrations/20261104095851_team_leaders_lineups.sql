-- 팀장·부팀장 초대 링크 가입 + 팀 관리(날짜별 참석, 경기별 라인업)
-- 권한 요약
--   운영진(admins): 전체
--   팀장·부팀장(team_leaders): 회원·시즌·드래프트 조회, 자기 팀 차례에만 지명, 자기 팀 참석·라인업 관리

-- 1) 팀장 계정 연결 ---------------------------------------------------------
create table public.team_leaders (
  user_id        uuid not null references auth.users(id) on delete cascade,
  season_team_id uuid not null references public.season_teams(id) on delete cascade,
  role           text not null check (role in ('CAPTAIN','VICE')),
  member_id      uuid references public.members(id) on delete set null,
  email          text,
  created_at     timestamptz not null default now(),
  primary key (user_id, season_team_id)
);
create index team_leaders_season_team_id_idx on public.team_leaders(season_team_id);
create index team_leaders_member_id_idx on public.team_leaders(member_id);

create table public.team_invites (
  token          text primary key default replace(gen_random_uuid()::text, '-', ''),
  season_team_id uuid not null references public.season_teams(id) on delete cascade,
  role           text not null check (role in ('CAPTAIN','VICE')),
  member_id      uuid references public.members(id) on delete set null,
  claimed_by     uuid references auth.users(id) on delete set null,
  claimed_email  text,
  claimed_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (season_team_id, role)
);
create index team_invites_member_id_idx on public.team_invites(member_id);
create index team_invites_claimed_by_idx on public.team_invites(claimed_by);

create or replace function private.is_leader()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_leaders where user_id = auth.uid());
$$;

create or replace function private.leads_team(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_leaders where user_id = auth.uid() and season_team_id = p_team);
$$;
revoke all on function private.is_leader(), private.leads_team(uuid) from public, anon;
grant execute on function private.is_leader(), private.leads_team(uuid) to authenticated;

-- 2) 팀 관리 데이터 ---------------------------------------------------------
create table public.team_days (
  season_team_id uuid not null references public.season_teams(id) on delete cascade,
  played_on      date not null,
  attendee_ids   uuid[] not null default '{}',
  updated_by     uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now(),
  primary key (season_team_id, played_on)
);
create index team_days_updated_by_idx on public.team_days(updated_by);

create table public.team_games (
  season_team_id   uuid not null references public.season_teams(id) on delete cascade,
  played_on        date not null,
  game_no          smallint not null check (game_no between 1 and 10),
  formation        text not null default '4-4-2',
  slots            jsonb not null default '{}'::jsonb,  -- { "GK": memberId, "LB": memberId, ... }
  opponent_team_id uuid references public.season_teams(id) on delete set null,
  updated_by       uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at       timestamptz not null default now(),
  primary key (season_team_id, played_on, game_no)
);
create index team_games_opponent_team_id_idx on public.team_games(opponent_team_id);
create index team_games_updated_by_idx on public.team_games(updated_by);

-- 3) 권한 ---------------------------------------------------------------------
revoke all on public.team_leaders, public.team_invites, public.team_days, public.team_games from anon;
grant select on public.team_leaders to authenticated;
grant select, insert, update, delete on public.team_invites, public.team_days, public.team_games to authenticated;

alter table public.team_leaders enable row level security;
alter table public.team_invites enable row level security;
alter table public.team_days    enable row level security;
alter table public.team_games   enable row level security;

create policy "team_leaders_select_own_or_admin" on public.team_leaders
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "team_invites_all_by_admin" on public.team_invites
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "team_days_all_by_admin_or_leader" on public.team_days
  for all to authenticated
  using ((select private.is_admin()) or (select private.leads_team(season_team_id)))
  with check ((select private.is_admin()) or (select private.leads_team(season_team_id)));

create policy "team_games_all_by_admin_or_leader" on public.team_games
  for all to authenticated
  using ((select private.is_admin()) or (select private.leads_team(season_team_id)))
  with check ((select private.is_admin()) or (select private.leads_team(season_team_id)));

-- 기존 테이블: 팀장 조회 허용 (운영진 정책과 OR로 합쳐짐)
create policy "members_select_by_leader" on public.members
  for select to authenticated using ((select private.is_leader()));
create policy "seasons_select_by_leader" on public.seasons
  for select to authenticated using ((select private.is_leader()));
create policy "season_teams_select_by_leader" on public.season_teams
  for select to authenticated using ((select private.is_leader()));
create policy "draft_picks_select_by_leader" on public.draft_picks
  for select to authenticated using ((select private.is_leader()));
-- 지명: 팀장은 자기 팀 이름으로만 기록 가능 (make_pick이 차례 팀을 계산하므로 = 자기 차례에만 성공)
create policy "draft_picks_insert_by_leader" on public.draft_picks
  for insert to authenticated with check ((select private.leads_team(team_id)));

-- 4) make_pick: 팀장도 호출 가능하도록 잠금 방식 변경 (FOR UPDATE는 시즌 수정 권한이 필요)
create or replace function public.make_pick(p_season_id uuid, p_member_id uuid)
returns public.draft_picks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_next   int;
  v_team   uuid;
  v_row    public.draft_picks;
begin
  perform pg_advisory_xact_lock(hashtext('draft:' || p_season_id::text));
  select status into v_status from public.seasons where id = p_season_id;
  if v_status is null then raise exception '시즌을 찾을 수 없습니다.'; end if;
  if v_status <> 'DRAFTING' then raise exception '드래프트가 끝난 시즌입니다.'; end if;

  if exists (select 1 from public.season_teams
             where season_id = p_season_id and p_member_id in (captain_id, vice_id)) then
    raise exception '팀장·부팀장은 지명할 수 없습니다.';
  end if;
  if exists (select 1 from public.draft_picks where season_id = p_season_id and member_id = p_member_id) then
    raise exception '이미 지명된 회원입니다.';
  end if;
  if not exists (select 1 from public.members where id = p_member_id and status = 'ACTIVE') then
    raise exception '활동 회원만 지명할 수 있습니다.';
  end if;

  select coalesce(max(pick_no), 0) + 1 into v_next from public.draft_picks where season_id = p_season_id;
  v_team := public.draft_team_for_pick(p_season_id, v_next);
  if v_team is null then raise exception '시즌 팀 설정(3팀, 지명 순서)이 올바르지 않습니다.'; end if;
  if not (private.is_admin() or private.leads_team(v_team)) then
    raise exception '지금은 % 차례입니다.', (select name from public.season_teams where id = v_team);
  end if;

  insert into public.draft_picks (season_id, pick_no, team_id, member_id)
  values (p_season_id, v_next, v_team, p_member_id)
  returning * into v_row;
  return v_row;
end;
$$;

-- 5) 초대 링크 RPC ------------------------------------------------------------
-- 로그인 전 화면에 "OO팀 팀장 초대"를 보여주기 위한 조회 (토큰을 아는 사람만)
create or replace function public.invite_info(p_token text)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'team_name', t.name, 'role', i.role, 'member_name', m.name,
    'season_name', s.name, 'claimed', i.claimed_by is not null)
  from public.team_invites i
  join public.season_teams t on t.id = i.season_team_id
  join public.seasons s on s.id = t.season_id
  left join public.members m on m.id = i.member_id
  where i.token = p_token;
$$;
revoke all on function public.invite_info(text) from public;
grant execute on function public.invite_info(text) to anon, authenticated;

-- 로그인한 사용자를 초대받은 팀의 팀장·부팀장으로 등록
create or replace function public.claim_invite(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv   public.team_invites;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  select * into v_inv from public.team_invites where token = p_token;
  if not found then raise exception '유효하지 않은 초대 링크입니다. 운영진에게 새 링크를 요청하세요.'; end if;
  if v_inv.claimed_by is not null and v_inv.claimed_by <> v_uid then
    raise exception '이미 다른 계정(%)으로 가입된 링크입니다. 운영진에게 재발급을 요청하세요.', v_inv.claimed_email;
  end if;

  insert into public.team_leaders (user_id, season_team_id, role, member_id, email)
  values (v_uid, v_inv.season_team_id, v_inv.role, v_inv.member_id, v_email)
  on conflict (user_id, season_team_id) do update set role = excluded.role, member_id = excluded.member_id, email = excluded.email;

  update public.team_invites
     set claimed_by = v_uid, claimed_email = v_email, claimed_at = coalesce(claimed_at, now())
   where token = p_token;

  return public.invite_info(p_token);
end;
$$;
revoke all on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;

-- 6) 현재 시즌 팀장·부팀장 6명 초대 링크 생성 ---------------------------------
insert into public.team_invites (season_team_id, role, member_id)
select t.id, r.role, case r.role when 'CAPTAIN' then t.captain_id else t.vice_id end
from public.season_teams t
cross join (values ('CAPTAIN'), ('VICE')) as r(role)
on conflict (season_team_id, role) do nothing;
