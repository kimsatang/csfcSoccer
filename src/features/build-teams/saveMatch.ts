import { supabase } from '../../shared/api/supabase'
import type { Team } from './buildTeams'

/** 편성 결과를 경기 기록으로 저장 (matches + match_players 한 트랜잭션) */
export async function saveMatch(title: string, playedOn: string, teams: Team[]): Promise<string> {
  const players = teams.flatMap((t) => [
    { member_id: t.captain.id, role: 'CAPTAIN', team_index: t.index },
    { member_id: t.vice.id, role: 'VICE', team_index: t.index },
    ...t.members.map((m) => ({ member_id: m.id, role: 'MEMBER', team_index: t.index })),
  ])
  const { data, error } = await supabase.rpc('save_match', { p_title: title, p_played_on: playedOn, p_players: players })
  if (error) throw error
  return data as string
}
