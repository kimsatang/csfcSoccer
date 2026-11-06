/**
 * 카톡 투표 결과·단톡방 메시지·스크린샷 글자 인식(OCR) 결과에서 회원 이름을 찾아 출석 명단으로 만든다.
 *
 * 처리하는 형식 예)
 *  - 줄바꿈·쉼표·슬래시·가운뎃점 구분: "김동인, 조인규 / 남상혁 · 이강재"
 *  - 번호·기호: "1. 김동인", "- 조인규", "@남상혁", "✅이동익"
 *  - 덧붙인 말: "김동인님", "조인규(91)", "남상혁 참석", "이강재91", "정태호하남"(지역이 붙음)
 *  - 이름 사이 띄어쓰기: "김 진" → 김진
 *  - 카톡 닉네임 "77 이성흠 하남_…": 앞의 두 자리 숫자를 년생으로 보고 동명이인·오타 판별에 사용
 *  - 투표 항목 제목 "1일 일요일 18시 ~ 20시 축구 : 15명" → 항목(섹션) 구분 + 투표 인원
 *  - "불참"이 들어간 줄, "불참 (2)" 제목 아래 이름은 제외
 *  - 글자 인식 오타 한 글자(운명훈 → 윤명훈): 년생이 맞으면 자동 보정, 아니면 제안만
 */

export interface NameMember {
  id: string
  name: string
  birthYear?: number | null
}

export interface Ambiguous {
  /** 글에 적힌 이름 */
  token: string
  /** 같은 이름의 회원 id들 */
  candidates: string[]
}

export interface Fix {
  /** 글에 적힌(인식된) 이름 */
  token: string
  memberId: string
}

export interface Section {
  /** 투표 항목 제목 (없으면 '') */
  title: string
  /** 제목에 적힌 투표 인원 (예: 15명) */
  declared?: number
  /** 확정된 회원 id (자동 보정 포함, 입력 순서) */
  ids: string[]
  /** 오타를 년생으로 확인해 자동 보정한 것 (ids에 포함됨) */
  corrected: Fix[]
  /** 동명이인 — 고르기 필요 */
  ambiguous: Ambiguous[]
  /** 한 글자 차이 — 확인 후 체크 */
  suggestions: Fix[]
  /** 회원 목록에 없는 이름 */
  unknown: string[]
}

export interface ParseResult {
  sections: Section[]
  /** 모든 항목의 확정 회원 (중복 제거) */
  ids: string[]
  /** 모든 항목의 못 찾은 이름 */
  unknown: string[]
  /** 불참으로 본 회원 */
  absentIds: string[]
}

const norm = (s: string) => s.replace(/\s+/g, '')

/** 이름 뒤에 붙어도 이름으로 인정하는 말 */
const SUFFIX = /^(님|형|씨|참|참석|ㅇ|o|O|\d{1,4})?$/

/** 이름 후보에서 빼는 흔한 단어 */
const STOP = new Set([
  '참석', '불참', '미정', '명단', '경기', '출석', '투표', '결과', '인원', '총', '명', '오늘', '내일', '월요일', '화요일',
  '수요일', '목요일', '금요일', '토요일', '일요일', '참가', '용병', '게스트', '늦참', '지각', '조퇴', '선착순', '대기',
  '팀장', '부팀장', '감독', '코치', '회비', '입금', '완료', '확인', '가능', '불가', '시간', '장소', '구장', '오전', '오후',
  '선택', '주차', '정기전', '축구', '풋살', '연습', '친선', '자체전', '시합',
])

const ABSENT_LINE = /불참|결석|못\s*가|못\s*감|빠짐|❌/
const COUNT = /(\d{1,3})\s*명|\((\d{1,3})\)/
const isHangulWord = (s: string) => /^\p{Script=Hangul}+$/u.test(s) && !/[ㄱ-ㅎㅏ-ㅣ]/.test(s)

/** 글자 단위 편집 거리 (최대 2까지만 의미 있음) */
function distance(a: string, b: string): number {
  const A = [...a]
  const B = [...b]
  if (Math.abs(A.length - B.length) > 1) return 9
  const dp = Array.from({ length: A.length + 1 }, (_, i) => [i, ...Array(B.length).fill(0)])
  for (let j = 1; j <= B.length; j++) dp[0][j] = j
  for (let i = 1; i <= A.length; i++)
    for (let j = 1; j <= B.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1))
  return dp[A.length][B.length]
}

const yearMatches = (m: NameMember | undefined, yy?: number) => yy !== undefined && !!m?.birthYear && m.birthYear % 100 === yy

