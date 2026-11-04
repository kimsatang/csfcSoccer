import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Player } from '../entities/player'
import { POSITION_LABEL, shortYear } from '../entities/player'
import type { SeasonBundle } from '../entities/season'
import { matchDates, nextMatchDate, rosters, shortDate } from '../entities/season'
import type { TeamGame } from '../entities/team/api'
import { fetchTeamDay, newGame, removeGame, saveAttendees, saveGame } from '../entities/team/api'
import type { Slot, SlotMap } from '../entities/team/formations'
import { FORMATIONS, FORMATION_NAMES, assignSlot, remapSlots } from '../entities/team/formations'
import { exportCanvas, renderLineup } from '../entities/team/renderLineup'
import type { Viewer } from '../features/auth/useAuth'
import { TEAM_COLORS } from '../features/build-teams'
import { InvitePanel } from './InvitePanel'

interface Props {
  members: Player[]
  bundle: SeasonBundle
  viewer: Viewer
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** 자리 라벨에 맞는 포지션 선호 (자동 채우기용) */
const SLOT_POS: Record<string, Player['mainPosition']> = {
  GK: 'GK', LB: 'DF', RB: 'DF', CB: 'DF', LWB: 'DF', RWB: 'DF',
  DM: 'MF', CM: 'MF', LM: 'MF', RM: 'MF', AM: 'MF',
  LW: 'FW', RW: 'FW', ST: 'FW',
}

export function TeamManager({ members, bundle, viewer }: Props) {
  const manageable = useMemo(() => {
    const teams = [...bundle.teams].sort((a, b) => a.slot - b.slot)
    return viewer.isAdmin ? teams : teams.filter((t) => viewer.leaderTeams.some((l) => l.teamId === t.id))
  }, [bundle.teams, viewer])
  const dates = matchDates(bundle.season)
  const [teamId, setTeamId] = useState(manageable[0]?.id)
  const [date, setDate] = useState(() => nextMatchDate(bundle.season) ?? dates[0])
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])
  const [games, setGames] = useState<TeamGame[]>([newGame(1)])
  const [active, setActive] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [pickSlot, setPickSlot] = useState<Slot | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)

  const team = manageable.find((t) => t.id === teamId)
  const color = TEAM_COLORS[team?.slot ?? 0].hex
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const roster = useMemo(() => {
    const r = rosters(members, bundle).find((x) => x.team.id === teamId)
    return r ? ([r.captain, r.vice, ...r.picks.map((p) => p.player)].filter(Boolean) as Player[]) : []
  }, [members, bundle, teamId])
  const leaderRole = (id: string) => (team?.captainId === id ? '팀장' : team?.viceId === id ? '부팀장' : undefined)

  const load = useCallback(async () => {
    if (!teamId) return
    setLoading(true); setError(''); setPreview(null)
    try {
      const d = await fetchTeamDay(teamId, date)
      setAttendeeIds(d.attendeeIds)
      setGames(d.games.length ? d.games : [newGame(1)])
      setActive(d.games[0]?.gameNo ?? 1)
      setSaveState('idle')
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [teamId, date])
  useEffect(() => { void load() }, [load])

  /** 변경 즉시 화면 반영, 0.6초 뒤 저장 (연속 터치 시 한 번만 저장) */
  const persist = (job: () => Promise<void>) => {
    window.clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = window.setTimeout(() => {
      job().then(() => setSaveState('saved')).catch((e) => { setSaveState('error'); setError(`저장 실패: ${(e as Error).message}`) })
    }, 600)
  }

  const game = games.find((g) => g.gameNo === active) ?? games[0]
  const slots = FORMATIONS[game.formation] ?? FORMATIONS['4-4-2']
  const assigned = new Set(Object.values(game.slots))
  const attendees = attendeeIds.map((id) => byId.get(id)).filter(Boolean) as Player[]
  const pool = attendees.length ? attendees : roster
  const bench = attendees.filter((p) => !assigned.has(p.id))
  const outsiders = members.filter((m) => m.status === 'ACTIVE' && !roster.some((r) => r.id === m.id))

  const updateGame = (g: TeamGame) => {
    setGames((gs) => gs.map((x) => (x.gameNo === g.gameNo ? g : x)))
    setPreview(null)
    if (teamId) persist(() => saveGame(teamId, date, g))
  }

  const toggleAttendee = (id: string) => {
    const next = attendeeIds.includes(id) ? attendeeIds.filter((x) => x !== id) : [...attendeeIds, id]
    setAttendeeIds(next)
    // 불참 처리된 선수는 모든 경기 라인업에서 제외
    if (!next.includes(id)) {
      setGames((gs) => gs.map((g) => {
        const key = Object.keys(g.slots).find((k) => g.slots[k] === id)
        if (!key) return g
        const ng = { ...g, slots: assignSlot(g.slots, key, null) }
        if (teamId) void saveGame(teamId, date, ng)
        return ng
      }))
    }
    if (teamId) persist(() => saveAttendees(teamId, date, next))
  }

  const addGame = () => {
    const no = Math.max(...games.map((g) => g.gameNo)) + 1
    if (no > 10) return
    // 새 경기는 직전 경기 라인업을 복사해서 시작 (교체만 손보면 되도록)
    const prev = games[games.length - 1]
    const g: TeamGame = { gameNo: no, formation: prev.formation, slots: { ...prev.slots } }
    setGames([...games, g])
    setActive(no)
    if (teamId) persist(() => saveGame(teamId, date, g))
  }

  const deleteGame = async () => {
    if (!teamId) return
    try {
      await removeGame(teamId, date, game.gameNo)
      const rest = games.filter((g) => g.gameNo !== game.gameNo)
      setGames(rest.length ? rest : [newGame(1)])
      setActive(rest[0]?.gameNo ?? 1)
    } catch (e) { setError((e as Error).message) }
  }

  const autoFill = () => {
    let next: SlotMap = { ...game.slots }
    const free = [...bench]
    const take = (pred: (p: Player) => boolean) => {
      const i = free.findIndex(pred)
      return i >= 0 ? free.splice(i, 1)[0] : undefined
    }
    for (const s of slots) {
      if (next[s.key]) continue
      const want = SLOT_POS[s.label]
      const p = take((x) => !x.needsReview && x.mainPosition === want)
        ?? take((x) => !x.needsReview && x.subPosition === want)
        ?? (want === 'GK' ? undefined : take(() => true))
      if (p) next = assignSlot(next, s.key, p.id)
    }
    updateGame({ ...game, slots: next })
  }

  const exportImage = async () => {
    if (!team) return
    const opp = bundle.teams.find((t) => t.id === game.opponentTeamId)
    const names = Object.fromEntries(Object.entries(game.slots).map(([k, id]) => [k, byId.get(id)?.name ?? '?']))
    const canvas = renderLineup({
      title: team.name,
      subtitle: `${shortDate(date)} ${game.gameNo}경기${opp ? ` vs ${opp.name}` : ''} · ${game.formation}`,
      color,
      slots,
      names,
      bench: bench.map((p) => p.name),
      footer: bundle.season.name,
    })
    setPreview(canvas.toDataURL('image/png'))
    try { await exportCanvas(canvas, `${team.name}_${date}_${game.gameNo}경기.png`) }
    catch (e) { setError((e as Error).message) }
  }

  const confirmClick = (key: string, action: () => void) => {
    if (armed === key) { setArmed(null); action() }
    else { setArmed(key); setTimeout(() => setArmed((k) => (k === key ? null : k)), 3000) }
  }

  if (!team) return <p className="panel muted">관리할 수 있는 팀이 없습니다.</p>

  return (
    <section className="panel" style={{ ['--team' as string]: color }}>
      <header className="panel-head">
        <div className="grow">
          <div className="row gap-s wrap">
            {manageable.length > 1 ? (
              <div className="seg">
                {manageable.map((t) => (
                  <button key={t.id} className={`seg-btn ${t.id === teamId ? 'sel' : ''}`} onClick={() => setTeamId(t.id)}>{t.name}</button>
                ))}
              </div>
            ) : <h2 className="team-title">{team.name}</h2>}
            <select className="date-select" value={date} onChange={(e) => setDate(e.target.value)}>
              {dates.map((d) => <option key={d} value={d}>{shortDate(d)}</option>)}
            </select>
          </div>
          <p className="muted small">
            참석 {attendees.length}명 / 팀원 {roster.length}명 ·{' '}
            {saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '자동 저장됨' : saveState === 'error' ? '저장 실패' : '변경하면 자동 저장'}
          </p>
        </div>
      </header>

      {error && <p className="warn">{error}</p>}
      {viewer.isAdmin && <InvitePanel bundle={bundle} members={members} />}
      {loading ? <p className="muted">불러오는 중…</p> : (
        <>
          <details className="attend-box" open={attendees.length === 0}>
            <summary>{shortDate(date)} 참석자 <span className="muted">({attendees.length}/{roster.length})</span></summary>
            <div className="row gap-s wrap attend-actions">
              <button className="btn ghost" onClick={() => { setAttendeeIds(roster.map((r) => r.id)); persist(() => saveAttendees(teamId!, date, roster.map((r) => r.id))) }}>팀원 전체 참석</button>
              {outsiders.length > 0 && (
                <select className="move" value="" aria-label="다른 회원 추가" onChange={(e) => e.target.value && toggleAttendee(e.target.value)}>
                  <option value="">+ 다른 회원(용병) 추가</option>
                  {outsiders.filter((m) => !attendeeIds.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name} ({shortYear(m.birthYear)})</option>)}
                </select>
              )}
            </div>
            <div className="attend-group" style={{ border: 0, paddingLeft: 0 }}>
              {[...roster, ...attendees.filter((a) => !roster.some((r) => r.id === a.id))].map((p) => (
                <label key={p.id} className={`attend-pill ${attendeeIds.includes(p.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={attendeeIds.includes(p.id)} onChange={() => toggleAttendee(p.id)} />
                  {leaderRole(p.id) && <b className="mini-badge">{leaderRole(p.id)}</b>}
                  {p.name}
                  {!roster.some((r) => r.id === p.id) && <span className="small"> 용병</span>}
                </label>
              ))}
            </div>
          </details>

          <div className="game-tabs">
            {games.map((g) => (
              <button key={g.gameNo} className={`game-tab ${g.gameNo === active ? 'on' : ''}`} onClick={() => { setActive(g.gameNo); setPreview(null) }}>
                {g.gameNo}경기
              </button>
            ))}
            <button className="game-tab add" onClick={addGame} disabled={games.length >= 10}>+ 경기 추가</button>
          </div>

          <div className="row gap-s wrap lineup-controls">
            <label className="field">포메이션
              <select value={game.formation} onChange={(e) => updateGame({ ...game, formation: e.target.value, slots: remapSlots(game.slots, game.formation, e.target.value) })}>
                {FORMATION_NAMES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="field">상대
              <select value={game.opponentTeamId ?? ''} onChange={(e) => updateGame({ ...game, opponentTeamId: e.target.value || undefined })}>
                <option value="">미정</option>
                {bundle.teams.filter((t) => t.id !== teamId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <span className="grow" />
            <button className="btn ghost" onClick={autoFill} disabled={!bench.length}>빈자리 자동 채우기</button>
            <button className="btn ghost" onClick={() => confirmClick('clear', () => updateGame({ ...game, slots: {} }))}>
              {armed === 'clear' ? '정말 비울까요?' : '라인업 비우기'}
            </button>
            {games.length > 1 && (
              <button className="btn danger-ghost" onClick={() => confirmClick('del', deleteGame)}>
                {armed === 'del' ? `${game.gameNo}경기 삭제?` : '경기 삭제'}
              </button>
            )}
          </div>

          <div className="lineup-wrap">
            <div className="pitch">
              <PitchLines />
              {slots.map((s) => {
                const p = game.slots[s.key] ? byId.get(game.slots[s.key]) : undefined
                return (
                  <button
                    key={s.key}
                    className={`slot ${p ? 'filled' : ''} ${pickSlot?.key === s.key ? 'picking' : ''}`}
                    style={{ left: `${s.x}%`, top: `${s.y}%` }}
                    onClick={() => setPickSlot(s)}
                  >
                    <span className="slot-dot">{s.label}</span>
                    <span className="slot-name">{p?.name ?? '+'}</span>
                  </button>
                )
              })}
            </div>

            <aside className="bench">
              <h4>교체 / 미배정 <span className="muted">{bench.length}명</span></h4>
              {attendees.length === 0 && <p className="muted small">위에서 참석자를 먼저 체크하세요.</p>}
              <div className="bench-list">
                {bench.map((p) => (
                  <span key={p.id} className="bench-chip">
                    {p.name} <span className="year">{shortYear(p.birthYear)}</span>
                    {!p.needsReview && <span className={`pos pos-${p.mainPosition}`}>{POSITION_LABEL[p.mainPosition]}</span>}
                  </span>
                ))}
              </div>
              <p className="muted small">선발 {assigned.size}/11</p>
              <button className="btn primary big" onClick={exportImage}>이미지 저장</button>
              {preview && (
                <div className="preview">
                  <p className="muted small">저장이 안 되면 이미지를 길게 눌러 저장하세요.</p>
                  <img src={preview} alt={`${team.name} ${game.gameNo}경기 라인업`} />
                </div>
              )}
            </aside>
          </div>
        </>
      )}

      {pickSlot && (
        <div className="sheet-backdrop" onClick={() => setPickSlot(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <header className="row gap-s">
              <h3 className="grow">{pickSlot.label} 자리 선수 선택</h3>
              <button className="btn ghost" onClick={() => setPickSlot(null)}>닫기</button>
            </header>
            {game.slots[pickSlot.key] && (
              <button className="btn danger-ghost" onClick={() => { updateGame({ ...game, slots: assignSlot(game.slots, pickSlot.key, null) }); setPickSlot(null) }}>
                이 자리 비우기
              </button>
            )}
            {attendees.length === 0 && <p className="muted small">참석자가 없어 팀원 전체를 보여줍니다.</p>}
            <ul className="sheet-list">
              {[...pool].sort((a, b) => Number(assigned.has(a.id)) - Number(assigned.has(b.id))).map((p) => {
                const at = Object.keys(game.slots).find((k) => game.slots[k] === p.id)
                const atLabel = at ? slots.find((s) => s.key === at)?.label : undefined
                return (
                  <li key={p.id}>
                    <button
                      className={`sheet-item ${at === pickSlot.key ? 'current' : ''}`}
                      onClick={() => {
                        if (!attendeeIds.includes(p.id)) toggleAttendee(p.id)
                        updateGame({ ...game, slots: assignSlot(game.slots, pickSlot.key, p.id) })
                        setPickSlot(null)
                      }}
                    >
                      <span className="name">{p.name}</span>
                      <span className="year">{shortYear(p.birthYear)}</span>
                      {!p.needsReview && <span className={`pos pos-${p.mainPosition}`}>{POSITION_LABEL[p.mainPosition]}</span>}
                      {atLabel && <span className="muted small">{at === pickSlot.key ? '현재' : `${atLabel}에서 교대`}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

function PitchLines() {
  return (
    <svg className="pitch-lines" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden>
      <g fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.4">
        <rect x="0.5" y="0.5" width="67" height="104" />
        <line x1="0.5" y1="52.5" x2="67.5" y2="52.5" />
        <circle cx="34" cy="52.5" r="9.15" />
        <rect x="13.84" y="0.5" width="40.32" height="16.5" />
        <rect x="24.84" y="0.5" width="18.32" height="5.5" />
        <rect x="13.84" y="88" width="40.32" height="16.5" />
        <rect x="24.84" y="99" width="18.32" height="5.5" />
      </g>
    </svg>
  )
}
