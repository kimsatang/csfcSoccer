import { describe, expect, it } from 'vitest'
import { FORMATIONS, assignSlot, remapSlots } from './formations'

describe('포메이션', () => {
  it('모든 포메이션은 11자리, 키 중복 없음, GK 포함', () => {
    for (const [name, slots] of Object.entries(FORMATIONS)) {
      expect(slots, name).toHaveLength(11)
      expect(new Set(slots.map((s) => s.key)).size, name).toBe(11)
      expect(slots.some((s) => s.key === 'GK'), name).toBe(true)
    }
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
