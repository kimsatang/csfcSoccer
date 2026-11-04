import { useState } from 'react'
import type { Dispatch } from 'react'
import type { Action } from '../app/store'
import type { Player } from '../entities/player'
import { POSITION_LABEL } from '../entities/player'
import type { Team } from '../features/build-teams'
import { TEAM_COLORS, evaluate, movePlayer, teamStats, teamsToText } from '../features/build-teams'
import { saveMatch } from '../features/build-teams/saveMatch'

const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  teams: Team[]
  title: string
  showSkill: boolean
  dispatch: Dispatch<Action>
  onReshuffle: () => void
  onBack: () => void
}

export function TeamBoard({ teams, title, showSkill, dispatch, onReshuffle, onBack }: Props) {
  const stats = teams.map(teamStats)
  const avgs = stats.map((s) => s.avgSkill)
  const avgGap = Math.max(...avgs) - Math.min(...avgs)
  const cost = evaluate(teams)
  const grade = cost < 3 ? '아주 균형' : cost < 6 ? '균형' : cost < 10 ? '보통' : '불균형'

  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const [playedOn, setPlayedOn] = useState(todayLocal)
  const [saveState, setSaveState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; msg?: string }>({ kind: 'idle' })
  const save = async () => {
    setSaveState({ kind: 'saving' })
    try { await saveMatch(title, playedOn, teams); setSaveState({ kind: 'saved', msg: `${playedOn} 경기로 저장했습니다.` }) }
    catch (e) { setSaveState({ kind: 'error', msg: `저장 실패: ${(e as Error).message}` }) }
  }
  const text = teamsToText(teams, title, showSkill)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied('ok'); setTimeout(() => setCopied(null), 2500) }
    catch { setCopied('fail') }
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <div className="grow">
          <input className="title-input" value={title} onChange={(e) => dispatch({ type: 'match/title', title: e.target.value })} />
          <p className="muted">
            균형도 <b className={`grade grade-${grade}`}>{grade}</b>
            {showSkill && <> · 평균 실력 차 {avgGap.toFixed(2)}</>}
          </p>
        </div>
        <div className="row gap-s wrap">
          <label className="toggle"><input type="checkbox" checked={showSkill} onChange={(e) => dispatch({ type: 'ui/showSkill', value: e.target.checked })} /> 실력 표시</label>
          <button className="btn ghost" onClick={onBack}>참석·역할 수정</button>
          <button className="btn" onClick={() => { setSaveState({ kind: 'idle' }); onReshuffle() }}>다시 섞기</button>
          <input type="date" className="date-input" aria-label="경기일" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} />
          <button className="btn" onClick={save} disabled={saveState.kind === 'saving' || saveState.kind === 'saved'}>
            {saveState.kind === 'saving' ? '저장 중…' : saveState.kind === 'saved' ? '저장됨' : '경기 기록 저장'}
          </button>
          <button className="btn primary" onClick={copy}>결과 복사</button>
        </div>
      </header>

      {copied === 'ok' && <p className="toast">복사했습니다. 단톡방에 붙여넣으세요.</p>}
      {saveState.kind === 'saved' && <p className="toast">{saveState.msg}</p>}
      {saveState.kind === 'error' && <p className="warn">{saveState.msg}</p>}
      {copied === 'fail' && (
        <div className="csv-box">
          <p className="muted small">자동 복사가 안 되는 환경입니다. 아래 내용을 길게 눌러 복사하세요.</p>
          <textarea rows={8} readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
      <div className="teams">
        {teams.map((t, i) => {
          const color = TEAM_COLORS[t.index]
          const st = stats[i]
          return (
            <article key={t.index} className="team" style={{ ['--team' as string]: color.hex }}>
              <header className="team-head">
                <h3>{color.label}팀</h3>
                <span className="team-meta">{st.size}명{showSkill && <> · 평균 {st.avgSkill.toFixed(1)}</>}</span>
              </header>
              <div className="pos-summary">
                {(['GK', 'DF', 'MF', 'FW'] as const).map((p) => (
                  <span key={p} className={`pos pos-${p} light`}>{POSITION_LABEL[p]} {st.positions[p]}</span>
                ))}
              </div>
              <ul className="roster">
                <PlayerRow p={t.captain} badge="팀장" showSkill={showSkill} />
                <PlayerRow p={t.vice} badge="부주장" showSkill={showSkill} />
                {t.members.map((m) => (
                  <PlayerRow key={m.id} p={m} showSkill={showSkill}>
                    <select
                      className="move"
                      aria-label={`${m.name} 팀 이동`}
                      value=""
                      onChange={(e) => { setSaveState({ kind: 'idle' }); dispatch({ type: 'teams/set', teams: movePlayer(teams, m.id, Number(e.target.value)) }) }}
                    >
                      <option value="" disabled>이동</option>
                      {teams.filter((o) => o.index !== t.index).map((o) => (
                        <option key={o.index} value={o.index}>→ {TEAM_COLORS[o.index].label}</option>
                      ))}
                    </select>
                  </PlayerRow>
                ))}
              </ul>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function PlayerRow({ p, badge, showSkill, children }: { p: Player; badge?: string; showSkill: boolean; children?: React.ReactNode }) {
  return (
    <li className={badge ? 'leader' : ''}>
      {badge && <span className={`badge ${badge === '팀장' ? 'cap' : 'vice'}`}>{badge}</span>}
      <span className="name">{p.name}</span>
      <span className={`pos pos-${p.mainPosition}`}>{POSITION_LABEL[p.mainPosition]}</span>
      {showSkill && <span className="skill-num">{p.skill}</span>}
      {children}
    </li>
  )
}
