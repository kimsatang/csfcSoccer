import { describe, expect, it } from 'vitest'
import { SAMPLE_MEMBERS } from '../player'
import type { SeasonBundle } from './model'
import { availablePlayers, matchDates, nextMatchDate, rosters, teamForPick, teamIndexForPick } from './draft'

const bundle = (order: string[] | null = null, picks: SeasonBundle['picks'] = []): SeasonBundle => ({
  season: { id: 's', name: '2026년 11월 시즌', startsOn: '2026-11-09', endsOn: '2026-11-30', matchWeekday: 1, status: 'DRAFTING', draftTeamOrder: order },
  teams: [
    { id: 'A', slot: 0, name: '김동인팀', captainId: 'sample_1', viceId: 'sample_2', draftOrder: 0 },
    { id: 'B', slot: 1, name: '남상혁팀', captainId: 'sample_3', viceId: 'sample_4', draftOrder: 1 },
    { id: 'C', slot: 2, name: '이동익팀', captainId: 'sample_5', viceId: 'sample_6', draftOrder: 2 },
  ],
  picks,
})

describe('스네이크 드래프트', () => {
  it('1→2→3→3→2→1→1→2→3 순서', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => teamIndexForPick(n))).toEqual([0, 1, 2, 2, 1, 0, 0, 1, 2])
  })

  it('기본 순서는 김동인→남상혁→이동익', () => {
    expect([1, 2, 3, 4].map((n) => teamForPick(bundle(), n).name)).toEqual(['김동인팀', '남상혁팀', '이동익팀', '이동익팀'])
  })

  it('지명 순서를 바꾸면 그 순서로 스네이크', () => {
    const b = bundle(['B', 'C', 'A'])
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => teamForPick(b, n).name)).toEqual(['남상혁팀', '이동익팀', '김동인팀', '김동인팀', '이동익팀', '남상혁팀', '남상혁팀'])
  })

  it('지명 가능 회원에서 팀장·부팀장과 지명된 회원 제외', () => {
    const b = bundle(null, [{ pickNo: 1, teamId: 'A', memberId: 'sample_7' }])
    const ids = availablePlayers(SAMPLE_MEMBERS, b).map((p) => p.id)
    expect(ids).toHaveLength(24 - 6 - 1)
    expect(ids).not.toContain('sample_1')
    expect(ids).not.toContain('sample_7')
  })

  it('로스터는 팀별로 지명 순서대로', () => {
    const b = bundle(null, [
      { pickNo: 1, teamId: 'A', memberId: 'sample_7' },
      { pickNo: 6, teamId: 'A', memberId: 'sample_8' },
    ])
    const r = rosters(SAMPLE_MEMBERS, b)
    expect(r[0].captain?.id).toBe('sample_1')
    expect(r[0].picks.map((p) => p.player.id)).toEqual(['sample_7', 'sample_8'])
  })
})

describe('경기일', () => {
  it('2026년 11월 시즌: 11/9, 16, 23, 30 월요일', () => {
    expect(matchDates(bundle().season)).toEqual(['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
  })
  it('다음 경기일', () => {
    expect(nextMatchDate(bundle().season, new Date('2026-11-04T12:00:00'))).toBe('2026-11-09')
    expect(nextMatchDate(bundle().season, new Date('2026-11-16T12:00:00'))).toBe('2026-11-16')
    expect(nextMatchDate(bundle().season, new Date('2026-11-17T12:00:00'))).toBe('2026-11-23')
  })
})
