import { describe, expect, it } from 'vitest'
import { DEFAULT_GRADES, gradeOf, normalizeGrades, ratingAccess, ratingAverage } from './index'

describe('선수 지표', () => {
  it('평균은 입력된 지표만, 없으면 null', () => {
    expect(ratingAverage({ attack: 8, technique: 7, pass: 9, defense: 6, physical: 8, speed: 7 })).toBe(7.5)
    expect(ratingAverage({ attack: 6, speed: null })).toBe(6)
    expect(ratingAverage({})).toBeNull()
  })
  it('등급 구간', () => {
    expect(gradeOf(8.5)).toBe('S'); expect(gradeOf(8.4)).toBe('A'); expect(gradeOf(3.9)).toBe('D'); expect(gradeOf(null)).toBeNull()
  })
  it('등급 단계는 높은 순 정렬, 맨 아래는 0', () => {
    const s = normalizeGrades([{ grade: 'B', min: 5 }, { grade: 'A', min: 8 }, { grade: 'C', min: 2 }])
    expect(s.map((x) => x.grade)).toEqual(['A', 'B', 'C'])
    expect(s.at(-1)!.min).toBe(0)
    expect(normalizeGrades(null)).toEqual(DEFAULT_GRADES)
  })
  it('공개 범위', () => {
    const sup = { isAdmin: true, isSuper: true, isLeader: false }, adm = { isAdmin: true, isSuper: false, isLeader: false }, ldr = { isAdmin: false, isSuper: false, isLeader: true }
    expect(ratingAccess(adm, 'super')).toEqual({ see: false, edit: false, gradeOnly: false })
    expect(ratingAccess(sup, 'super')).toMatchObject({ see: true, edit: true })
    expect(ratingAccess(adm, 'admin')).toMatchObject({ see: true, edit: true })
    expect(ratingAccess(ldr, 'admin')).toEqual({ see: false, edit: false, gradeOnly: false })
    expect(ratingAccess(ldr, 'leader_grade')).toEqual({ see: false, edit: false, gradeOnly: true })
    expect(ratingAccess(ldr, 'leader_all')).toEqual({ see: true, edit: false, gradeOnly: false })
  })
})
