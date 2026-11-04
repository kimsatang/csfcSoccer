import { useEffect, useState } from 'react'
import type { InviteInfo } from '../invite/api'
import { LEADER_ROLE_LABEL, fetchInviteInfo, readInviteToken } from '../invite/api'
import { sendMagicLink, signOut } from './useAuth'

export function LoginScreen({ forbiddenEmail }: { forbiddenEmail?: string }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [token] = useState(readInviteToken)
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [inviteMissing, setInviteMissing] = useState(false)

  useEffect(() => {
    if (!token) return
    fetchInviteInfo(token)
      .then((info) => (info ? setInvite(info) : setInviteMissing(true)))
      .catch(() => setInviteMissing(true))
  }, [token])

  if (forbiddenEmail) {
    return (
      <div className="login">
        <h1><span className="logo">CSFC</span> 팀짜기</h1>
        <p className="warn">{forbiddenEmail} 계정은 운영진이나 팀장으로 등록되어 있지 않습니다.</p>
        <p className="muted small">팀장·부팀장은 운영진에게 받은 <b>초대 링크</b>로 들어와 로그인하세요.</p>
        <button className="btn" onClick={() => signOut()}>다른 계정으로 로그인</button>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { await sendMagicLink(email, token); setSent(true) }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="login">
      <h1><span className="logo">CSFC</span> 팀짜기</h1>
      {invite ? (
        <div className="invite-card">
          <span className="muted small">{invite.seasonName}</span>
          <strong>{invite.teamName} {LEADER_ROLE_LABEL[invite.role]}{invite.memberName && ` · ${invite.memberName}`}</strong>
          <span className="small">초대 링크입니다. 이메일로 로그인하면 팀 관리 권한이 연결됩니다.</span>
          {invite.claimed && <span className="warn small">이미 가입된 링크입니다. 같은 이메일로 로그인하세요.</span>}
        </div>
      ) : inviteMissing ? (
        <p className="warn">초대 링크가 만료되었거나 잘못되었습니다. 운영진에게 새 링크를 요청하세요.</p>
      ) : (
        <p className="muted">운영진·팀장 전용입니다. 이메일로 받은 로그인 링크를 누르면 들어갈 수 있어요.</p>
      )}
      {sent ? (
        <div className="toast">
          {email} 로 로그인 링크를 보냈습니다. 메일함(스팸함 포함)에서 링크를 누르세요.
          <br /><span className="small">링크는 어느 브라우저에서 열어도 됩니다.</span>
        </div>
      ) : (
        <form onSubmit={submit} className="login-form">
          <input type="email" required placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <button className="btn primary" disabled={busy}>{busy ? '보내는 중…' : invite ? '가입하고 로그인 링크 받기' : '로그인 링크 받기'}</button>
        </form>
      )}
      {error && <p className="warn">{error}</p>}
    </div>
  )
}
