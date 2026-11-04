import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../shared/api/supabase'
import type { InviteInfo, LeaderRole } from '../invite/api'
import { fetchInviteInfo, fetchMyLeaderTeams, readInviteToken } from '../invite/api'

export interface Viewer {
  email: string
  isAdmin: boolean
  /** 슈퍼 관리자: 운영진 추가·삭제 가능 */
  isSuper: boolean
  /** 팀장·부팀장으로 맡은 시즌 팀 */
  leaderTeams: { teamId: string; role: LeaderRole }[]
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'forbidden'; email: string }
  /** 로그인 상태에서 초대 링크를 연 경우: 등록 확인 단계 (다른 사람 링크를 실수로 가져가지 않도록) */
  | { status: 'invite'; email: string; token: string; info: InviteInfo | null }
  | { status: 'ready'; viewer: Viewer }

async function resolveViewer(session: Session): Promise<AuthState> {
  const email = session.user.email ?? ''
  const token = readInviteToken()
  if (token) {
    const info = await fetchInviteInfo(token).catch(() => null)
    return { status: 'invite', email, token, info }
  }
  // admins 테이블은 운영진에게만 보이므로, 조회 결과가 있으면 운영진
  const [{ data: adminRows }, leaderTeams] = await Promise.all([
    supabase.from('admins').select('email,role'),
    fetchMyLeaderTeams().catch(() => []),
  ])
  const isAdmin = Boolean(adminRows?.length)
  const isSuper = Boolean(adminRows?.some((a) => a.email === email.toLowerCase() && a.role === 'SUPER'))
  if (!isAdmin && leaderTeams.length === 0) return { status: 'forbidden', email }
  return { status: 'ready', viewer: { email, isAdmin, isSuper, leaderTeams } }
}

export function useAuth(): [AuthState, () => void] {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const lastUser = useRef<string | null | undefined>(undefined)
  const alive = useRef(true)

  const apply = useCallback((session: Session | null, force = false) => {
    const uid = session?.user.id ?? null
    if (!force && uid === lastUser.current) return // 토큰 갱신 등 같은 사용자 이벤트는 무시
    lastUser.current = uid
    if (!session) { if (alive.current) setState({ status: 'signedOut' }); return }
    resolveViewer(session).then((s) => alive.current && setState(s))
  }, [])

  useEffect(() => {
    alive.current = true
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // 콜백 안에서 supabase 호출 시 교착 방지를 위해 다음 틱에 실행
      setTimeout(() => apply(session), 0)
    })
    return () => { alive.current = false; sub.subscription.unsubscribe() }
  }, [apply])

  const refresh = useCallback(() => {
    supabase.auth.getSession().then(({ data }) => apply(data.session, true))
  }, [apply])

  return [state, refresh]
}

export async function sendMagicLink(email: string, inviteToken?: string | null): Promise<void> {
  const redirect = new URL(window.location.origin)
  if (inviteToken) redirect.searchParams.set('invite', inviteToken)
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: redirect.toString() },
  })
  if (error) throw error
}

/** 메일로 받은 인증번호로 로그인 (링크를 다른 브라우저에서 여는 문제를 피하는 방법) */
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.replace(/\s/g, ''),
    type: 'email',
  })
  if (error) throw new Error(/expired|invalid/i.test(error.message) ? '인증번호가 틀렸거나 만료되었습니다. 다시 받아 주세요.' : error.message)
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
