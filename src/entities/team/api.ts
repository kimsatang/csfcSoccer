import { supabase } from '../../shared/api/supabase'
import type { SlotMap } from './formations'
import { DEFAULT_FORMATION } from './formations'

export interface TeamGame {
  gameNo: number
  formation: string
  slots: SlotMap
  opponentTeamId?: string
}

export const newGame = (gameNo: number): TeamGame => ({ gameNo, formation: DEFAULT_FORMATION, slots: {} })

export async function fetchTeamDay(teamId: string, date: string): Promise<{ attendeeIds: string[]; games: TeamGame[] }> {
  const [day, games] = await Promise.all([
    supabase.from('team_days').select('attendee_ids').eq('season_team_id', teamId).eq('played_on', date).maybeSingle(),
    supabase.from('team_games').select('game_no,formation,slots,opponent_team_id')
      .eq('season_team_id', teamId).eq('played_on', date).order('game_no'),
  ])
  if (day.error) throw day.error
  if (games.error) throw games.error
  return {
    attendeeIds: (day.data?.attendee_ids as string[] | undefined) ?? [],
    games: (games.data ?? []).map((g) => ({
      gameNo: g.game_no, formation: g.formation, slots: (g.slots ?? {}) as SlotMap, opponentTeamId: g.opponent_team_id ?? undefined,
    })),
  }
}

export async function saveAttendees(teamId: string, date: string, attendeeIds: string[]): Promise<void> {
  const { error } = await supabase.from('team_days').upsert(
    { season_team_id: teamId, played_on: date, attendee_ids: attendeeIds, updated_at: new Date().toISOString() },
    { onConflict: 'season_team_id,played_on' },
  )
  if (error) throw error
}

export async function saveGame(teamId: string, date: string, g: TeamGame): Promise<void> {
  const { error } = await supabase.from('team_games').upsert(
    {
      season_team_id: teamId, played_on: date, game_no: g.gameNo, formation: g.formation, slots: g.slots,
      opponent_team_id: g.opponentTeamId ?? null, updated_at: new Date().toISOString(),
    },
    { onConflict: 'season_team_id,played_on,game_no' },
  )
  if (error) throw error
}

export async function removeGame(teamId: string, date: string, gameNo: number): Promise<void> {
  const { error } = await supabase.from('team_games').delete()
    .eq('season_team_id', teamId).eq('played_on', date).eq('game_no', gameNo)
  if (error) throw error
}

/** 경기일에 팀장들이 입력한 참석자 전체 (운영진 경기 당일 화면용) */
export async function fetchDayAttendeesAllTeams(date: string): Promise<string[]> {
  const { data, error } = await supabase.from('team_days').select('attendee_ids').eq('played_on', date)
  if (error) throw error
  return [...new Set((data ?? []).flatMap((r) => r.attendee_ids as string[]))]
}
