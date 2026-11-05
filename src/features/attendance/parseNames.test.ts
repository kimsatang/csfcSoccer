import { describe, expect, it } from 'vitest'
import { parseNames } from './parseNames'

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
