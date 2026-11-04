import type { Player } from '../player'

export type SeasonStatus = 'DRAFTING' | 'ACTIVE' | 'CLOSED'

export interface Season {
  id: string
  name: string
  startsOn: string // YYYY-MM-DD
  endsOn: string
  /** 0=일 … 1=월 */
  matchWeekday: number
  status: SeasonStatus
  /** 지명 순서(팀 id 3개). 없으면 season_teams.draftOrder 사용 */
  draftTeamOrder: string[] | null
}

export interface SeasonTeam {
  id: string
  slot: number // 0=빨강 1=파랑 2=노랑
  name: string
  captainId: string
  viceId: string
  draftOrder: number
}

export interface DraftPick {
  pickNo: number
  teamId: string
  memberId: string
}

export interface SeasonBundle {
  season: Season
  teams: SeasonTeam[]
  picks: DraftPick[]
}

export interface Roster {
  team: SeasonTeam
  captain?: Player
  vice?: Player
  /** 지명 순서대로 */
  picks: { pickNo: number; player: Player }[]
}

export const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토']
