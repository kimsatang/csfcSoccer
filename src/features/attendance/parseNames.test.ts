import { describe, expect, it } from 'vitest'
import { mergeResults, parseNames } from './parseNames'

const members = ['김동인', '조인규', '남상혁', '이강재', '김진', '김진수', '안현', '이대근', '임규특'].map((name, i) => ({ id: `m${i}`, name }))
const nameOf = (ids: string[]) => ids.map((id) => members.find((m) => m.id === id)!.name)

describe('parseNames', () => {
  it('줄바꿈·쉼표·슬래시·가운뎃점 구분', () => {
    const r = parseNames('김동인, 조인규 / 남상혁 · 이강재\n임규특', members)
    expect(nameOf(r.ids)).toEqual(['김동인', '조인규', '남상혁', '이강재', '임규특'])
  })

  it('번호·기호·괄호·호칭·년생 붙은 이름', () => {
    const r = parseNames('1. 김동인님\n2) 조인규(91)\n- @남상혁 참석\n✅이강재91\n[용병] 안현', members)
    expect(nameOf(r.ids)).toEqual(['김동인', '조인규', '남상혁', '이강재', '안현'])
  })

  it('띄어 쓴 이름과 긴 이름 우선', () => {
    const r = parseNames('김 진\n김진수\n이 대 근', members)
    expect(nameOf(r.ids)).toEqual(['김진', '김진수', '이대근'])
  })

  it('중복 제거', () => {
    expect(parseNames('김동인\n김동인님\n김동인', members).ids).toHaveLength(1)
  })

  it('불참 줄은 제외하고 따로 알려 준다', () => {
    const r = parseNames('참석: 김동인, 조인규\n불참: 남상혁, 이강재\n안현', members)
    expect(nameOf(r.ids)).toEqual(['김동인', '조인규', '안현'])
    expect(nameOf(r.absentIds)).toEqual(['남상혁', '이강재'])
  })

  it('회원 목록에 없는 이름은 확인 목록으로', () => {
    const r = parseNames('11/9 경기 참석 명단\n김동인\n홍길동\n총 2명', members)
    expect(nameOf(r.ids)).toEqual(['김동인'])
    expect(r.unknown).toEqual(['홍길동'])
  })

  it('카톡 투표 결과 형식', () => {
    const text = `[투표] 11/9(월) 경기 참석
참석 (3)
김동인
조인규
남상혁
불참 (1)
이강재`
    const r = parseNames(text, members)
    expect(nameOf(r.ids)).toEqual(['김동인', '조인규', '남상혁'])
    expect(nameOf(r.absentIds)).toEqual(['이강재'])
    expect(r.unknown).toEqual([])
  })
})

// ── 카톡 투표 스크린샷 글자 인식(OCR) 결과 (실제 예시 이미지 2장, 인식 방식 2가지)
const csfc = [
  ['이성흠', 1977], ['한상현', 1980], ['진수익', 1982], ['이민용', 1985], ['주성일', 1985], ['이강재', 1986], ['조인규', 1986],
  ['김지훈', 1987], ['송호민', 1987], ['최진용', 1989], ['이동익', 1991], ['곽영균', 1996], ['김용현', 1997], ['이지윤', 1997],
  ['곽영환', 1999], ['김진', 1974], ['윤명훈', 1974], ['정태호', 1974], ['김율수', 1979], ['박주호', 1980], ['이세훈', 1982],
  ['김강선', 1983], ['이대현', 1984], ['이자웅', 1986], ['백승한', 1987], ['최익창', 1987], ['이상영', 1990], ['김동인', 1991],
  ['남상혁', 1991], ['최한송', 1986],
].map(([name, birthYear], i) => ({ id: `c${i}`, name: name as string, birthYear: birthYear as number }))
const names = (ids: string[]) => ids.map((id) => csfc.find((m) => m.id === id)!.name).sort()

