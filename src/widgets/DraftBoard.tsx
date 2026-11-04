import { useMemo, useState } from 'react'
import type { Player, Position } from '../entities/player'
import { AGE_GROUPS, POSITIONS, POSITION_LABEL, UNKNOWN_AGE, ageGroupOf, shortYear, skillText } from '../entities/player'
import type { Roster, SeasonBundle } from '../entities/season'
import { availablePlayers, matchDates, nextPickNo, orderedTeams, rosters, shortDate, teamForPick } from '../entities/season'
import { finishDraft, makePick, reopenDraft, setDraftOrder, undoLastPick } from '../entities/season/api'
import { TEAM_COLORS } from '../features/build-teams'
import { shuffle } from '../shared/lib/rng'

interface Props {
  members: Player[]
  bundle: SeasonBundle
  showSkill: boolean
  onChanged: () => Promise<void>
}

type PosFilter = 'ALL' | Position
const ALL_AGE_GROUPS = [...AGE_GROUPS, UNKNOWN_AGE]

export function DraftBoard({ members, bundle, showSkill, onChanged }: Props) {
  const { season } = bundle
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<PosFilter>('ALL')
  const [age, setAge] = useState<string>('ALL')
  const [grouped, setGrouped] = useState(true)
  const [armed, setArmed] = useState<string | null>(null)

  const drafting = season.status === 'DRAFTING'
  const pickNo = nextPickNo(bundle.picks)
  const onClock = teamForPick(bundle, pickNo)
  const ordered = orderedTeams(season, bundle.teams)
  const available = useMemo(() => availablePlayers(members, bundle), [members, bundle])
  const teamRosters = rosters(members, bundle)
  const round = Math.floor((pickNo - 1) / 3) + 1
  const upcoming = [1, 2, 3].map((k) => teamForPick(bundle, pickNo + k).name.replace(/팀$/, ''))
  const filtered = available
    .filter((p) => (pos === 'ALL' ? true : p.mainPosition === pos || p.subPosition === pos))
    .filter((p) => (age === 'ALL' ? true : ageGroupOf(p).key === age))
    .filter((p) => p.name.includes(query.trim()))
    .sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999) || a.name.localeCompare(b.name))
  const ageCounts = Object.fromEntries(ALL_AGE_GROUPS.map((g) => [g.key, available.filter((p) => ageGroupOf(p).key === g.key).length]))
  const sections = grouped
    ? ALL_AGE_GROUPS.map((g) => ({ group: g, players: filtered.filter((p) => ageGroupOf(p).key === g.key) })).filter((x) => x.players.length)
    : [{ group: null, players: filtered }]

  const run = async (job: () => Promise<void>, done?: string) => {
    setBusy(true); setError('')
    try { await job(); await onChanged(); if (done) { setToast(done); setTimeout(() => setToast(''), 2500) } }
    catch (e) { setError((e as Error).message); await onChanged() }
    finally { setBusy(false) }
  }
  const confirmClick = (key: string, action: () => void) => {
    if (armed === key) { setArmed(null); action() }
    else { setArmed(key); setTimeout(() => setArmed((k) => (k === key ? null : k)), 3000) }
  }

  const pick = (p: Player) => run(() => makePick(season.id, p.id).then(() => undefined), `${onClock.name} ← ${p.name}`)
  const undo = () => run(() => undoLastPick(season.id, pickNo - 1), '마지막 지명을 취소했습니다.')
  const moveOrder = (idx: number, dir: -1 | 1) => {
    const ids = ordered.map((t) => t.id)
    const j = idx + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    void run(() => setDraftOrder(season.id, ids))
  }
  const drawOrder = () => run(() => setDraftOrder(season.id, shuffle(ordered.map((t) => t.id), Math.random)), '지명 순서를 추첨했습니다.')

  const copy = async () => {
    const text = draftText(season.name, matchDates(season), teamRosters)
    try { await navigator.clipboard.writeText(text); setToast('팀 명단을 복사했습니다.') }
    catch { setError('자동 복사가 안 되는 환경입니다.') }
    setTimeout(() => setToast(''), 2500)
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>{season.name} 드래프트 <span className={`status status-${season.status}`}>{drafting ? '지명 중' : '팀 확정'}</span></h2>
          <p className="muted">{matchDates(season).map(shortDate).join(' · ')} 경기 동안 유지</p>
        </div>
        <div className="row gap-s wrap">
          <button className="btn ghost" onClick={() => run(async () => {})} disabled={busy}>새로고침</button>
          <button className="btn ghost" onClick={copy}>팀 명단 복사</button>
          {drafting ? (
            <>
              <button className="btn" disabled={busy || pickNo === 1} onClick={() => confirmClick('undo', undo)}>
                {armed === 'undo' ? '정말 취소?' : '지명 되돌리기'}
              </button>
              <button className="btn primary" disabled={busy} onClick={() => confirmClick('finish', () => run(() => finishDraft(season.id), '팀을 확정했습니다.'))}>
                {armed === 'finish' ? (available.length ? `${available.length}명 남았는데 확정?` : '확정할까요?') : '드래프트 완료'}
              </button>
            </>
          ) : (
            <button className="btn ghost" disabled={busy} onClick={() => confirmClick('reopen', () => run(() => reopenDraft(season.id), '추가 지명을 열었습니다.'))}>
              {armed === 'reopen' ? '추가 지명 열기?' : '추가 지명(신입 등)'}
            </button>
          )}
        </div>
      </header>

      {toast && <p className="toast">{toast}</p>}
      {error && <p className="warn">{error}</p>}

      {drafting && pickNo === 1 && (
        <div className="order-box">
          <span className="muted small">1라운드 지명 순서 (이후 스네이크: 1→2→3→3→2→1…)</span>
          <div className="order-chips">
            {ordered.map((t, i) => (
              <span key={t.id} className="order-chip" style={{ ['--team' as string]: TEAM_COLORS[t.slot].hex }}>
                <button className="link" disabled={busy || i === 0} onClick={() => moveOrder(i, -1)} aria-label="앞으로">◀</button>
                <b>{i + 1}. {t.name}</b>
                <button className="link" disabled={busy || i === ordered.length - 1} onClick={() => moveOrder(i, 1)} aria-label="뒤로">▶</button>
              </span>
            ))}
            <button className="btn ghost" disabled={busy} onClick={drawOrder}>순서 추첨</button>
          </div>
        </div>
      )}

      {drafting && (
        <div className="on-clock" style={{ ['--team' as string]: TEAM_COLORS[onClock.slot].hex }}>
          <div>
            <span className="on-clock-label">지금 차례</span>
            <strong>{onClock.name}</strong>
            <span className="muted small">{round}라운드 · 전체 {pickNo}번째 지명</span>
          </div>
          <span className="muted small">다음: {upcoming.join(' → ')}</span>
        </div>
      )}

      <div className="teams">
        {teamRosters.map((r) => (
          <RosterCard key={r.team.id} roster={r} showSkill={showSkill} active={drafting && r.team.id === onClock.id} />
        ))}
      </div>

      {drafting && (
        <div className="pool">
          <div className="pool-head">
            <h3>지명 가능 <span className="muted">{available.length}명</span></h3>
            <div className="row gap-s wrap">
              <div className="seg">
                {(['ALL', ...POSITIONS] as PosFilter[]).map((p) => (
                  <button key={p} className={`seg-btn ${pos === p ? 'sel' : ''}`} onClick={() => setPos(p)}>
                    {p === 'ALL' ? '전체' : POSITION_LABEL[p]}
                  </button>
                ))}
              </div>
              <input className="search" placeholder="이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
          <div className="row gap-s wrap age-bar">
            <div className="seg">
              <button className={`seg-btn ${age === 'ALL' ? 'sel' : ''}`} onClick={() => setAge('ALL')}>전 연령</button>
              {ALL_AGE_GROUPS.filter((g) => ageCounts[g.key] > 0 || g !== UNKNOWN_AGE).map((g) => (
                <button key={g.key} className={`seg-btn ${age === g.key ? 'sel' : ''}`} onClick={() => setAge(g.key)}>
                  {g.label} <span className="muted">{ageCounts[g.key]}</span>
                </button>
              ))}
            </div>
            <label className="toggle"><input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> 나이대별로 묶기</label>
          </div>
          {filtered.length === 0 && available.length > 0 ? (
            <p className="muted empty">조건에 맞는 회원이 없습니다.</p>
          ) : available.length === 0 ? (
            <p className="muted empty">
              {members.length <= 6 ? '회원 명단을 먼저 등록하세요 (① 회원 관리 → CSV 불러오기).' : '모든 회원이 지명되었습니다. "드래프트 완료"를 눌러 팀을 확정하세요.'}
            </p>
          ) : (
            sections.map(({ group, players }) => (
            <div key={group?.key ?? 'all'} className="pool-section">
            {group && <h4 className="pool-group">{group.label} <span className="muted">{players.length}명</span></h4>}
            <ul className="pool-list">
              {players.map((p) => (
                <li key={p.id}>
                  <span className="year">{shortYear(p.birthYear)}</span>
                  <span className="name">{p.name}</span>
                  {!p.needsReview && <span className={`pos pos-${p.mainPosition}`}>{POSITION_LABEL[p.mainPosition]}</span>}
                  {!p.needsReview && p.subPosition && <span className={`pos pos-${p.subPosition} light`}>{POSITION_LABEL[p.subPosition]}</span>}
                  {showSkill && <span className="skill-num">{skillText(p)}</span>}
                  <button
                    className="btn pick-btn"
                    style={{ ['--team' as string]: TEAM_COLORS[onClock.slot].hex }}
                    disabled={busy}
                    onClick={() => pick(p)}
                  >
                    지명
                  </button>
                </li>
              ))}
            </ul>
            </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}

function RosterCard({ roster, showSkill, active }: { roster: Roster; showSkill: boolean; active: boolean }) {
  const { team, captain, vice, picks } = roster
  const players = [captain, vice, ...picks.map((p) => p.player)].filter(Boolean) as Player[]
  const rated = players.filter((p) => !p.needsReview)
  const avg = rated.length ? rated.reduce((s, p) => s + p.skill, 0) / rated.length : 0
  const posCount = (p: Position) => rated.filter((x) => x.mainPosition === p).length
  return (
    <article className={`team ${active ? 'team-active' : ''}`} style={{ ['--team' as string]: TEAM_COLORS[team.slot].hex }}>
      <header className="team-head">
        <h3>{team.name}</h3>
        <span className="team-meta">{players.length}명{showSkill && rated.length > 0 && <> · 평균 {avg.toFixed(1)}</>}</span>
      </header>
      <div className="pos-summary">
        {ALL_AGE_GROUPS.map((g) => {
          const n = players.filter((p) => ageGroupOf(p).key === g.key).length
          return n > 0 || g !== UNKNOWN_AGE ? <span key={g.key} className="age-chip">{g.label.replace('년생', '').replace(' 이후', '+')} {n}</span> : null
        })}
      </div>
      {rated.length > 0 && (
        <div className="pos-summary">
          {POSITIONS.map((p) => <span key={p} className={`pos pos-${p} light`}>{POSITION_LABEL[p]} {posCount(p)}</span>)}
        </div>
      )}
      <ul className="roster">
        {captain && <Row p={captain} badge="팀장" showSkill={showSkill} />}
        {vice && <Row p={vice} badge="부팀장" showSkill={showSkill} />}
        {picks.map(({ pickNo, player }) => <Row key={player.id} p={player} pickNo={pickNo} showSkill={showSkill} />)}
      </ul>
    </article>
  )
}

function Row({ p, badge, pickNo, showSkill }: { p: Player; badge?: string; pickNo?: number; showSkill: boolean }) {
  return (
    <li className={badge ? 'leader' : ''}>
      {badge ? <span className={`badge ${badge === '팀장' ? 'cap' : 'vice'}`}>{badge}</span> : <span className="pick-no">#{pickNo}</span>}
      <span className="name">{p.name} <span className="year">{shortYear(p.birthYear)}</span></span>
      {!p.needsReview && <span className={`pos pos-${p.mainPosition}`}>{POSITION_LABEL[p.mainPosition]}</span>}
      {showSkill && <span className="skill-num">{skillText(p)}</span>}
    </li>
  )
}

function draftText(seasonName: string, dates: string[], rs: Roster[]): string {
  const blocks = rs.map((r) => [
    `[${r.team.name}] ${2 + r.picks.length}명`,
    `팀장 ${r.captain?.name ?? '-'} / 부팀장 ${r.vice?.name ?? '-'}`,
    ...r.picks.map(({ player }, i) => `${i + 1}. ${player.name} (${shortYear(player.birthYear)}${player.needsReview ? '' : ` · ${POSITION_LABEL[player.mainPosition]}`})`),
  ].join('\n'))
  return [`⚽ CSFC ${seasonName} 팀 명단`, `경기: ${dates.map(shortDate).join(', ')}`, ...blocks].join('\n\n')
}
