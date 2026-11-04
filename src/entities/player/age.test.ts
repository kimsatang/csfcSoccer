import { describe, expect, it } from 'vitest'
import { ageGroupOf, parseBirthYear, skillText } from './age'

describe('년생', () => {
  it('두 자리 년도 변환', () => {
    expect(parseBirthYear('87')).toBe(1987)
    expect(parseBirthYear('05')).toBe(2005)
    expect(parseBirthYear('74년생')).toBe(1974)
    expect(parseBirthYear('1991')).toBe(1991)
    expect(parseBirthYear('')).toBeUndefined()
  })
  it('나이대 그룹', () => {
    expect(ageGroupOf({ birthYear: 1974 }).key).toBe('70s')
    expect(ageGroupOf({ birthYear: 1984 }).key).toBe('80-84')
    expect(ageGroupOf({ birthYear: 1987 }).key).toBe('85-87')
    expect(ageGroupOf({ birthYear: 1990 }).key).toBe('88-90')
    expect(ageGroupOf({ birthYear: 2009 }).key).toBe('91+')
    expect(ageGroupOf({}).key).toBe('unknown')
  })
  it('미입력 회원 실력은 -', () => {
    expect(skillText({ skill: 5, needsReview: true })).toBe('-')
    expect(skillText({ skill: 7 })).toBe('7')
  })
})
