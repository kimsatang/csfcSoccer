import { useMemo, useState } from 'react'
import type { Dispatch } from 'react'
import type { Action, DayDraft } from '../app/store'
import type { Player } from '../entities/player'
import { POSITIONS, POSITION_LABEL, shortYear, skillText } from '../entities/player'
import type { SeasonBundle } from '../entities/season'
import { matchDates, nextMatchDate, rosters, shortDate } from '../entities/season'
import { TEAM_COLORS } from '../features/build-teams'
import type { MatchPlayerInput } from '../features/build-teams/saveMatch'
import { saveMatch } from '../features/build-teams/saveMatch'

interface Props {
  members: Player[]
  bundle: SeasonBundle
  days: Record<string, DayDraft>
  showSkill: boolean
  dispatch: Dispatch<Action>
}

interface DayPlayer { player: Player; homeSlot?: number; slot?: number; role: MatchPlayerInput['role'] }

export function MatchDay({ members, bundle, days, showSkill, dispatch }: Props) {
  const dates = matchDates(bundle.season)
  const [date, setDate] = useState(() => nextMatchDate(bundle.season) ?? dates[0])
  const day = days[date] ?? { attendance: [], overrides: {} }
  const title = day.title ?? `CSFC ${shortDate(date)} 경기`
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [attendOpen, setAttendOpen] = useState(day.attendance.length === 0)

  const teamRosters = useMemo(() => rosters(members, bundle), [members, bundle])
  const homeSlot = useMemo(() => {
    const m = new Map<string, { slot: number; role: MatchPlayerInput['role'] }>()
    for (const r of teamRosters) {
      if (r.captain) m.set(r.captain.id, { slot: r.team.slot, role: 'CAPTAIN' })
      if (r.vice) m.set(r.vice.id, { slot: r.team.slot, role: 'VICE' })
      r.picks.forEach(({ player }) => m.set(player.id, { slot: r.team.slot, role: 'MEMBER' }))
    }
    return m
  }, [teamRosters])

  const active = members.filter((m) => m.status === 'ACTIVE')
  const unassignedMembers = active.filter((m) => !homeSlot.has(m.id))
  const attending: DayPlayer[] = active
    .filter((m) => day.attendance.includes(m.id))
    .map((player) => {
      const home = homeSlot.get(player.id)
      const slot = day.overrides[player.id] ?? home?.slot
      // 다른 팀으로 임시 이동한 팀장·부팀장은 그날 일반 팀원으로 기록
      const role = home && slot === home.slot ? home.role : 'MEMBER'
      return { player, homeSlot: home?.slot, slot, role }
    })
  const bySlot = [0, 1, 2].map((s) => attending.filter((a) => a.slot === s))
  const waiting = attending.filter((a) => a.slot === undefined)
  const counts = bySlot.map((t) => t.length)
  const gap = Math.max(...counts) - Math.min(...counts)

  const setOverride = (id: string, slot: number | null) => { setSaveMsg(null); dispatch({ type: 'day/override', date, id, slot }) }

  /** 미배정 참석자를 인원 적은 팀 → 평균 실력 낮은 팀 순으로 자동 배치 */
  const autoAssign = () => {
    const load = bySlot.map((t) => ({ n: t.length, sum: t.reduce((s, a) => s + a.player.skill, 0) }))
    for (const a of [...waiting].sort((x, y) => y.player.skill - x.player.skill)) {
      const target = [0, 1, 2].sort((i, j) => load[i].n - load[j].n || load[i].sum - load[j].sum)[0]
      load[target].n++; load[target].sum += a.player.skill
      setOverride(a.player.id, target)
    }
  }

  const copy = async () => {
    const text = [
      `⚽ ${title}`,
      ...bySlot.map((t, s) => [
        `[${bundle.teams.find((x) => x.slot === s)?.name ?? TEAM_COLORS[s].label}] ${t.length}명`,
        ...t.map((a) => `- ${a.player.name}${a.role === 'CAPTAIN' ? ' (팀장)' : a.role === 'VICE' ? ' (부팀장)' : ''}${a.homeSlot !== undefined && a.homeSlot !== a.slot ? ' *임시' : ''}`),
      ].join('\n')),
    ].join('\n\n')
    try { await navigator.clipboard.writeText(text); setToast('복사했습니다. 단톡방에 붙여넣으세요.') }
    catch { setToast('자동 복사가 안 되는 환경입니다.') }
    setTimeout(() => setToast(''), 2500)
  }

  const save = async () => {
    setBusy(true); setSaveMsg(null)
    try {
      const players = attending.filter((a) => a.slot !== undefined).map((a) => ({ member_id: a.player.id, role: a.role, team_index: a.slot! }))
      await saveMatch(title, date, players, bundle.season.id)
      setSaveMsg({ ok: true, text: `${shortDate(date)} 경기 기록을 저장했습니다.` })
    } catch (e) {
      setSaveMsg({ ok: false, text: `저장 실패: ${(e as Error).message}` })
    } finally { setBusy(false) }
  }

  const teamName = (slot: number) => bundle.teams.find((t) => t.slot === slot)?.name ?? TEAM_COLORS[slot].label

  return (
    <section className="panel">
      <header className="panel-head">
        <div className="grow">
          <div className="row gap-s wrap">
            <select className="date-select" value={date} onChange={(e) => { setDate(e.target.value); setSaveMsg(null) }}>
              {dates.map((d) => <option key={d} value={d}>{shortDate(d)}</option>)}
            </select>
            <input className="title-input" value={title} onChange={(e) => dispatch({ type: 'day/title', date, title: e.target.value })} />
          </div>
          <p className="muted">참석 {attending.length}명 · {counts.map((c, i) => `${teamName(i).replace(/팀$/, '')} ${c}`).join(' / ')}</p>
        </div>
        <div className="row gap-s wrap">
          <label className="toggle"><input type="checkbox" checked={showSkill} onChange={(e) => dispatch({ type: 'ui/showSkill', value: e.target.checked })} /> 실력 표시</label>
          <button className="btn ghost" onClick={copy} disabled={!attending.length}>결과 복사</button>
          <button className="btn primary" onClick={save} disabled={busy || !attending.length || waiting.length > 0 || saveMsg?.ok}>
            {busy ? '저장 중…' : saveMsg?.ok ? '저장됨' : '경기 기록 저장'}
          </button>
        </div>
      </header>

      {toast && <p className="toast">{toast}</p>}
      {saveMsg && <p className={saveMsg.ok ? 'toast' : 'warn'}>{saveMsg.text}</p>}

      <details className="attend-box" open={attendOpen} onToggle={(e) => setAttendOpen(e.currentTarget.open)}>
        <summary>참석 체크 <span className="muted">({attending.length}/{active.length})</span></summary>
        <div className="row gap-s wrap attend-actions">
          <button className="btn ghost" onClick={() => dispatch({ type: 'day/setAttendance', date, ids: active.map((m) => m.id) })}>전체 참석</button>
          <button className="btn ghost" onClick={() => dispatch({ type: 'day/setAttendance', date, ids: [] })}>전체 해제</button>
        </div>
        <div className="attend-groups">
          {teamRosters.map((r) => (
            <AttendGroup
              key={r.team.id}
              title={r.team.name}
              color={TEAM_COLORS[r.team.slot].hex}
              players={[r.captain, r.vice, ...r.picks.map((p) => p.player)].filter((p): p is Player => !!p && p.status === 'ACTIVE')}
              checked={day.attendance}
              onToggle={(id) => { setSaveMsg(null); dispatch({ type: 'day/toggle', date, id }) }}
            />
          ))}
          {unassignedMembers.length > 0 && (
            <AttendGroup
              title="팀 미배정"
              color="#9aa59d"
              players={unassignedMembers}
              checked={day.attendance}
              onToggle={(id) => { setSaveMsg(null); dispatch({ type: 'day/toggle', date, id }) }}
            />
          )}
        </div>
      </details>

      {waiting.length > 0 && (
        <div className="waiting">
          <p><b>팀 미배정 참석자 {waiting.length}명</b> <span className="muted small">— 드래프트되지 않은 회원(신입 등). 오늘 뛸 팀을 정해 주세요.</span></p>
          <div className="row gap-s wrap">
            {waiting.map((a) => (
              <span key={a.player.id} className="waiting-chip">
                {a.player.name} <span className={`pos pos-${a.player.mainPosition}`}>{POSITION_LABEL[a.player.mainPosition]}</span>
                <MoveSelect current={undefined} teamName={teamName} onChange={(s) => setOverride(a.player.id, s)} />
              </span>
            ))}
            <button className="btn" onClick={autoAssign}>자동 배치</button>
          </div>
        </div>
      )}

      {gap >= 2 && attending.length > 0 && (
        <p className="warn">팀 인원 차이가 {gap}명입니다. 인원이 많은 팀에서 '오늘만 이동'으로 맞출 수 있어요.</p>
      )}

      <div className="teams">
        {bySlot.map((players, slot) => {
          const r = teamRosters.find((x) => x.team.slot === slot)
          const absentLeaders = [r?.captain, r?.vice].filter((p) => p && !day.attendance.includes(p.id)) as Player[]
          const rated = players.filter((a) => !a.player.needsReview)
          const avg = rated.length ? rated.reduce((s, a) => s + a.player.skill, 0) / rated.length : 0
          const order = { CAPTAIN: 0, VICE: 1, MEMBER: 2 }
          return (
            <article key={slot} className="team" style={{ ['--team' as string]: TEAM_COLORS[slot].hex }}>
              <header className="team-head">
                <h3>{teamName(slot)}</h3>
                <span className="team-meta">{players.length}명{showSkill && rated.length > 0 && <> · 평균 {avg.toFixed(1)}</>}</span>
              </header>
              <div className="pos-summary">
                {POSITIONS.map((p) => <span key={p} className={`pos pos-${p} light`}>{POSITION_LABEL[p]} {players.filter((a) => a.player.mainPosition === p).length}</span>)}
              </div>
              <ul className="roster">
                {[...players].sort((a, b) => order[a.role] - order[b.role]).map((a) => (
                  <li key={a.player.id} className={a.role !== 'MEMBER' ? 'leader' : ''}>
                    {a.role === 'CAPTAIN' && <span className="badge cap">팀장</span>}
                    {a.role === 'VICE' && <span className="badge vice">부팀장</span>}
                    <span className="name">{a.player.name} <span className="year">{shortYear(a.player.birthYear)}</span>{a.homeSlot !== undefined && a.homeSlot !== slot && <span className="temp"> 임시</span>}</span>
                    <span className={`pos pos-${a.player.mainPosition}`}>{POSITION_LABEL[a.player.mainPosition]}</span>
                    {showSkill && <span className="skill-num">{skillText(a.player)}</span>}
                    <MoveSelect
                      current={slot}
                      home={a.homeSlot}
                      teamName={teamName}
                      onChange={(s) => setOverride(a.player.id, s === a.homeSlot ? null : s)}
                    />
                  </li>
                ))}
                {players.length === 0 && <li className="muted">참석자 없음</li>}
              </ul>
              {absentLeaders.length > 0 && (
                <p className="muted small absent">불참: {absentLeaders.map((p) => p.name).join(', ')}</p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function AttendGroup({ title, color, players, checked, onToggle }: {
  title: string; color: string; players: Player[]; checked: string[]; onToggle: (id: string) => void
}) {
  const n = players.filter((p) => checked.includes(p.id)).length
  return (
    <div className="attend-group" style={{ ['--team' as string]: color }}>
      <h4>{title} <span className="muted">{n}/{players.length}</span></h4>
      {players.map((p) => (
        <label key={p.id} className={`attend-pill ${checked.includes(p.id) ? 'on' : ''}`}>
          <input type="checkbox" checked={checked.includes(p.id)} onChange={() => onToggle(p.id)} />
          {p.name}
        </label>
      ))}
    </div>
  )
}

function MoveSelect({ current, home, teamName, onChange }: {
  current?: number; home?: number; teamName: (slot: number) => string; onChange: (slot: number) => void
}) {
  return (
    <select className="move" value="" aria-label="오늘 뛸 팀" onChange={(e) => onChange(Number(e.target.value))}>
      <option value="" disabled>{current === undefined ? '팀 선택' : '오늘만 이동'}</option>
      {[0, 1, 2].filter((s) => s !== current).map((s) => (
        <option key={s} value={s}>→ {teamName(s)}{s === home ? ' (원래 팀)' : ''}</option>
      ))}
    </select>
  )
}
