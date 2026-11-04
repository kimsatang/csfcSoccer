-- (적용 대기) 미입력 표시를 둘로 분리 + 드래프트 실시간 반영
-- needs_review = 실력 미입력, position_review = 포지션 미입력
alter table public.members add column position_review boolean not null default false;
update public.members set position_review = needs_review;
comment on column public.members.needs_review is '실력이 임시값(5)이라 입력 필요';
comment on column public.members.position_review is '포지션이 임시값(미드)이라 입력 필요';

-- 드래프트 실시간 반영 (Realtime은 RLS를 따르므로 운영진·팀장만 이벤트 수신)
alter publication supabase_realtime add table public.draft_picks, public.seasons;
