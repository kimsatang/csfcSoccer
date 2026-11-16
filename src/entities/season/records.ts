import { supabase } from '../../shared/api/supabase'

/** 경기 기록: 경기일의 게임(팀 vs 팀)·골·도움·자책골·MVP. 점수는 골 기록으로 계산 */

export interface DayGame { id: string; playedOn: string; gameNo: number; homeTeamId: string; awayTeamId: string }
export interface DayGoal {
  id: string; gameId: string
  /** 점수가 올라가는 팀 */
  teamId: string
  kind: 'GOAL' | 'OWN_GOAL'
  scorerId: string | null; scorerName: string | null; assistId: string | null
  createdAt: string
}
export type NewGoal = Omit<DayGoal, 'id' | 'createdAt'>

interface GameRow { id: string; played_on: string; game_no: number; home_team_id: string; away_team_id: string }
interface GoalRow { id: string; game_id: string; team_id: string; kind: 'GOAL' | 'OWN_GOAL'; scorer_id: string | null; scorer_name: string | null; assist_id: string | null; created_at: string }

const game = (r: GameRow): DayGame => ({ id: r.id, playedOn: r.played_on, gameNo: r.game_no, homeTeamId: r.home_team_id, awayTeamId: r.away_team_id })
const goal = (r: GoalRow): DayGoal => ({
  id: r.id, gameId: r.game_id, teamId: r.team_id, kind: r.kind, scorerId: r.scorer_id, scorerName: r.scorer_name, assistId: r.assist_id, createdAt: r.created_at,
})

/** 시즌 전체 기록 (경기일별로 나눠 씀). 테이블이 아직 없으면 null */
export async function fetchSeasonRecords(seasonId: string): Promise<{ games: DayGame[]; goals: DayGoal[]; mvps: Map<string, string> } | null> {
  const g = await supabase.from('day_games').select('id,played_on,game_no,home_team_id,away_team_id').eq('season_id', seasonId).order('played_on').order('game_no')
  if (g.error) return null
  const ids = (g.data ?? []).map((r) => r.id)
  const [goals, mvps] = await Promise.all([
    ids.length ? supabase.from('day_goals').select('id,game_id,team_id,kind,scorer_id,scorer_name,assist_id,created_at').in('game_id', ids).order('created_at') : Promise.resolve({ data: [], error: null }),
    supabase.from('day_mvps').select('played_on,member_id').eq('season_id', seasonId),
  ])
  if (goals.error) throw goals.error
  if (mvps.error) throw mvps.error
  return {
    games: (g.data as GameRow[]).map(game),
    goals: ((goals.data ?? []) as GoalRow[]).map(goal),
    mvps: new Map(((mvps.data ?? []) as { played_on: string; member_id: string }[]).map((r) => [r.played_on, r.member_id])),
  }
}

export async function addDayGame(seasonId: string, playedOn: string, gameNo: number, home: string, away: string): Promise<DayGame> {
  const { data, error } = await supabase.from('day_games')
    .insert({ season_id: seasonId, played_on: playedOn, game_no: gameNo, home_team_id: home, away_team_id: away })
    .select('id,played_on,game_no,home_team_id,away_team_id').single()
  if (error) throw error
  return game(data as GameRow)
}

export async function deleteDayGame(id: string): Promise<void> {
  const { error } = await supabase.from('day_games').delete().eq('id', id)
  if (error) throw error
}

export async function addGoal(g: NewGoal): Promise<DayGoal> {
  const { data, error } = await supabase.from('day_goals')
    .insert({ game_id: g.gameId, team_id: g.teamId, kind: g.kind, scorer_id: g.scorerId, scorer_name: g.scorerName, assist_id: g.assistId })
    .select('id,game_id,team_id,kind,scorer_id,scorer_name,assist_id,created_at').single()
  if (error) throw error
  return goal(data as GoalRow)
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from('day_goals').delete().eq('id', id)
  if (error) throw error
}

export async function setDayMvp(seasonId: string, playedOn: string, memberId: string | null): Promise<void> {
  const { error } = memberId
    ? await supabase.from('day_mvps').upsert({ season_id: seasonId, played_on: playedOn, member_id: memberId }, { onConflict: 'season_id,played_on' })
    : await supabase.from('day_mvps').delete().eq('season_id', seasonId).eq('played_on', playedOn)
  if (error) throw error
}

// ── 계산 ──

export function gameScore(goals: DayGoal[], g: DayGame): [number, number] {
  const mine = goals.filter((x) => x.gameId === g.id)
  return [mine.filter((x) => x.teamId === g.homeTeamId).length, mine.filter((x) => x.teamId === g.awayTeamId).length]
}

export function goalText(x: DayGoal, names: Map<string, string>): string {
  const scorer = (x.scorerId && names.get(x.scorerId)) || x.scorerName
  if (x.kind === 'OWN_GOAL') return `자책골${scorer ? ` ${scorer}` : ''}`
  if (!scorer) return '득점자 모름'
  const assist = x.assistId && names.get(x.assistId)
  return assist ? `${scorer} (도움 ${assist})` : scorer
}

export interface ScorerRow { id: string; name: string; goals: number; assists: number }

/** 득점·도움 순위 (회원만, 자책골 제외) */
export function scorerTable(goals: DayGoal[], names: Map<string, string>): ScorerRow[] {
  const m = new Map<string, ScorerRow>()
  const row = (id: string) => m.get(id) ?? m.set(id, { id, name: names.get(id) ?? '?', goals: 0, assists: 0 }).get(id)!
  for (const x of goals) {
    if (x.kind !== 'GOAL') continue
    if (x.scorerId) row(x.scorerId).goals++
    if (x.assistId) row(x.assistId).assists++
  }
  return [...m.values()].sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name, 'ko'))
}

/** 팀 순위 (승 3·무 1, 득실차, 다득점) */
export interface StandingRow { teamId: string; played: number; win: number; draw: number; loss: number; gf: number; ga: number; points: number }
export function standings(teamIds: string[], games: DayGame[], goals: DayGoal[]): StandingRow[] {
  const t = new Map(teamIds.map((id) => [id, { teamId: id, played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, points: 0 }]))
  for (const g of games) {
    const [h, a] = gameScore(goals, g)
    const H = t.get(g.homeTeamId), A = t.get(g.awayTeamId)
    if (!H || !A) continue
    H.played++; A.played++; H.gf += h; H.ga += a; A.gf += a; A.ga += h
    if (h > a) { H.win++; A.loss++; H.points += 3 } else if (h < a) { A.win++; H.loss++; A.points += 3 } else { H.draw++; A.draw++; H.points++; A.points++ }
  }
  return [...t.values()].sort((x, y) => y.points - x.points || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
}
