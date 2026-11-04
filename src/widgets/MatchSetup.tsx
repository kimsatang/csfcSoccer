import { useState } from 'react'
import type { Dispatch } from 'react'
import type { Action } from '../app/store'
import type { MatchRole, Player } from '../entities/player'
import { POSITION_LABEL, ROLE_LABEL } from '../entities/player'
import { TEAM_COUNT, validateLeaders } from '../features/build-teams'
import { SkillBar } from './MemberManager'

interface Props {
  members: Player[]
  attendance: string[]
  roles: Record<string, MatchRole>
  dispatch: Dispatch<Action>
  onBuild: () => void
}

const ROLES: MatchRole[] = ['MEMBER', 'CAPTAIN', 'VICE']

export function MatchSetup({ members, attendance, roles, dispatch, onBuild }: Props) {
  const [query, setQuery] = useState('')
  const active = members.filter((m) => m.status === 'ACTIVE')
  const attendees = active.filter((m) => attendance.includes(m.id))
  const captainIds = attendees.filter((m) => roles[m.id] === 'CAPTAIN').map((m) => m.id)
  const viceIds = attendees.filter((m) => roles[m.id] === 'VICE').map((m) => m.id)
  const errors = validateLeaders(attendees, captainIds, viceIds)
  const list = active.filter((m) => m.name.includes(query.trim()))

  const setRole = (m: Player, role: MatchRole) => {
    if (role === 'CAPTAIN' && captainIds.length >= TEAM_COUNT && roles[m.id] !== 'CAPTAIN') return
    if (role === 'VICE' && viceIds.length >= TEAM_COUNT && roles[m.id] !== 'VICE') return
    if (!attendance.includes(m.id)) dispatch({ type: 'attend/toggle', id: m.id })
    dispatch({ type: 'role/set', id: m.id, role })
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>오늘 참석 · 역할 지정</h2>
          <p className="muted">참석자를 체크하고 팀장 {TEAM_COUNT}명, 부주장 {TEAM_COUNT}명을 지정하세요.</p>
        </div>
        <div className="row gap-s wrap">
          <button className="btn ghost" onClick={() => dispatch({ type: 'attend/set', ids: active.map((m) => m.id) })}>전체 참석</button>
          <button className="btn ghost" onClick={() => dispatch({ type: 'attend/set', ids: [] })}>전체 해제</button>
          <button className="btn ghost" onClick={() => dispatch({ type: 'role/reset' })}>역할 초기화</button>
        </div>
      </header>

      <div className="counters">
        <Counter label="참석" value={`${attendees.length}명`} ok={attendees.length >= TEAM_COUNT * 2} />
        <Counter label="팀장" value={`${captainIds.length}/${TEAM_COUNT}`} ok={captainIds.length === TEAM_COUNT} />
        <Counter label="부주장" value={`${viceIds.length}/${TEAM_COUNT}`} ok={viceIds.length === TEAM_COUNT} />
        <Counter label="팀당 예상" value={attendees.length ? `${Math.floor(attendees.length / TEAM_COUNT)}~${Math.ceil(attendees.length / TEAM_COUNT)}명` : '-'} ok />
      </div>

      <input className="search" placeholder="이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} />

      <ul className="attend-list">
        {list.map((m) => {
          const on = attendance.includes(m.id)
          const role = roles[m.id] ?? 'MEMBER'
          return (
            <li key={m.id} className={on ? 'on' : ''}>
              <label className="attend-check">
                <input type="checkbox" checked={on} onChange={() => dispatch({ type: 'attend/toggle', id: m.id })} />
                <span className="name">{m.name}</span>
                <span className={`pos pos-${m.mainPosition}`}>{POSITION_LABEL[m.mainPosition]}</span>
                <SkillBar value={m.skill} />
              </label>
              <div className="seg" role="radiogroup" aria-label={`${m.name} 역할`}>
                {ROLES.map((r) => {
                  const full = (r === 'CAPTAIN' && captainIds.length >= TEAM_COUNT && role !== 'CAPTAIN') || (r === 'VICE' && viceIds.length >= TEAM_COUNT && role !== 'VICE')
                  return (
                    <button key={r} type="button" className={`seg-btn ${role === r && on ? `sel sel-${r}` : ''}`} disabled={full} onClick={() => setRole(m, r)}>
                      {ROLE_LABEL[r]}
                    </button>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="sticky-cta">
        {errors.length > 0 && <p className="warn">{errors[0]}</p>}
        <button className="btn primary big" disabled={errors.length > 0} onClick={onBuild}>3팀 짜기</button>
      </div>
    </section>
  )
}

function Counter({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`counter ${ok ? 'ok' : ''}`}>
      <span className="counter-label">{label}</span>
      <span className="counter-value">{value}</span>
    </div>
  )
}
