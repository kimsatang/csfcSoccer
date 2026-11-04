-- 회원 참석률 등급 (운영진 판단): HIGH 높음 / MID 중간 / LOW 낮음, null = 미입력
alter table public.members add column attendance_level text check (attendance_level in ('HIGH','MID','LOW'));
comment on column public.members.attendance_level is '참석률 등급(운영진 판단): HIGH/MID/LOW, null=미입력';
