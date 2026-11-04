import { useCallback, useEffect, useState } from 'react'
import type { Player } from '../entities/player'
import type { SeasonBundle } from '../entities/season'
import type { InviteRow } from '../features/invite/api'
import { LEADER_ROLE_LABEL, fetchInvites, inviteUrl, regenerateInvite } from '../features/invite/api'
import { TEAM_COLORS } from '../features/build-teams'

/** 운영진 전용: 팀장·부팀장 초대 링크 복사·가입 현황·재발급 */
export function InvitePanel({ bundle, members }: { bundle: SeasonBundle; members: Player[] }) {
  const [rows, setRows] = useState<InviteRow[]>([])
  const [msg, setMsg] = useState('')
  const [armed, setArmed] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchInvites().then(setRows).catch((e) => setMsg((e as Error).message))
  }, [])
  useEffect(() => { load() }, [load])

  const teamOf = (id: string) => bundle.teams.find((t) => t.id === id)
  const nameOf = (id?: string) => members.find((m) => m.id === id)?.name ?? '-'
  const sorted = rows
    .filter((r) => teamOf(r.seasonTeamId))
    .sort((a, b) => teamOf(a.seasonTeamId)!.slot - teamOf(b.seasonTeamId)!.slot || (a.role === 'CAPTAIN' ? -1 : 1))

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 2500) }
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); flash(`${label} 복사했습니다.`) }
    catch { window.prompt('복사하세요', text) }
  }
  const allText = () => [
    `⚽ ${bundle.season.name} 팀장·부팀장 가입 링크`,
    ...sorted.map((r) => `${teamOf(r.seasonTeamId)!.name} ${LEADER_ROLE_LABEL[r.role]} ${nameOf(r.memberId)}\n${inviteUrl(r.token)}`),
  ].join('\n\n')

  return (
    <details className="attend-box invite-panel">
      <summary>팀장·부팀장 초대 링크 <span className="muted">가입 {sorted.filter((r) => r.claimedEmail).length}/{sorted.length}</span></summary>
      {msg && <p className="toast">{msg}</p>}
      <div className="row gap-s wrap attend-actions">
        <button className="btn" onClick={() => copy(allText(), '전체 링크를')}>전체 링크 복사 (단톡방용)</button>
        <button className="btn ghost" onClick={load}>새로고침</button>
      </div>
      <table className="members invites">
        <thead><tr><th>팀</th><th>역할</th><th>이름</th><th>가입</th><th /></tr></thead>
        <tbody>
          {sorted.map((r) => {
            const t = teamOf(r.seasonTeamId)!
            return (
              <tr key={r.token}>
                <td><b style={{ color: TEAM_COLORS[t.slot].hex }}>{t.name}</b></td>
                <td>{LEADER_ROLE_LABEL[r.role]}</td>
                <td>{nameOf(r.memberId)}</td>
                <td className="small">{r.claimedEmail ? <span className="att att-HIGH">{r.claimedEmail}</span> : <span className="muted">대기</span>}</td>
                <td className="actions">
                  <button className="link" onClick={() => copy(inviteUrl(r.token), `${nameOf(r.memberId)} 링크를`)}>링크 복사</button>
                  <button
                    className="link danger"
                    title="기존 링크를 무효화하고 새 링크를 만듭니다. 이미 가입한 계정의 권한은 유지됩니다."
                    onClick={() => {
                      if (armed !== r.token) { setArmed(r.token); setTimeout(() => setArmed(null), 3000); return }
                      setArmed(null)
                      regenerateInvite(r.token).then(() => { flash('새 링크를 만들었습니다.'); load() }).catch((e) => setMsg((e as Error).message))
                    }}
                  >
                    {armed === r.token ? '재발급 확인' : '재발급'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </details>
  )
}
