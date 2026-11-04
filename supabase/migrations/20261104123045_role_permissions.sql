-- 권한별 컨트롤 정리 (2026-11-04 확정)
--  1) 회원 삭제: 슈퍼관리자만 (운영진은 휴면 처리)
--  2) 팀 관리(참석·라인업) 쓰기: 슈퍼관리자 + 해당 팀 팀장·부팀장 / 운영진은 조회만
--  3) 팀장·부팀장에게 실력·메모 숨김 (members 직접 조회 차단, 전용 함수로만 조회)
--  4) 부팀장 = 팀장과 동일 권한 (기존 유지)
--  5) 드래프트 완료 후 다시 열기·확정 팀 수정: 슈퍼관리자만
-- auth.uid()가 없는 경우(대시보드·마이그레이션 등 서버 작업)는 검사하지 않음

create or replace function private.guard_member_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.is_super() then
    raise exception '회원 삭제는 슈퍼관리자만 할 수 있습니다. 휴면으로 바꿔 주세요.';
  end if;
  return old;
end;
$$;
create trigger members_guard_delete before delete on public.members
for each row execute function private.guard_member_delete();

create or replace function private.guard_team_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_team uuid := coalesce(new.season_team_id, old.season_team_id);
begin
  if auth.uid() is not null and not (private.is_super() or private.leads_team(v_team)) then
    raise exception '다른 팀의 참석·라인업은 조회만 할 수 있습니다.';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger team_days_guard_write before insert or update or delete on public.team_days
for each row execute function private.guard_team_write();
create trigger team_games_guard_write before insert or update or delete on public.team_games
for each row execute function private.guard_team_write();

create or replace function private.guard_season_reopen()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and old.status <> 'DRAFTING' and new.status = 'DRAFTING' and not private.is_super() then
    raise exception '드래프트 완료 후 다시 열기는 슈퍼관리자만 할 수 있습니다.';
  end if;
  return new;
end;
$$;
create trigger seasons_guard_reopen before update on public.seasons
for each row execute function private.guard_season_reopen();

create or replace function private.guard_locked_draft()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from public.seasons where id = coalesce(new.season_id, old.season_id);
  if auth.uid() is not null and v_status <> 'DRAFTING' and not private.is_super() then
    raise exception '확정된 팀 수정은 슈퍼관리자만 할 수 있습니다.';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger draft_picks_guard_locked before insert or update or delete on public.draft_picks
for each row execute function private.guard_locked_draft();

revoke all on function private.guard_member_delete(), private.guard_team_write(), private.guard_season_reopen(), private.guard_locked_draft()
  from public, anon, authenticated;

-- 실력 숨김: 팀장은 members 직접 조회 불가, 실력·메모를 뺀 전용 함수로만 조회
drop policy "members_select_by_leader" on public.members;

create or replace function public.list_members_for_leader()
returns table (
  id uuid, name text, back_number int, main_position text, sub_position text, status text,
  birth_year smallint, attendance_level text, position_review boolean
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.name, m.back_number, m.main_position, m.sub_position, m.status,
         m.birth_year, m.attendance_level, m.position_review
  from public.members m
  where private.is_leader() or private.is_admin()
  order by m.birth_year nulls last, m.name;
$$;
revoke all on function public.list_members_for_leader() from public, anon;
grant execute on function public.list_members_for_leader() to authenticated;

-- make_pick: 팀장은 members를 직접 볼 수 없으므로 활동 여부 확인을 권한 있는 함수로
create or replace function private.member_is_active(p_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where id = p_member and status = 'ACTIVE');
$$;
revoke all on function private.member_is_active(uuid) from public, anon;
grant execute on function private.member_is_active(uuid) to authenticated;

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
  if not private.member_is_active(p_member_id) then
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
