import { supabase } from '../../shared/api/supabase'

export type LeaderRole = 'CAPTAIN' | 'VICE'
export const LEADER_ROLE_LABEL: Record<LeaderRole, string> = { CAPTAIN: '팀장', VICE: '부팀장' }

export interface InviteInfo {
  teamName: string
  role: LeaderRole
  memberName?: string
  seasonName: string
  claimed: boolean
}

interface InviteInfoRow { team_name: string; role: LeaderRole; member_name: string | null; season_name: string; claimed: boolean }
const toInfo = (r: InviteInfoRow): InviteInfo => ({
  teamName: r.team_name, role: r.role, memberName: r.member_name ?? undefined, seasonName: r.season_name, claimed: r.claimed,
})

const PARAM = 'invite'

export function readInviteToken(): string | null {
  return new URLSearchParams(window.location.search).get(PARAM)
}

export function clearInviteToken(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete(PARAM)
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}/?${PARAM}=${token}`
}

/** 로그인 전에도 조회 가능 (토큰을 아는 사람만) */
export async function fetchInviteInfo(token: string): Promise<InviteInfo | null> {
  const { data, error } = await supabase.rpc('invite_info', { p_token: token })
  if (error) throw error
  return data ? toInfo(data as InviteInfoRow) : null
}

export async function claimInvite(token: string): Promise<InviteInfo> {
  const { data, error } = await supabase.rpc('claim_invite', { p_token: token })
  if (error) throw error
  return toInfo(data as InviteInfoRow)
}

// ── 운영진: 초대 링크 관리 ─────────────────────────────────────────
export interface InviteRow {
  token: string
  seasonTeamId: string
  role: LeaderRole
  memberId?: string
  claimedEmail?: string
  claimedAt?: string
}

export async function fetchInvites(): Promise<InviteRow[]> {
  const { data, error } = await supabase
    .from('team_invites')
    .select('token,season_team_id,role,member_id,claimed_email,claimed_at')
  if (error) throw error
  return (data ?? []).map((r) => ({
    token: r.token, seasonTeamId: r.season_team_id, role: r.role as LeaderRole,
    memberId: r.member_id ?? undefined, claimedEmail: r.claimed_email ?? undefined, claimedAt: r.claimed_at ?? undefined,
  }))
}

/** 링크 재발급: 새 토큰으로 바꾸고 가입 상태 초기화 (이미 가입한 계정의 권한은 유지) */
export async function regenerateInvite(oldToken: string): Promise<void> {
  const token = crypto.randomUUID().replace(/-/g, '')
  const { error } = await supabase
    .from('team_invites')
    .update({ token, claimed_by: null, claimed_email: null, claimed_at: null })
    .eq('token', oldToken)
  if (error) throw error
}

/** 내가 팀장·부팀장으로 등록된 시즌 팀 id */
export async function fetchMyLeaderTeams(): Promise<{ teamId: string; role: LeaderRole }[]> {
  const { data: s } = await supabase.auth.getSession()
  const uid = s.session?.user.id
  if (!uid) return []
  const { data, error } = await supabase.from('team_leaders').select('season_team_id,role').eq('user_id', uid)
  if (error) throw error
  return (data ?? []).map((r) => ({ teamId: r.season_team_id, role: r.role as LeaderRole }))
}
