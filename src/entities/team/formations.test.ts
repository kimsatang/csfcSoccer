import { describe, expect, it } from 'vitest'
import { FORMATIONS, FORMATION_NAMES_11, FORMATION_NAMES_12, SLOT_POSITION, assignSlot, remapSlots } from './formations'

describe('포메이션', () => {
  it('11인은 11자리, 12인(+1)은 12자리 — 키 중복 없음, GK 포함', () => {
    for (const [name, slots] of Object.entries(FORMATIONS)) {
      const n = name.endsWith('+1') ? 12 : 11
      expect(slots, name).toHaveLength(n)
      expect(new Set(slots.map((s) => s.key)).size, name).toBe(n)
      expect(slots.some((s) => s.key === 'GK'), name).toBe(true)
    }
    expect(FORMATION_NAMES_12).toHaveLength(FORMATION_NAMES_11.length)
  })

  it('12인 자리는 모두 아는 포지션 라벨', () => {
    for (const name of FORMATION_NAMES_12) {
      for (const s of FORMATIONS[name]) expect(SLOT_POSITION[s.label], `${name} ${s.label}`).toBeDefined()
    }
  })

  it('11인 ↔ 12인 전환: 11명 유지, 12인에서 11인으로 가면 남는 1명은 벤치로', () => {
    const full = Object.fromEntries(FORMATIONS['4-4-2'].map((s, i) => [s.key, `m${i}`]))
    const to12 = remapSlots(full, '4-4-2', '4-4-2+1')
    expect(Object.keys(to12)).toHaveLength(11)
    const twelve = { ...to12, AM12: 'm11' }
    const back = remapSlots(twelve, '4-4-2+1', '4-4-2')
    expect(Object.keys(back)).toHaveLength(11)
  })

  it('자리 배정: 다른 자리 선수를 고르면 맞바꿈', () => {
    const s = { GK: 'a', LB: 'b' }
    expect(assignSlot(s, 'GK', 'b')).toEqual({ GK: 'b', LB: 'a' })
    expect(assignSlot(s, 'RB', 'b')).toEqual({ GK: 'a', RB: 'b' })
    expect(assignSlot(s, 'GK', null)).toEqual({ LB: 'b' })
  })

  it('포메이션 변경 시 배정 인원 유지', () => {
    const full = Object.fromEntries(FORMATIONS['4-4-2'].map((s, i) => [s.key, `m${i}`]))
    const next = remapSlots(full, '4-4-2', '3-5-2')
    expect(Object.keys(next)).toHaveLength(11)
    expect(new Set(Object.values(next)).size).toBe(11)
    expect(next.GK).toBe('m0')
  })
})
