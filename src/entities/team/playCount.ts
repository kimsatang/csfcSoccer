import type { SlotMap } from './formations'

export interface PlayCount {
  /** 선발로 나선 경기 번호 */
  games: number[]
  /** 그날 라인업이 짜인 경기 수 (분모) */
  total: number
}

/**
 * 그날 선수별 출전 경기 수.
 * 분모는 한 명이라도 배정된 경기만 센다 (아직 비어 있는 경기는 제외).
 */
export function playCounts(games: { gameNo: number; slots: SlotMap }[], playerIds: string[]): Map<string, PlayCount> {
  const played = games.filter((g) => Object.keys(g.slots).length > 0)
  const total = played.length
  const out = new Map<string, PlayCount>()
  for (const id of playerIds) out.set(id, { games: [], total })
  for (const g of played) {
    for (const id of new Set(Object.values(g.slots))) {
      const c = out.get(id)
      if (c) c.games.push(g.gameNo)
    }
  }
  for (const c of out.values()) c.games.sort((a, b) => a - b)
  return out
}

/** 출전 적은 순 → 이름순 */
export function byFewestGames<T extends { id: string; name: string }>(list: T[], counts: Map<string, PlayCount>): T[] {
  return [...list].sort((a, b) => (counts.get(a.id)?.games.length ?? 0) - (counts.get(b.id)?.games.length ?? 0) || a.name.localeCompare(b.name, 'ko'))
}
