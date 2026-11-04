-- 회원 년생 + 정보 미입력 표시, 단톡방 명단 50명 등록 (2026-11-04)
alter table public.members add column birth_year smallint check (birth_year between 1940 and 2020);
alter table public.members add column needs_review boolean not null default false;
comment on column public.members.needs_review is '포지션·실력이 임시값(미드, 5)이라 확인이 필요한 회원';

-- 이미 등록된 팀장·부팀장: 년생 채우고 미입력 표시
update public.members m
   set birth_year = v.y, needs_review = true
  from (values ('김동인', 1991), ('조인규', 1986), ('이강재', 1986), ('최한송', 1986)) as v(name, y)
 where m.name = v.name;
update public.members set needs_review = true where memo = '포지션·실력 미입력(임시값)';
update public.members set memo = null where memo = '포지션·실력 미입력(임시값)';

-- 신규 회원 (이름, 년생, 등번호, 메모). 포지션·실력은 임시값 → needs_review
insert into public.members (name, birth_year, back_number, memo, main_position, skill, needs_review)
select v.name, v.y, v.no, v.memo, 'MF', 5, true
from (values
  ('박주호', 1980, null::int, '회장'),
  ('김진',   1974, null, null),
  ('한상현', 1980, 2,    '총무'),
  ('이용안', 1986, null, '감독'),
  ('정현준', 1987, null, null),
  ('오세한', 1989, null, null),
  ('최진용', 1989, null, null),
  ('서진석', 2005, null, null),
  ('박종원', 2001, null, null),
  ('심관우', 2009, null, null),
  ('윤명훈', 1974, null, null),
  ('정태호', 1974, null, null),
  ('이병학', 1974, null, null),
  ('이성흠', 1977, null, null),
  ('정광진', 1978, null, null),
  ('최문환', 1978, null, null),
  ('김율수', 1979, null, null),
  ('심재우', 1979, null, null),
  ('김택선', 1980, null, null),
  ('윤희철', 1980, null, null),
  ('안현',   1981, null, null),
  ('임규득', 1981, null, null),
  ('고경균', 1982, null, null),
  ('박상훈', 1982, null, null),
  ('이세훈', 1982, 82,   null),
  ('진수익', 1982, null, null),
  ('김강선', 1983, 23,   null),
  ('이대현', 1984, null, null),
  ('김정민', 1985, null, null),
  ('이민용', 1985, null, null),
  ('주성일', 1985, null, null),
  ('차민재', 1985, null, null),
  ('김봉태', 1986, null, null),
  ('이자웅', 1986, null, null),
  ('김용훈', 1987, null, null),
  ('김지훈', 1987, null, null),
  ('백승한', 1987, null, null),
  ('송호민', 1987, null, null),
  ('신동훈', 1987, null, null),
  ('장태현', 1987, null, null),
  ('정해원', 1987, null, null),
  ('최익창', 1987, null, null),
  ('손선호', 1988, null, null),
  ('이대근', 1988, null, null),
  ('이효열', 1988, null, null),
  ('장대건', 1988, null, null)
) as v(name, y, no, memo)
where not exists (select 1 from public.members m where m.name = v.name);
