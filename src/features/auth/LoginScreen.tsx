import { useState } from 'react'
import { sendMagicLink, signOut } from './useAuth'

export function LoginScreen({ forbiddenEmail }: { forbiddenEmail?: string }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (forbiddenEmail) {
    return (
      <div className="login">
        <h1><span className="logo">CSFC</span> 팀짜기</h1>
        <p className="warn">{forbiddenEmail} 계정은 운영진으로 등록되어 있지 않습니다.</p>
        <p className="muted small">운영진에게 이메일 등록을 요청하세요.</p>
        <button className="btn" onClick={() => signOut()}>다른 계정으로 로그인</button>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { await sendMagicLink(email); setSent(true) }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="login">
      <h1><span className="logo">CSFC</span> 팀짜기</h1>
      <p className="muted">운영진 전용입니다. 이메일로 받은 로그인 링크를 누르면 들어갈 수 있어요.</p>
      {sent ? (
        <div className="toast">{email} 로 로그인 링크를 보냈습니다. 메일함을 확인하세요.</div>
      ) : (
        <form onSubmit={submit} className="login-form">
          <input type="email" required placeholder="운영진 이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn primary" disabled={busy}>{busy ? '보내는 중…' : '로그인 링크 받기'}</button>
        </form>
      )}
      {error && <p className="warn">{error}</p>}
    </div>
  )
}