export function parseNames(text: string, members: NameMember[]): ParseResult {
  const byId = new Map(members.map((m) => [m.id, m]))
  const byName = new Map<string, string[]>()
  for (const m of members) {
    const k = norm(m.name)
    byName.set(k, [...(byName.get(k) ?? []), m.id])
  }
  // 긴 이름부터 접두어 비교 (예: 김진수 → 김진보다 먼저)
  const names = [...byName.keys()].sort((a, b) => b.length - a.length)

  const lines = text.split(/\r?\n/)
  // 카톡 닉네임 형식("77 이성흠 하남")이 많으면, 년생 숫자 바로 뒤 단어만 이름 후보로 본다 (프로필 사진 글자·지역명 잡음 제거)
  const nicknameMode = (text.match(/(^|\s)\d{2}\s+\p{Script=Hangul}{2,4}/gmu) ?? []).length >= 3

  const sections: Section[] = []
  const newSection = (title: string, declared?: number): Section => {
    const s: Section = { title, declared, ids: [], corrected: [], ambiguous: [], suggestions: [], unknown: [] }
    sections.push(s)
    return s
  }
  let current: Section | null = null
  const absentIds: string[] = []
  let absentSection = false
  const push = <T>(list: T[], v: T, key: (x: T) => string = (x) => String(x)) => {
    if (!list.some((x) => key(x) === key(v))) list.push(v)
  }

  /** 이름 후보 하나를 판정 */
  type Verdict =
    | { kind: 'id'; id: string; fixedFrom?: string }
    | { kind: 'ambiguous'; candidates: string[] }
    | { kind: 'suggest'; id: string }
    | { kind: 'none' }
  const pick = (ids: string[], yy?: number): Verdict => {
    if (ids.length === 1) return { kind: 'id', id: ids[0] }
    const byYear = ids.filter((id) => yearMatches(byId.get(id), yy))
    return byYear.length === 1 ? { kind: 'id', id: byYear[0] } : { kind: 'ambiguous', candidates: ids }
  }
  const fuzzy = (t: string, yy?: number): Verdict => {
    const core = t.replace(/\d+$/, '')
    if (!isHangulWord(core) || [...core].length < 3 || STOP.has(core)) return { kind: 'none' }
    // 지역이 붙은 경우(주성일하남)까지 고려해 앞 3·4글자도 비교
    const variants = [core, [...core].slice(0, 3).join(''), [...core].slice(0, 4).join('')]
    const cands = new Set<string>()
    for (const v of variants)
      for (const [n, ids] of byName) if ([...n].length >= 3 && distance(v, n) === 1) ids.forEach((id) => cands.add(id))
    const list = [...cands]
    if (!list.length) return { kind: 'none' }
    const byYear = list.filter((id) => yearMatches(byId.get(id), yy))
    if (byYear.length === 1) return { kind: 'id', id: byYear[0], fixedFrom: core }
    return list.length === 1 ? { kind: 'suggest', id: list[0] } : { kind: 'none' }
  }

  for (const rawLine of lines) {
    const words = rawLine.replace(/[^\p{Script=Hangul}A-Za-z\s]/gu, ' ').split(/\s+/).filter(Boolean)
    const hasName = words.some((w) => names.some((n) => norm(w).startsWith(n)))
    const count = rawLine.match(COUNT)
    const onlyHeaderWords = words.length > 0 && words.every((w) => STOP.has(w) || /^(불참|결석|참석|참가)/.test(w))

    // 제목 줄: "불참 (2)", "참석 (8)", "1일 일요일 18시 ~ 20시 축구 : 15명"
    if (onlyHeaderWords || (count && !hasName)) {
      if (ABSENT_LINE.test(rawLine)) { absentSection = true; continue }
      absentSection = false
      const declared = count ? Number(count[1] ?? count[2]) : undefined
      const title = rawLine.replace(COUNT, '').replace(/[:：\s]+$/, '').trim()
      // "총 15명" 같은 합계 줄은 바로 위 항목의 인원으로
      if (current && declared !== undefined && current.declared === undefined && /^(총|합계|전체|인원|참석\s*인원)?[:：\s]*$/.test(title)) {
        current.declared = declared
        continue
      }
      current = newSection(title, declared)
      continue
    }

    const absent = absentSection || ABSENT_LINE.test(rawLine)
    const sec = current ?? (current = newSection(''))
    const line = rawLine
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/^\s*\d+\s*[.)]\s/, ' ')
      .replace(/[^\p{Script=Hangul}A-Za-z0-9\s]/gu, ' ')
    const tokens = line.split(/\s+/).filter(Boolean)

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (/^\d+$/.test(t)) continue
      const prev = tokens[i - 1]
      const yy = prev && /^\d{2}$/.test(prev) ? Number(prev) : undefined
      const nameSlot = !nicknameMode || yy !== undefined

      let v: Verdict = { kind: 'none' }
      let consumed = i
      // 1) 정확히 일치
      if (byName.has(t)) v = pick(byName.get(t)!, yy)
      // 2) 띄어 쓴 이름 (김 진, 이 대 근)
      if (v.kind === 'none') {
        let joined = t
        for (let j = i + 1; j < Math.min(tokens.length, i + 3); j++) {
          joined += tokens[j]
          if (byName.has(joined)) { v = pick(byName.get(joined)!, yy); consumed = j; break }
        }
      }
      // 3) 이름 + 덧붙인 말 (김동인님, 이강재91, 정태호하남)
      if (v.kind === 'none') {
        const prefix = names.find((n) => {
          if (!t.startsWith(n)) return false
          const rest = t.slice(n.length)
          return SUFFIX.test(rest) || (/^\p{Script=Hangul}{2,}/u.test(rest) && [...n].length >= 2)
        })
        if (prefix) v = pick(byName.get(prefix)!, yy)
      }
      // 4) 한 글자 오타 (이름 자리로 보이는 단어만)
      if (v.kind === 'none' && nameSlot) v = fuzzy(t, yy)
      i = consumed

      if (absent) {
        if (v.kind === 'id') push(absentIds, v.id)
        continue
      }
      if (v.kind === 'id') {
        push(sec.ids, v.id)
        if (v.fixedFrom) push(sec.corrected, { token: v.fixedFrom, memberId: v.id }, (x) => x.token)
      } else if (v.kind === 'ambiguous') {
        push(sec.ambiguous, { token: t, candidates: v.candidates }, (x) => x.token + x.candidates.join())
      } else if (v.kind === 'suggest') {
        push(sec.suggestions, { token: t.replace(/\d+$/, ''), memberId: v.id }, (x) => x.token)
      } else if (nameSlot) {
        // 5) 이름처럼 보이는 한글 2~4자 → 못 찾은 이름
        const hangul = t.replace(/\d+$/, '')
        if (isHangulWord(hangul) && [...hangul].length >= 2 && [...hangul].length <= 4 && !STOP.has(hangul)) push(sec.unknown, hangul)
      }
    }
  }

  return finalize(sections, absentIds)
}

