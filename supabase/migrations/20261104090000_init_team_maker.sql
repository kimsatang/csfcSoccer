-- CSFC 팀짜기 초기 스키마
-- 접근 정책: 운영진(admins 허용 목록에 있는 이메일)으로 로그인한 사용자만 모든 데이터 읽기/쓰기

-- 1) 운영진 허용 목록 ------------------------------------------------------
create table public.admins (
  email      text primary key check (email = lower(email)),
  name       text,
  created_at timestamptz not null default now()
);
comment on table public.admins is '앱 사용이 허용된 운영진 이메일 (Supabase 대시보드에서 관리)';

-- API로 노출되지 않는 private 스키마에 권한 판별 함수 배치
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- 2) 회원 -------------------------------------------------------------------
create table public.members (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  back_number   int,
  main_position text not null check (main_position in ('GK','DF','MF','FW')),
  sub_position  text check (sub_position in ('GK','DF','MF','FW')),
  skill         smallint not null check (skill between 1 and 10),
  status        text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  memo          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger members_touch_updated_at
before update on public.members
for each row execute function private.touch_updated_at();

-- 3) 경기 / 경기별 참가자 ---------------------------------------------------
create table public.matches (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  played_on  date not null default current_date,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.match_players (
  match_id   uuid not null references public.matches(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  role       text not null default 'MEMBER' check (role in ('MEMBER','CAPTAIN','VICE')),
  team_index smallint check (team_index between 0 and 2),
  primary key (match_id, member_id)
);
create index match_players_member_id_idx on public.match_players(member_id);
create index matches_created_by_idx on public.matches(created_by);

-- 4) 권한: anon 차단, authenticated + 운영진만 -----------------------------
revoke all on public.admins, public.members, public.matches, public.match_players from anon;
grant select on public.admins to authenticated;
grant select, insert, update, delete on public.members, public.matches, public.match_players to authenticated;

alter table public.admins        enable row level security;
alter table public.members       enable row level security;
alter table public.matches       enable row level security;
alter table public.match_players enable row level security;

-- admins: 운영진은 목록 조회만 (추가/삭제는 대시보드에서)
create policy "admins_select_by_admin" on public.admins
  for select to authenticated using ((select private.is_admin()));

create policy "members_all_by_admin" on public.members
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "matches_all_by_admin" on public.matches
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "match_players_all_by_admin" on public.match_players
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- 5) 편성 결과 저장 RPC (경기 + 참가자를 한 트랜잭션으로) -------------------
create or replace function public.save_match(p_title text, p_played_on date, p_players jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_match_id uuid;
begin
  insert into public.matches (title, played_on)
  values (p_title, coalesce(p_played_on, current_date))
  returning id into v_match_id;

  insert into public.match_players (match_id, member_id, role, team_index)
  select v_match_id, x.member_id, coalesce(x.role, 'MEMBER'), x.team_index
  from jsonb_to_recordset(p_players) as x(member_id uuid, role text, team_index smallint);

  return v_match_id;
end;
$$;
revoke all on function public.save_match(text, date, jsonb) from public, anon;
grant execute on function public.save_match(text, date, jsonb) to authenticated;

-- 6) 최초 운영진 ------------------------------------------------------------
insert into public.admins (email, name) values ('ehddls128@gmail.com', '김동인')
on conflict (email) do nothing;
