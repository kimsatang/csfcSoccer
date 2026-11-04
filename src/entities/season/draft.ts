import type { Player } from '../player'
import type { DraftPick, Roster, Season, SeasonBundle, SeasonTeam } from './model'
import { WEEKDAY_LABEL } from './model'

/** 1라운드 지명 순서대로 정렬한 팀 */
export function orderedTeams(season: Season, teams: SeasonTeam[]): SeasonTeam[] {
  const order = season.draftTeamOrder
  if (order && order.length === teams.length && order.every((id) => teams.some((t) => t.id === id))) {
    return order.map((id) => teams.find((t) => t.id === id)!)
  }
  return [...teams].sort((a, b) => a.draftOrder - b.draftOrder)
}

/** 스네이크: 1→2→3, 3→2→1, 1→2→3 … (DB의 draft_team_for_pick과 동일 규칙) */
export function teamIndexForPick(pickNo: number, teamCount = 3): number {
  const round = Math.floor((pickNo - 1) / teamCount)
  const pos = (pickNo - 1) % teamCount
  return round % 2 === 0 ? pos : teamCount - 1 - pos
}

export function teamForPick(bundle: SeasonBundle, pickNo: number): SeasonTeam {
  const ordered = orderedTeams(bundle.season, bundle.teams)
  return ordered[teamIndexForPick(pickNo, ordered.length)]
}

export function nextPickNo(picks: DraftPick[]): number {
  return picks.reduce((max, p) => Math.max(max, p.pickNo), 0) + 1
}

export function leaderIds(teams: SeasonTeam[]): Set<string> {
  return new Set(teams.flatMap((t) => [t.captainId, t.viceId]))
}

/** 지명 가능한 회원 = 활동 회원 − 팀장·부팀장 − 이미 지명 */
export function availablePlayers(members: Player[], bundle: SeasonBundle): Player[] {
  const leaders = leaderIds(bundle.teams)
  const picked = new Set(bundle.picks.map((p) => p.memberId))
  return members.filter((m) => m.status === 'ACTIVE' && !leaders.has(m.id) && !picked.has(m.id))
}

export function rosters(members: Player[], bundle: SeasonBundle): Roster[] {
  const byId = new Map(members.map((m) => [m.id, m]))
  return [...bundle.teams]
    .sort((a, b) => a.slot - b.slot)
    .map((team) => ({
      team,
      captain: byId.get(team.captainId),
      vice: byId.get(team.viceId),
      picks: bundle.picks
        .filter((p) => p.teamId === team.id)
        .sort((a, b) => a.pickNo - b.pickNo)
        .flatMap((p) => (byId.has(p.memberId) ? [{ pickNo: p.pickNo, player: byId.get(p.memberId)! }] : [])),
    }))
}

/** 시즌 기간 중 경기일 목록 (예: 11월 매주 월요일) */
export function matchDates(season: Season): string[] {
  const out: string[] = []
  const d = new Date(`${season.startsOn}T00:00:00`)
  const end = new Date(`${season.endsOn}T00:00:00`)
  while (d.getDay() !== season.matchWeekday) d.setDate(d.getDate() + 1)
  for (; d <= end; d.setDate(d.getDate() + 7)) out.push(toIsoDate(d))
  return out
}

/** 오늘 이후 가장 가까운 경기일 (없으면 마지막 경기일) */
export function nextMatchDate(season: Season, today = new Date()): string | undefined {
  const dates = matchDates(season)
  const t = toIsoDate(today)
  return dates.find((d) => d >= t) ?? dates[dates.length - 1]
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_LABEL[d.getDay()]})`
}
