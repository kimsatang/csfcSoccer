-- 시즌 드래프트 (2) 함수: 지명 팀 계산, 지명, 순서 변경, 드래프트 완료
-- 지명 취소(undo)는 앱에서 마지막 draft_picks 행을 삭제 (RLS로 운영진만 가능)

-- 다음 지명 팀 계산 (스네이크)
create or replace function public.draft_team_for_pick(p_season_id uuid, p_pick_no int)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id
  from public.season_teams t
  where t.season_id = p_season_id
    and t.draft_order = case when ((p_pick_no - 1) / 3) % 2 = 0
                             then (p_pick_no - 1) % 3
                             else 2 - (p_pick_no - 1) % 3 end;
$$;

-- 지명: 서버가 차례를 계산하므로 여러 기기에서 동시에 눌러도 순서가 꼬이지 않음
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
  select status into v_status from public.seasons where id = p_season_id for update;
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

  insert into public.draft_picks (season_id, pick_no, team_id, member_id)
  values (p_season_id, v_next, v_team, p_member_id)
  returning * into v_row;
  return v_row;
end;
$$;

-- 지명 순서 변경 (첫 지명 전에만)
create or replace function public.set_draft_order(p_season_id uuid, p_team_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.draft_picks where season_id = p_season_id) then
    raise exception '지명이 시작된 뒤에는 순서를 바꿀 수 없습니다.';
  end if;
  if array_length(p_team_ids, 1) <> 3 then raise exception '팀 3개의 순서가 필요합니다.'; end if;
  update public.season_teams set draft_order = draft_order + 10 where season_id = p_season_id;
  update public.season_teams t
     set draft_order = o.ord - 1
    from unnest(p_team_ids) with ordinality as o(team_id, ord)
   where t.id = o.team_id and t.season_id = p_season_id;
  if exists (select 1 from public.season_teams where season_id = p_season_id and draft_order > 2) then
    raise exception '시즌 팀 id가 올바르지 않습니다.';
  end if;
end;
$$;

-- 드래프트 완료 → 시즌 확정
create or replace function public.finish_draft(p_season_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.seasons set status = 'ACTIVE' where id = p_season_id and status = 'DRAFTING';
$$;



revoke all on function public.draft_team_for_pick(uuid, int), public.make_pick(uuid, uuid),
  public.set_draft_order(uuid, uuid[]), public.finish_draft(uuid) from public, anon;
grant execute on function public.draft_team_for_pick(uuid, int), public.make_pick(uuid, uuid),
  public.set_draft_order(uuid, uuid[]), public.finish_draft(uuid) to authenticated;
