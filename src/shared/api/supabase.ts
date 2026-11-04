import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/**
 * 메일 링크가 만료·재사용된 경우 Supabase가 `#error=...&error_code=otp_expired`로 돌려보낸다.
 * 클라이언트가 주소를 처리하기 전에 읽어 두고 주소창은 정리한다.
 */
function takeLinkError(): string | null {
  if (typeof window === 'undefined') return null
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  const params = new URLSearchParams(raw)
  const code = params.get('error_code') ?? params.get('error')
  if (!code) return null
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  if (/expired|invalid|access_denied/i.test(code)) return '로그인 링크가 만료되었거나 이미 사용되었습니다. 인증번호를 다시 받아 입력해 주세요.'
  return `로그인 링크 오류: ${params.get('error_description') ?? code}`
}

export const linkError = takeLinkError()

export const isSupabaseConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key', {
  // implicit: 메일 링크를 카카오톡 인앱 브라우저 등 다른 브라우저에서 열어도 로그인되도록
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
})
