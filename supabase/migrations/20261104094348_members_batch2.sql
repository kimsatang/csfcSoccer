-- 누락된 회원 16명 추가 (88~99년생). 포지션·실력은 임시값 → needs_review
insert into public.members (name, birth_year, main_position, skill, needs_review)
select v.name, v.y, 'MF', 5, true
from (values
  ('최올림', 1988), ('마준호', 1990), ('이상영', 1990), ('이창식', 1990),
  ('정성훈', 1991), ('김신석', 1992), ('이호찬', 1992), ('최락철', 1992),
  ('김치연', 1995), ('곽영균', 1996), ('김동현', 1996), ('김용현', 1997),
  ('이지윤', 1997), ('강병석', 1999), ('곽영환', 1999), ('류완상', 1999)
) as v(name, y)
where not exists (select 1 from public.members m where m.name = v.name);
