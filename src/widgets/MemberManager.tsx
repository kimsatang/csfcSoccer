import { useState } from 'react'
import type { Dispatch } from 'react'
import type { Action } from '../app/store'
import type { AttendanceLevel, Player, Position } from '../entities/player'
import {
  ATTENDANCE_LABEL, ATTENDANCE_LEVELS, CSV_TEMPLATE, POSITIONS, POSITION_LABEL, SAMPLE_MEMBERS, SKILL_MAX, SKILL_MIN,
  clampSkill, membersToCsv, parseBirthYear, parseMembersCsv, shortYear,
} from '../entities/player'
import { deleteMember, insertMembers, updateMember, upsertMembersByName } from '../entities/player/api'

interface Props {
  members: Player[]
  dispatch: Dispatch<Action>
  onReload: () => void
}

type Draft = Omit<Player, 'id'> & { id?: string }

const emptyDraft = (): Draft => ({ name: '', mainPosition: 'MF', skill: 5, status: 'ACTIVE' })
const stripId = ({ id: _id, ...rest }: Player): Omit<Player, 'id'> => { void _id; return rest }

export function MemberManager({ members, dispatch, onReload }: Props) {
  const [draft, setDraftState] = useState<Draft>(emptyDraft)
  const [yearText, setYearText] = useState('')
  /** 폼 내용 교체(수정 시작·초기화) 시 년생 입력칸도 함께 맞춤 */
  const setDraft = (d: Draft) => { setDraftState(d); setYearText(d.birthYear ? shortYear(d.birthYear) : '') }
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [csvMsg, setCsvMsg] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [onlyMissing, setOnlyMissing] = useState(false)
  // 네이티브 confirm 대신 2단계 클릭 확인 (모바일·임베드 환경 호환)
  const [armed, setArmed] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const confirmClick = (key: string, action: () => void) => {
    if (armed === key) { setArmed(null); action() }
    else { setArmed(key); setTimeout(() => setArmed((k) => (k === key ? null : k)), 3000) }
  }
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  /** DB 호출 공통 처리: 진행 표시 + 에러 메시지 */
  const run = async (job: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await job() }
    catch (e) { setError(`저장 실패: ${(e as Error).message}`) }
    finally { setBusy(false) }
  }

  const save = () => run(async () => {
    if (!draft.name.trim()) return
    // 폼으로 저장하면 운영진이 확인한 것으로 보고 '미입력' 표시를 해제
    const body = { ...draft, name: draft.name.trim(), skill: clampSkill(draft.skill), needsReview: false, positionReview: false }
    if (draft.id) {
      dispatch({ type: 'member/update', player: await updateMember({ ...body, id: draft.id }) })
      flash(`${body.name} 수정됨`)
    } else {
      const { id: _id, ...rest } = body; void _id
      dispatch({ type: 'member/append', players: await insertMembers([rest]) })
      flash(`${body.name} 추가됨`)
    }
    setDraft(emptyDraft())
  })

  const toggleStatus = (m: Player) => run(async () => {
    dispatch({ type: 'member/update', player: await updateMember({ ...m, status: m.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) })
  })

  /**
   * 표에서 바로 수정 (빠른 입력). 화면 먼저 바꾸고 저장 — 실패하면 되돌림.
   * 포지션을 고르면 '포지션 미입력', 실력을 고르면 '실력 미입력' 표시가 해제된다.
   */
  const quickUpdate = (m: Player, patch: Partial<Player>) => {
    const next = { ...m, ...patch }
    dispatch({ type: 'member/update', player: next })
    setSavingIds((s) => new Set(s).add(m.id))
    updateMember(next)
      .then((saved) => dispatch({ type: 'member/update', player: saved }))
      .catch((e) => { dispatch({ type: 'member/update', player: m }); setError(`${m.name} 저장 실패: ${(e as Error).message}`) })
      .finally(() => setSavingIds((s) => { const n = new Set(s); n.delete(m.id); return n }))
  }
  const setAttendance = (m: Player, level: AttendanceLevel | undefined) => quickUpdate(m, { attendanceLevel: level })

  const remove = (m: Player) => run(async () => {
    await deleteMember(m.id)
    dispatch({ type: 'member/remove', id: m.id })
    flash(`${m.name} 삭제됨`)
  })

  const importCsv = () => run(async () => {
    const { players, errors } = parseMembersCsv(csvText)
    let summary = '0명 등록'
    if (players.length) {
      const { inserted, updated } = await upsertMembersByName(players.map(stripId), members)
      dispatch({ type: 'member/append', players: [...updated, ...inserted] })
      summary = `신규 ${inserted.length}명 등록 · 기존 ${updated.length}명 갱신`
    }
    setCsvMsg([summary, ...errors])
    if (!errors.length) { setCsvText(''); setCsvOpen(false) }
  })

  const addSamples = () => run(async () => {
    dispatch({ type: 'member/append', players: await insertMembers(SAMPLE_MEMBERS.map(stripId)) })
    flash('샘플 회원 24명을 넣었습니다.')
  })

  const copyCsv = async () => {
    try { await navigator.clipboard.writeText(membersToCsv(members)); flash('CSV를 클립보드에 복사했습니다.') }
    catch { setCsvText(membersToCsv(members)); setCsvOpen(true) }
  }

  const filtered = members
    .filter((m) => m.name.includes(query.trim()))
    .filter((m) => !onlyMissing || m.needsReview || m.positionReview || !m.attendanceLevel)
  const activeCount = members.filter((m) => m.status === 'ACTIVE').length
  const reviewCount = members.filter((m) => m.needsReview || m.positionReview).length
  const noAttCount = members.filter((m) => m.status === 'ACTIVE' && !m.attendanceLevel).length

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>회원 관리</h2>
          <p className="muted">전체 {members.length}명 · 활동 {activeCount}명
            {noAttCount > 0 && <> · <span className="review-chip">참석률 미입력 {noAttCount}명</span></>}
            {reviewCount > 0 && <> · <span className="review-chip">포지션·실력 미입력 {reviewCount}명</span></>}
            {busy && ' · 저장 중…'}</p>
        </div>
        <div className="row gap-s wrap">
          <button className="btn ghost" onClick={() => setCsvOpen((v) => !v)}>CSV 불러오기</button>
          <button className="btn ghost" onClick={copyCsv} disabled={!members.length}>CSV 내보내기</button>
          <button className="btn ghost" onClick={onReload}>새로고침</button>
          {members.length === 0 && (
            <button className="btn ghost" disabled={busy} onClick={() => confirmClick('sample', addSamples)}>
              {armed === 'sample' ? '샘플 24명 넣기?' : '샘플 데이터'}
            </button>
          )}
        </div>
      </header>

      {toast && <p className="toast">{toast}</p>}
      {error && <p className="warn">{error}</p>}

      {csvOpen && (
        <div className="csv-box">
          <p className="muted small">엑셀에서 복사해 붙여넣거나 CSV를 입력하세요. 필수 컬럼: <b>이름, 주포지션, 실력</b> · 같은 이름이 있으면 정보를 갱신하고, 없으면 새로 추가합니다.</p>
          <textarea rows={6} value={csvText} placeholder={CSV_TEMPLATE} onChange={(e) => setCsvText(e.target.value)} />
          <div className="row gap-s">
            <button className="btn" onClick={importCsv} disabled={!csvText.trim() || busy}>등록</button>
            <button className="btn ghost" onClick={() => setCsvText(CSV_TEMPLATE)}>양식 넣기</button>
          </div>
          {csvMsg.length > 0 && <ul className="msg-list">{csvMsg.map((m) => <li key={m}>{m}</li>)}</ul>}
        </div>
      )}

      <form className="member-form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <input placeholder="이름" value={draft.name} onChange={(e) => setDraftState({ ...draft, name: e.target.value })} required />
        <input
          placeholder="년생" className="w-num" inputMode="numeric"
          value={yearText}
          maxLength={4}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9]/g, '')
            setYearText(v)
            setDraftState({ ...draft, birthYear: v.length === 2 || v.length === 4 ? parseBirthYear(v) : undefined })
          }}
        />
        <input placeholder="번호" type="number" className="w-num" value={draft.backNumber ?? ''} onChange={(e) => setDraftState({ ...draft, backNumber: e.target.value ? Number(e.target.value) : undefined })} />
        <label className="field">주
          <select value={draft.mainPosition} onChange={(e) => setDraftState({ ...draft, mainPosition: e.target.value as Position })}>
            {POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
          </select>
        </label>
        <label className="field">부
          <select value={draft.subPosition ?? ''} onChange={(e) => setDraftState({ ...draft, subPosition: (e.target.value || undefined) as Position | undefined })}>
            <option value="">없음</option>
            {POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
          </select>
        </label>
        <label className="field">실력 <b className="skill-val">{draft.skill}</b>
          <input type="range" min={SKILL_MIN} max={SKILL_MAX} value={draft.skill} onChange={(e) => setDraftState({ ...draft, skill: Number(e.target.value) })} />
        </label>
        <label className="field">참석률
          <select value={draft.attendanceLevel ?? ''} onChange={(e) => setDraftState({ ...draft, attendanceLevel: (e.target.value || undefined) as AttendanceLevel | undefined })}>
            <option value="">미입력</option>
            {ATTENDANCE_LEVELS.map((l) => <option key={l} value={l}>{ATTENDANCE_LABEL[l]}</option>)}
          </select>
        </label>
        <input placeholder="메모" value={draft.memo ?? ''} onChange={(e) => setDraftState({ ...draft, memo: e.target.value || undefined })} />
        <button className="btn primary" type="submit" disabled={busy}>{draft.id ? '수정 저장' : '회원 추가'}</button>
        {draft.id && <button className="btn ghost" type="button" onClick={() => setDraft(emptyDraft())}>취소</button>}
      </form>

      <div className="row gap-s wrap quick-bar">
        <input className="search" placeholder="이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="toggle"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> 미입력 있는 회원만 ({members.filter((m) => m.needsReview || m.positionReview || !m.attendanceLevel).length})</label>
        <span className="muted small">표에서 바로 고르면 자동 저장됩니다.</span>
      </div>

      <div className="table-wrap">
        <table className="members">
          <thead>
            <tr><th>년생</th><th>번호</th><th>이름</th><th>주포지션</th><th>부포지션</th><th>실력</th><th>참석률</th><th>상태</th><th>메모</th><th /></tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className={m.status === 'INACTIVE' ? 'inactive' : ''}>
                <td>{shortYear(m.birthYear)}</td>
                <td className="muted">{m.backNumber ?? '-'}</td>
                <td><b>{m.name}</b></td>
                <td>
                  <select
                    className={`q-select ${m.positionReview ? 'q-missing' : `q-pos-${m.mainPosition}`}`}
                    aria-label={`${m.name} 주포지션`}
                    value={m.positionReview ? '' : m.mainPosition}
                    onChange={(e) => e.target.value && quickUpdate(m, { mainPosition: e.target.value as Position, positionReview: false })}
                  >
                    {m.positionReview && <option value="">미입력</option>}
                    {POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
                  </select>
                </td>
                <td>
                  <select
                    className="q-select"
                    aria-label={`${m.name} 부포지션`}
                    value={m.subPosition ?? ''}
                    onChange={(e) => quickUpdate(m, { subPosition: (e.target.value || undefined) as Position | undefined })}
                  >
                    <option value="">-</option>
                    {POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
                  </select>
                </td>
                <td>
                  <select
                    className={`q-select q-skill ${m.needsReview ? 'q-missing' : ''}`}
                    aria-label={`${m.name} 실력`}
                    value={m.needsReview ? '' : String(m.skill)}
                    onChange={(e) => e.target.value && quickUpdate(m, { skill: Number(e.target.value), needsReview: false })}
                  >
                    {m.needsReview && <option value="">미입력</option>}
                    {Array.from({ length: SKILL_MAX - SKILL_MIN + 1 }, (_, i) => SKILL_MAX - i).map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  {savingIds.has(m.id) && <span className="muted small"> 저장…</span>}
                </td>
                <td>
                  <select
                    className={`att-select att-${m.attendanceLevel ?? 'none'}`}
                    aria-label={`${m.name} 참석률`}
                    value={m.attendanceLevel ?? ''}
                    disabled={busy}
                    onChange={(e) => setAttendance(m, (e.target.value || undefined) as AttendanceLevel | undefined)}
                  >
                    <option value="">-</option>
                    {ATTENDANCE_LEVELS.map((l) => <option key={l} value={l}>{ATTENDANCE_LABEL[l]}</option>)}
                  </select>
                </td>
                <td>
                  <button className="link" disabled={busy} onClick={() => toggleStatus(m)}>
                    {m.status === 'ACTIVE' ? '활동' : '휴면'}
                  </button>
                </td>
                <td className="muted small">{m.memo}</td>
                <td className="actions">
                  <button className="link" onClick={() => { setDraft(m); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>수정</button>
                  <button
                    className="link danger"
                    disabled={busy}
                    title="삭제하면 지난 경기 기록에서도 빠집니다. 기록을 남기려면 휴면 처리하세요."
                    onClick={() => confirmClick(`del:${m.id}`, () => remove(m))}
                  >
                    {armed === `del:${m.id}` ? '삭제 확인' : '삭제'}
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr><td colSpan={10} className="muted empty">아직 등록된 회원이 없습니다. 위에서 추가하거나 CSV로 불러오세요.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function SkillBar({ value }: { value: number }) {
  return (
    <span className="skillbar" title={`실력 ${value}`}>
      <span className="skillbar-fill" style={{ width: `${value * 10}%` }} />
      <span className="skillbar-num">{value}</span>
    </span>
  )
}
