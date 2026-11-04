import { supabase } from '../../shared/api/supabase'
import type { DraftPick, Season, SeasonBundle, SeasonStatus, SeasonTeam } from './model'

interface SeasonRow {
  id: string; name: string; starts_on: string; ends_on: string; match_weekday: number
  status: SeasonStatus; draft_team_order: string[] | null
}
interface TeamRow { id: string; slot: number; name: string; captain_id: string; vice_id: string; draft_order: number }
interface PickRow { pick_no: number; team_id: string; member_id: string }

const toSeason = (r: SeasonRow): Season => ({
  id: r.id, name: r.name, startsOn: r.starts_on, endsOn: r.ends_on, matchWeekday: r.match_weekday,
  status: r.status, draftTeamOrder: r.draft_team_order,
})
const toTeam = (r: TeamRow): SeasonTeam => ({
  id: r.id, slot: r.slot, name: r.name, captainId: r.captain_id, viceId: r.vice_id, draftOrder: r.draft_order,
})
const toPick = (r: PickRow): DraftPick => ({ pickNo: r.pick_no, teamId: r.team_id, memberId: r.member_id })

/** 진행 중(드래프트/확정) 시즌 중 가장 최근 것 */
export async function fetchCurrentSeason(): Promise<SeasonBundle | null> {
  const { data: seasons, error } = await supabase
    .from('seasons')
    .select('id,name,starts_on,ends_on,match_weekday,status,draft_team_order')
    .neq('status', 'CLOSED')
    .order('starts_on', { ascending: false })
    .limit(1)
  if (error) throw error
  if (!seasons?.length) return null
  const season = toSeason(seasons[0] as SeasonRow)
  return { season, ...(await fetchSeasonDetail(season.id)) }
}

async function fetchSeasonDetail(seasonId: string): Promise<{ teams: SeasonTeam[]; picks: DraftPick[] }> {
  const [teams, picks] = await Promise.all([
    supabase.from('season_teams').select('id,slot,name,captain_id,vice_id,draft_order').eq('season_id', seasonId).order('slot'),
    supabase.from('draft_picks').select('pick_no,team_id,member_id').eq('season_id', seasonId).order('pick_no'),
  ])
  if (teams.error) throw teams.error
  if (picks.error) throw picks.error
  return { teams: (teams.data as TeamRow[]).map(toTeam), picks: (picks.data as PickRow[]).map(toPick) }
}

/** 지명 — 차례(팀)는 서버가 스네이크 규칙으로 결정 */
export async function makePick(seasonId: string, memberId: string): Promise<DraftPick> {
  const { data, error } = await supabase.rpc('make_pick', { p_season_id: seasonId, p_member_id: memberId })
  if (error) throw error
  return toPick(data as PickRow)
}

/** 마지막 지명 취소 */
export async function undoLastPick(seasonId: string, lastPickNo: number): Promise<void> {
  const { error } = await supabase.from('draft_picks').delete().eq('season_id', seasonId).eq('pick_no', lastPickNo)
  if (error) throw error
}

export async function setDraftOrder(seasonId: string, teamIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('set_draft_order', { p_season_id: seasonId, p_team_ids: teamIds })
  if (error) throw error
}

export async function finishDraft(seasonId: string): Promise<void> {
  const { error } = await supabase.rpc('finish_draft', { p_season_id: seasonId })
  if (error) throw error
}

/** 드래프트 확정 후 늦게 가입한 회원을 팀에 추가할 때: 시즌을 다시 드래프트 상태로 */
export async function reopenDraft(seasonId: string): Promise<void> {
  const { error } = await supabase.from('seasons').update({ status: 'DRAFTING' }).eq('id', seasonId)
  if (error) throw error
}