/** 확정된 회원은 다른 목록(제안·동명이인·불참)에서 정리 */
function finalize(sectionsIn: Section[], absentIn: string[]): ParseResult {
  const sections = sectionsIn.filter((s) => s.ids.length || s.ambiguous.length || s.suggestions.length || s.unknown.length || s.declared !== undefined || s.title)
  for (const s of sections) {
    s.suggestions = s.suggestions.filter((x) => !s.ids.includes(x.memberId))
    s.ambiguous = s.ambiguous.filter((a) => !a.candidates.some((id) => s.ids.includes(id)))
  }
  const ids = [...new Set(sections.flatMap((s) => s.ids))]
  const unknown = [...new Set(sections.flatMap((s) => s.unknown))]
  // 같은 사람이 참석·불참 줄에 모두 있으면 참석으로 본다
  return { sections, ids, unknown, absentIds: [...new Set(absentIn)].filter((id) => !ids.includes(id)) }
}

/**
 * 같은 이미지를 여러 방식으로 글자 인식한 결과를 합친다 (항목 순서 기준).
 * 한쪽에서 놓친 이름을 다른 쪽이 잡아 주므로 인식률이 올라간다.
 */
export function mergeResults(results: ParseResult[]): ParseResult {
  if (results.length <= 1) return results[0] ?? { sections: [], ids: [], unknown: [], absentIds: [] }
  const n = Math.max(...results.map((r) => r.sections.length))
  const sections: Section[] = []
  for (let i = 0; i < n; i++) {
    const parts = results.map((r) => r.sections[i]).filter((s): s is Section => !!s)
    const base = parts[0]
    const s: Section = {
      title: parts.find((p) => p.declared !== undefined)?.title ?? base.title,
      declared: parts.find((p) => p.declared !== undefined)?.declared,
      ids: [...new Set(parts.flatMap((p) => p.ids))],
      corrected: parts.flatMap((p) => p.corrected).filter((c, k, arr) => arr.findIndex((x) => x.memberId === c.memberId) === k),
      ambiguous: parts.flatMap((p) => p.ambiguous).filter((a, k, arr) => arr.findIndex((x) => x.token === a.token) === k),
      suggestions: parts.flatMap((p) => p.suggestions).filter((a, k, arr) => arr.findIndex((x) => x.memberId === a.memberId) === k),
      unknown: [...new Set(parts.flatMap((p) => p.unknown))],
    }
    sections.push(s)
  }
  // 한쪽에서 보정·확정된 이름은 못 찾은 목록에서 뺀다
  const fixedTokens = new Set(sections.flatMap((s) => s.corrected.map((c) => c.token)))
  for (const s of sections) s.unknown = s.unknown.filter((u) => !fixedTokens.has(u))
  return finalize(sections, results.flatMap((r) => r.absentIds))
}
