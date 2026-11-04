-- 11월 시즌 = 91년생 팀장 이벤트 팀 대전
update public.members set birth_year = 1991 where name in ('남상혁', '이동익') and birth_year is null;
update public.seasons set name = '91년생 이벤트 팀 대전 (11월)' where name = '2026년 11월 시즌';
