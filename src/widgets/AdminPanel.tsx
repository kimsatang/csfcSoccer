import { useCallback, useEffect, useState } from 'react'
import type { AdminRow } from '../features/auth/adminsApi'
import { addAdmin, fetchAdmins, removeAdmin } from '../features/auth/adminsApi'

/** 슈퍼 관리자 전용: 운영진(관리자) 추가·삭제 */
export function AdminPanel() {
  const [rows, setRows] = useState<AdminRow[]>([])
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [armed, setArmed] = useState<string | null>(null)

  const load = useCallback(() => { fetchAdmins().then(setRows).catch((e) => setMsg((e as Error).message)) }, [])
  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await addAdmin(email, name); setEmail(''); setName(''); setMsg('운영진을 추가했습니다.'); load() }
    catch (err) { setMsg((err as Error).message) }
  }

  return (
    <details className="attend-box invite-panel">
      <summary>운영진 관리 <span className="muted">(슈퍼 관리자 전용 · {rows.length}명)</span></summary>
      {msg && <p className="toast">{msg}</p>}
      <form className="row gap-s wrap attend-actions" onSubmit={add}>
        <input type="email" required placeholder="운영진 이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn">운영진 추가</button>
      </form>
      <table className="members invites">
        <thead><tr><th>이메일</th><th>이름</th><th>권한</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.email}>
              <td>{r.email}</td>
              <td>{r.name ?? '-'}</td>
              <td>{r.role === 'SUPER' ? <span className="att att-HIGH">슈퍼 관리자</span> : '운영진'}</td>
              <td className="actions">
                {r.role !== 'SUPER' && (
                  <button
                    className="link danger"
                    onClick={() => {
                      if (armed !== r.email) { setArmed(r.email); setTimeout(() => setArmed(null), 3000); return }
                      setArmed(null)
                      removeAdmin(r.email).then(() => { setMsg('삭제했습니다.'); load() }).catch((e) => setMsg((e as Error).message))
                    }}
                  >
                    {armed === r.email ? '삭제 확인' : '삭제'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">추가된 운영진은 이메일 인증번호로 로그인하면 바로 운영진 화면을 씁니다.</p>
    </details>
  )
}
