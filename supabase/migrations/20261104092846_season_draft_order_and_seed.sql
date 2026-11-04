-- 시즌 드래프트 (3) 지명 순서를 seasons.draft_team_order로 관리 + 11월 시즌 시드
-- (season_teams.draft_order는 unique·check 제약 때문에 맞바꾸기가 불가 → 초기값으로만 사용)
alter table public.seasons add column draft_team_order uuid[];

create or replace function public.draft_team_for_pick(p_season_id uuid, p_pick_no int)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  with ord as (
    select case when ((p_pick_no - 1) / 3) % 2 = 0
                then (p_pick_no - 1) % 3
                else 2 - (p_pick_no - 1) % 3 end as k
  )
  select coalesce(
    (select s.draft_team_order[ord.k + 1] from public.seasons s, ord
      where s.id = p_season_id and array_length(s.draft_team_order, 1) = 3),
    (select t.id from public.season_teams t, ord
      where t.season_id = p_season_id and t.draft_order = ord.k)
  );
$$;

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
  if array_length(p_team_ids, 1) <> 3
     or (select count(distinct x) from unnest(p_team_ids) x) <> 3
     or (select count(*) from public.season_teams where season_id = p_season_id and id = any(p_team_ids)) <> 3 then
    raise exception '이 시즌의 팀 3개를 한 번씩 지정해야 합니다.';
  end if;
  update public.seasons set draft_team_order = p_team_ids where id = p_season_id;
end;
$$;

-- 시드: 팀장·부팀장 6명(포지션·실력 임시값) + 2026년 11월 시즌 (11/9~11/30 매주 월요일)
insert into public.members (name, main_position, skill, memo)
select v.name, 'MF', 5, '포지션·실력 미입력(임시값)'
from (values ('김동인'),('조인규'),('남상혁'),('이강재'),('이동익'),('최한송')) as v(name)
where not exists (select 1 from public.members m where m.name = v.name);

with s as (
  insert into public.seasons (name, starts_on, ends_on, match_weekday)
  values ('2026년 11월 시즌', date '2026-11-09', date '2026-11-30', 1)
  returning id
)
insert into public.season_teams (season_id, slot, name, captain_id, vice_id, draft_order)
select s.id, t.slot, t.cap || '팀',
       (select id from public.members where name = t.cap limit 1),
       (select id from public.members where name = t.vice limit 1),
       t.slot
from s, (values (0, '김동인', '조인규'), (1, '남상혁', '이강재'), (2, '이동익', '최한송')) as t(slot, cap, vice);
