-- 경기 당일(운영진) 참석 체크 → 팀 관리(team_days) 반영
-- 운영진은 팀 관리 쓰기 권한이 없으므로(조회 전용), 참석 반영만 하는 전용 함수로 처리한다.
--  - 바뀐 회원만 반영(diff): 팀장이 입력해 둔 다른 회원의 참석은 건드리지 않음
--  - 불참·다른 팀으로 이동하면 원래 팀의 참석·라인업 자리에서 빠짐

-- 전용 함수 안에서만 팀 관리 쓰기 검사를 건너뛰도록 (트랜잭션 로컬 설정)
create or replace function private.guard_team_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_team uuid := coalesce(new.season_team_id, old.season_team_id);
begin
  if auth.uid() is not null
     and coalesce(current_setting('app.day_attendance_sync', true), '') <> 'on'
     and not (private.is_super() or private.leads_team(v_team)) then
    raise exception '다른 팀의 참석·라인업은 조회만 할 수 있습니다.';
  end if;
  return coalesce(new, old);
end;
$$;

/**
 * p_changes: [{ "member_id": uuid, "team_id": uuid | null }, ...]
 *   team_id = 그날 뛰는 팀 (null이면 불참)
 */
create or replace function public.apply_day_attendance(p_date date, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        jsonb;
  v_member uuid;
  v_team   uuid;
begin
  if not private.is_admin() then
    raise exception '경기 당일 참석 반영은 운영진만 할 수 있습니다.';
  end if;
  if jsonb_typeof(p_changes) <> 'array' then
    raise exception '잘못된 요청입니다.';
  end if;
  perform set_config('app.day_attendance_sync', 'on', true);

  for c in select * from jsonb_array_elements(p_changes) loop
    v_member := (c->>'member_id')::uuid;
    v_team   := nullif(c->>'team_id', '')::uuid;
    if v_team is not null and not exists (select 1 from public.season_teams where id = v_team) then
      raise exception '알 수 없는 팀입니다.';
    end if;

    -- 다른 팀(또는 불참이면 모든 팀)의 참석·라인업에서 빼기
    update public.team_days
       set attendee_ids = array_remove(attendee_ids, v_member), updated_at = now()
     where played_on = p_date and v_member = any(attendee_ids)
       and season_team_id is distinct from v_team;
    update public.team_games g
       set slots = (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                      from jsonb_each(g.slots) e where e.value <> to_jsonb(v_member::text)),
           updated_at = now()
     where g.played_on = p_date and g.slots @> '{}'::jsonb
       and exists (select 1 from jsonb_each(g.slots) e where e.value = to_jsonb(v_member::text))
       and g.season_team_id is distinct from v_team;

    -- 그날 팀에 참석 추가
    if v_team is not null then
      insert into public.team_days (season_team_id, played_on, attendee_ids)
      values (v_team, p_date, array[v_member])
      on conflict (season_team_id, played_on) do update
        set attendee_ids = case when v_member = any(public.team_days.attendee_ids)
                                then public.team_days.attendee_ids
                                else public.team_days.attendee_ids || v_member end,
            updated_at = now();
    end if;
  end loop;

  perform set_config('app.day_attendance_sync', '', true);
end;
$$;

revoke all on function public.apply_day_attendance(date, jsonb) from public, anon;
grant execute on function public.apply_day_attendance(date, jsonb) to authenticated;
