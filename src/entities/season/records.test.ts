import { describe, expect, it } from 'vitest'
import type { DayGame, DayGoal } from './records'
import { gameScore, goalText, scorerTable, standings } from './records'

const g = (id: string, h: string, a: string, playedOn = '2026-11-09'): DayGame => ({ id, playedOn, gameNo: 1, homeTeamId: h, awayTeamId: a })
let n = 0
const goal = (gameId: string, teamId: string, scorerId: string | null, extra: Partial<DayGoal> = {}): DayGoal =>
  ({ id: `x${n++}`, gameId, teamId, kind: 'GOAL', scorerId, scorerName: null, assistId: null, createdAt: `c${n}`, ...extra })
const names = new Map([['a', '강감찬'], ['b', '김구'], ['c', '이순신']])

describe('경기 기록', () => {
  const games = [g('g1', 'R', 'B'), g('g2', 'B', 'Y'), g('g3', 'R', 'Y')]
  const goals = [
    goal('g1', 'R', 'a', { assistId: 'b' }), goal('g1', 'R', 'a'), goal('g1', 'B', 'c', { kind: 'OWN_GOAL' }),
    goal('g2', 'Y', null, { scorerName: '용병 철수' }),
  ]
  it('점수: 자책골은 기록된 팀(득점 팀)에 더해짐', () => {
    expect(gameScore(goals, games[0])).toEqual([2, 1])
    expect(gameScore(goals, games[1])).toEqual([0, 1])
    expect(gameScore(goals, games[2])).toEqual([0, 0])
  })
  it('골 표기', () => {
    expect(goalText(goals[0], names)).toBe('강감찬 (도움 김구)')
    expect(goalText(goals[2], names)).toBe('자책골 이순신')
    expect(goalText(goals[3], names)).toContain('용병 철수')
  })
  it('득점 순위: 자책골·용병·모름은 빼고, 도움은 따로', () => {
    const t = scorerTable(goals, names)
    expect(t[0]).toMatchObject({ id: 'a', goals: 2, assists: 0 })
    expect(t.find((r) => r.id === 'b')).toMatchObject({ goals: 0, assists: 1 })
    expect(t.find((r) => r.id === 'c')).toBeUndefined()
  })
  it('순위: 승 3 무 1, 승점·득실 순', () => {
    const t = standings(['R', 'B', 'Y'], games, goals)
    expect(t.map((r) => r.teamId)).toEqual(['R', 'Y', 'B'])
    expect(t[0]).toMatchObject({ played: 2, win: 1, draw: 1, loss: 0, gf: 2, ga: 1, points: 4 })
    expect(t[2]).toMatchObject({ played: 2, win: 0, loss: 2, points: 0 })
  })
})
