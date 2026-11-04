import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../shared/api/supabase'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'forbidden'; email: string }
  | { status: 'admin'; email: string }

/** admins 테이블은 운영진에게만 보이므로, 조회 결과가 있으면 운영진 */
async function checkAdmin(session: Session): Promise<AuthState> {
  const email = session.user.email ?? ''
  const { data, error } = await supabase.from('admins').select('email').limit(1)
  if (error || !data?.length) return { status: 'forbidden', email }
  return { status: 'admin', email }
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    const apply = (session: Session | null) => {
      if (!session) { if (alive) setState({ status: 'signedOut' }); return }
      checkAdmin(session).then((s) => alive && setState(s))
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // 콜백 안에서 supabase 호출 시 교착 방지를 위해 다음 틱에 실행
        setTimeout(() => apply(session), 0)
      }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  return state
}

export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
