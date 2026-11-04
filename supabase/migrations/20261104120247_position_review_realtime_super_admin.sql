-- 1) 미입력 표시 분리: needs_review = 실력 미입력, position_review = 포지션 미입력
alter table public.members add column position_review boolean not null default false;
update public.members set position_review = needs_review;
comment on column public.members.needs_review is '실력이 임시값(5)이라 입력 필요';
comment on column public.members.position_review is '포지션이 임시값(미드)이라 입력 필요';

-- 2) 드래프트 실시간 반영 (Realtime은 RLS를 따르므로 운영진·팀장만 이벤트 수신)
alter publication supabase_realtime add table public.draft_picks, public.seasons;

-- 3) 슈퍼 관리자: 운영진 추가·삭제 권한
alter table public.admins add column role text not null default 'ADMIN' check (role in ('SUPER','ADMIN'));
update public.admins set role = 'SUPER' where email = 'ehddls128@gmail.com';

create or replace function private.is_super()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admins a
    where a.role = 'SUPER' and a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function private.is_super() from public, anon;
grant execute on function private.is_super() to authenticated;

grant insert, update, delete on public.admins to authenticated;
create policy "admins_insert_by_super" on public.admins
  for insert to authenticated with check ((select private.is_super()));
create policy "admins_update_by_super" on public.admins
  for update to authenticated using ((select private.is_super())) with check ((select private.is_super()));
-- 슈퍼 관리자 본인 행은 지울 수 없음 (실수로 관리자가 0명이 되는 것 방지)
create policy "admins_delete_by_super" on public.admins
  for delete to authenticated using ((select private.is_super()) and role <> 'SUPER');

-- 4) 지정 이메일 자동 연결: 초대 링크 없이 해당 이메일로 첫 로그인 시 팀장·부팀장 등록
alter table public.team_invites add column preassigned_email text check (preassigned_email = lower(preassigned_email));

create or replace function private.claim_preassigned_invites()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.team_leaders (user_id, season_team_id, role, member_id, email)
  select new.id, i.season_team_id, i.role, i.member_id, lower(new.email)
  from public.team_invites i
  where i.preassigned_email = lower(new.email) and i.claimed_by is null
  on conflict (user_id, season_team_id) do nothing;

  update public.team_invites
     set claimed_by = new.id, claimed_email = lower(new.email), claimed_at = now()
   where preassigned_email = lower(new.email) and claimed_by is null;
  return new;
end;
$$;
revoke all on function private.claim_preassigned_invites() from public, anon, authenticated;

create trigger on_auth_user_created_claim_invites
after insert on auth.users
for each row execute function private.claim_preassigned_invites();

-- 김동인: 슈퍼 관리자 겸 김동인팀 팀장
update public.team_invites i
   set preassigned_email = 'ehddls128@gmail.com'
  from public.season_teams t
 where t.id = i.season_team_id and t.name = '김동인팀' and i.role = 'CAPTAIN';
