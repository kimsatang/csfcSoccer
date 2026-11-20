-- CSFC 프로토타입: 실력 = 등급(지표) 하나로 (2026-11-16)
-- 1) 지표를 저장하면 실력(1~10)을 지표 평균(반올림)으로 맞춤 → 팀 편성·드래프트가 같은 값을 씀
-- 2) 팀장 '등급만' 공개: 지표가 없는 회원은 실력으로 등급을 매겨 내려줌

create or replace function private.sync_skill_from_ratings() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v numeric;
begin
  select avg(x) into v from unnest(array[new.attack, new.technique, new.pass, new.defense, new.physical, new.speed]) x;
  if v is not null then
    update public.members
       set skill = greatest(1, least(10, round(v)))::smallint, needs_review = false
     where id = new.member_id
       and (skill is distinct from greatest(1, least(10, round(v)))::smallint or needs_review);
  end if;
  return new;
end $$;

drop trigger if exists member_ratings_sync_skill on public.member_ratings;
create trigger member_ratings_sync_skill after insert or update on public.member_ratings
  for each row execute function private.sync_skill_from_ratings();

-- 이미 지표가 있는 회원 한 번 맞추기
update public.members m
   set skill = greatest(1, least(10, round(a.v)))::smallint, needs_review = false
  from (select r.member_id, (select avg(x) from unnest(array[r.attack, r.technique, r.pass, r.defense, r.physical, r.speed]) x) as v
          from public.member_ratings r) a
 where a.member_id = m.id and a.v is not null;

create or replace function public.list_member_grades() returns table (member_id uuid, grade text)
language plpgsql stable security definer set search_path = '' as $$
declare v_steps jsonb;
begin
  if not (private.can_see_ratings()
          or (private.rating_visibility() = 'leader_grade' and (private.is_admin() or private.is_leader()))) then
    return;
  end if;
  select value into v_steps from public.app_settings where key = 'rating_grades';
  -- 지표 평균, 없으면 실력(미입력 회원 제외). grade_for는 빈 값에 맨 아래 등급을 주므로 값이 있는 회원만 넘김
  return query
    select x.id, private.grade_for(x.v, v_steps) from (
      select m.id, coalesce(
               (select avg(a) from unnest(array[r.attack, r.technique, r.pass, r.defense, r.physical, r.speed]) a),
               case when m.needs_review then null else m.skill::numeric end) as v
        from public.members m
        left join public.member_ratings r on r.member_id = m.id
    ) x
    where x.v is not null;
end $$;
revoke all on function public.list_member_grades() from public, anon;
grant execute on function public.list_member_grades() to authenticated;
