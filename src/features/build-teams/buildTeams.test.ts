import { describe, expect, it } from 'vitest'
import { SAMPLE_MEMBERS } from '../../entities/player'
import type { Player } from '../../entities/player'
import { mulberry32 } from '../../shared/lib/rng'
import { allPlayers, buildTeams, movePlayer, teamStats, validateLeaders } from './buildTeams'

const attendees = SAMPLE_MEMBERS
const captainIds = ['sample_4', 'sample_5', 'sample_10'] // 9, 8, 9
const viceIds = ['sample_9', 'sample_12', 'sample_16'] // 5, 6, 7

describe('buildTeams', () => {
  it('3팀을 만들고 각 팀에 팀장 1명·부주장 1명을 배치한다', () => {
    const { teams } = buildTeams({ attendees, captainIds, viceIds, rng: mulberry32(1) })
    expect(teams).toHaveLength(3)
    expect(new Set(teams.map((t) => t.captain.id))).toEqual(new Set(captainIds))
    expect(new Set(teams.map((t) => t.vice.id))).toEqual(new Set(viceIds))
  })

  it('모든 참석자가 정확히 한 번씩 배치된다', () => {
    const { teams } = buildTeams({ attendees, captainIds, viceIds, rng: mulberry32(2) })
    const ids = teams.flatMap(allPlayers).map((p) => p.id)
    expect(ids).toHaveLength(attendees.length)
    expect(new Set(ids).size).toBe(attendees.length)
  })

  it('팀 인원 차이는 1명 이하이다 (나누어떨어지지 않는 인원 포함)', () => {
    for (const n of [24, 23, 22, 10, 7]) {
      const subset = attendees.slice(0, n)
      const caps = ['sample_1', 'sample_2', 'sample_3']
      const vics = ['sample_4', 'sample_5', 'sample_6']
      const { teams } = buildTeams({ attendees: subset, captainIds: caps, viceIds: vics, rng: mulberry32(n) })
      const sizes = teams.map((t) => allPlayers(t).length)
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    }
  })

  it('팀 평균 실력 차이가 작다 (샘플 24명 기준 0.5 이하)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { teams } = buildTeams({ attendees, captainIds, viceIds, rng: mulberry32(seed) })
      const avgs = teams.map((t) => teamStats(t).avgSkill)
      expect(Math.max(...avgs) - Math.min(...avgs)).toBeLessThanOrEqual(0.5)
    }
  })

  it('GK 가능자가 3명 이상이면 모든 팀에 GK 가능자가 있다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { teams } = buildTeams({ attendees, captainIds, viceIds, rng: mulberry32(seed) })
      teams.forEach((t) => expect(teamStats(t).gkCapable).toBeGreaterThan(0))
    }
  })

  it('다시 섞으면 다른 조합이 나올 수 있다', () => {
    const sig = (seed: number) =>
      buildTeams({ attendees, captainIds, viceIds, rng: mulberry32(seed) })
        .teams.map((t) => allPlayers(t).map((p) => p.id).sort().join(','))
        .sort()
        .join('|')
    const results = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(sig))
    expect(results.size).toBeGreaterThan(1)
  })

  it('팀장/부주장 인원이 틀리면 에러', () => {
    expect(validateLeaders(attendees, ['sample_1'], viceIds).length).toBeGreaterThan(0)
    expect(validateLeaders(attendees, captainIds, captainIds).length).toBeGreaterThan(0)
    expect(() => buildTeams({ attendees, captainIds: [], viceIds })).toThrow()
  })
})

describe('movePlayer', () => {
  it('팀원을 다른 팀으로 옮긴다', () => {
    const { teams } = buildTeams({ attendees, captainIds, viceIds, rng: mulberry32(3) })
    const target: Player = teams[0].members[0]
    const moved = movePlayer(teams, target.id, 2)
    expect(moved[0].members.some((m) => m.id === target.id)).toBe(false)
    expect(moved[2].members.some((m) => m.id === target.id)).toBe(true)
  })
})
