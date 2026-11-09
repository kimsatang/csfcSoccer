import { describe, expect, it } from 'vitest'
import type { SlotMap } from './formations'
import { byFewestGames, playCounts } from './playCount'

describe('출전 경기 수', () => {
  const games: { gameNo: number; slots: SlotMap }[] = [
    { gameNo: 1, slots: { GK: 'a', LB: 'b', ST: 'c' } },
    { gameNo: 2, slots: { GK: 'a', LB: 'd' } },
    { gameNo: 3, slots: {} }, // 아직 비어 있는 경기
  ]
  it('선수별 출전 경기와 분모(라인업이 있는 경기 수)', () => {
    const c = playCounts(games, ['a', 'b', 'c', 'd', 'e'])
    expect(c.get('a')).toEqual({ games: [1, 2], total: 2 })
    expect(c.get('b')).toEqual({ games: [1], total: 2 })
    expect(c.get('e')).toEqual({ games: [], total: 2 })
  })
  it('참석자가 아닌 선수 id는 무시', () => {
    const c = playCounts(games, ['a'])
    expect([...c.keys()]).toEqual(['a'])
  })
  it('출전 적은 순 정렬', () => {
    const c = playCounts(games, ['a', 'b', 'e'])
    const sorted = byFewestGames([{ id: 'a', name: '가' }, { id: 'b', name: '나' }, { id: 'e', name: '다' }], c)
    expect(sorted.map((p) => p.id)).toEqual(['e', 'b', 'a'])
  })
})