const OCR_RAW_1 = `[정기전] ㅣ]월 ㅣ주차 경기 선택!
1일 일요일 18시 ~ 20시 축구 : 15명
0@ 77 이성흠 하남_…….      @@ 80 한상현 하남...
@@ 82 진수익 하남 ... 85 이민용 강동 _.
@읍 =주닝일하9  86 이강재 한남 _..
지훈
60。 86 조인규하남        =   87 김지훈 한남 _….
@  87 송호민 하남_...       (전 89 최진용 하남_.….
8  91 이동익 수원          습  96 곽영균 하남-.…
용현 97 김용현 하남_...  97 이지윤 하남...
소닉      관여   소
송   99 닉 경환 하남_...`
const OCR_PREP_1 = `[정기전] ㅣ]월 ]ㅣ주차 경기 선택!
]일 일요일 1841! ~ 20시 축구 : 15명
성홈]  77 이성음 하남...           5 00 한상현 하남_.…
63 82 진수익 하남 _….. 85 이민용 강동_…….
69  85 주성일 하남_...  86 이강재 하남...
  86 조인규 하남 _….   87 김지훈 하남_...
6) 07 550하9. 월립 09 취진용하남.
  91 이동익 수원        .영균 96 곽영균 하남-...
용현 97 김용현하남_...               97 이지윤 하남...
3   99 곽영환 하남_...`
const OCR_RAW_2 = `2일 월요일 19시 ~ 22시 풋살 : 13명
림접> 74 김 진 하남_감일       명훈 74 운명훈 하남_...
  | 정태호하남. ^ 율수 79 김율수 하남 ….
치지] 80 박주호 하남_.….         2 82 이세훈하남_...
강선 83 김강선 하남_.….       @  84 이대현 하남_...
자웅 “86 이자웅하남_...       | 5 ]  87 백승한 하남_.….
6@  87 최익창 하남_.….  90 이상영 송파...
긍  @》 91 김동인 하.…`

describe('카톡 투표 스크린샷 인식 결과', () => {
  it('제목의 "15명"을 투표 인원으로, 닉네임 앞 년생으로 오타 보정', () => {
    const r = parseNames(OCR_RAW_1, csfc)
    expect(r.sections).toHaveLength(1)
    expect(r.sections[0].declared).toBe(15)
    expect(r.sections[0].title).toContain('축구')
    // 프로필 사진 글자(지훈·용현·소닉)·지역명(하남·수원)은 못 찾은 이름에 넣지 않음
    expect(r.unknown).not.toContain('지훈')
    expect(r.unknown).not.toContain('하남')
  })

  it('두 가지 인식 결과를 합치면 15명 전원', () => {
    const merged = mergeResults([parseNames(OCR_RAW_1, csfc), parseNames(OCR_PREP_1, csfc)])
    const s = merged.sections[0]
    expect(s.declared).toBe(15)
    expect(names(s.ids)).toEqual(names(csfc.filter((m) => [
      '이성흠', '한상현', '진수익', '이민용', '주성일', '이강재', '조인규', '김지훈', '송호민', '최진용', '이동익', '곽영균', '김용현', '이지윤', '곽영환',
    ].includes(m.name)).map((m) => m.id)))
  })

  it('두 번째 항목(풋살 13명): 띄어 쓴 이름, 지역이 붙은 이름, 년생으로 오타 보정(운명훈 → 윤명훈)', () => {
    const r = parseNames(OCR_RAW_2, csfc)
    const s = r.sections[0]
    expect(s.declared).toBe(13)
    expect(s.ids).toHaveLength(13)
    expect(s.corrected.map((c) => [c.token, csfc.find((m) => m.id === c.memberId)!.name])).toContainEqual(['운명훈', '윤명훈'])
  })

  it('여러 장을 이어 붙이면 항목별로 나뉨', () => {
    const r = parseNames(`${OCR_RAW_1}\n${OCR_RAW_2}`, csfc)
    expect(r.sections.map((s) => s.declared)).toEqual([15, 13])
  })
})

describe('동명이인', () => {
  const dup = [
    { id: 'a', name: '김민수', birthYear: 1988 },
    { id: 'b', name: '김민수', birthYear: 1992 },
    { id: 'c', name: '박지성', birthYear: 1981 },
  ]
  it('년생이 없으면 고르기 필요', () => {
    const r = parseNames('김민수\n박지성', dup)
    expect(r.ids).toEqual(['c'])
    expect(r.sections[0].ambiguous).toEqual([{ token: '김민수', candidates: ['a', 'b'] }])
  })
  it('닉네임 앞 년생으로 구분', () => {
    expect(parseNames('92 김민수 하남', dup).ids).toEqual(['b'])
  })
  it('한 글자 오타는 년생이 없으면 제안만', () => {
    const r = parseNames('박지승', dup)
    expect(r.ids).toEqual([])
    expect(r.sections[0].suggestions).toEqual([{ token: '박지승', memberId: 'c' }])
  })
  it('"총 2명" 합계 줄은 위 항목 인원으로', () => {
    const r = parseNames('참석 명단\n박지성\n김민수\n총 2명', dup)
    expect(r.sections).toHaveLength(1)
    expect(r.sections[0].declared).toBe(2)
  })
})
