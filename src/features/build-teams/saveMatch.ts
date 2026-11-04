import { supabase } from '../../shared/api/supabase'

export interface MatchPlayerInput {
  member_id: string
  role: 'MEMBER' | 'CAPTAIN' | 'VICE'
  team_index: number
}

/** 경기 기록 저장 (matches + match_players 한 트랜잭션) 후 시즌에 연결 */
export async function saveMatch(title: string, playedOn: string, players: MatchPlayerInput[], seasonId?: string): Promise<string> {
  const { data, error } = await supabase.rpc('save_match', { p_title: title, p_played_on: playedOn, p_players: players })
  if (error) throw error
  const matchId = data as string
  if (seasonId) {
    const { error: e2 } = await supabase.from('matches').update({ season_id: seasonId }).eq('id', matchId)
    if (e2) throw e2
  }
  return matchId
}
