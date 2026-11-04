import { useState } from 'react'
import { signOut } from '../auth/useAuth'
import type { InviteInfo } from './api'
import { LEADER_ROLE_LABEL, claimInvite, clearInviteToken } from './api'

export function InviteConfirm({ email, token, info, onDone }: {
  email: string; token: string; info: InviteInfo | null; onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const accept = async () => {
    setBusy(true); setError('')
    try { await claimInvite(token); clearInviteToken(); onDone() }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  const skip = () => { clearInviteToken(); onDone() }

  return (
    <div className="login">
      <h1><span className="logo">CSFC</span> 팀짜기</h1>
      {info ? (
        <div className="invite-card">
          <span className="muted small">{info.seasonName}</span>
          <strong>{info.teamName} {LEADER_ROLE_LABEL[info.role]}{info.memberName && ` · ${info.memberName}`}</strong>
          <span className="small"><b>{email}</b> 계정을 이 팀의 {LEADER_ROLE_LABEL[info.role]}으로 등록합니다.</span>
          <span className="muted small">본인 링크가 맞는지 확인하세요. 등록하면 다른 계정은 이 링크를 쓸 수 없습니다.</span>
        </div>
      ) : (
        <p className="warn">초대 링크가 만료되었거나 잘못되었습니다. 운영진에게 새 링크를 요청하세요.</p>
      )}
      {error && <p className="warn">{error}</p>}
      <div className="login-form">
        {info && <button className="btn primary" disabled={busy} onClick={accept}>{busy ? '등록 중…' : '등록하고 시작하기'}</button>}
        <button className="btn ghost" disabled={busy} onClick={skip}>등록하지 않고 계속</button>
        <button className="btn ghost" disabled={busy} onClick={() => signOut()}>다른 이메일로 로그인</button>
      </div>
    </div>
  )
}
