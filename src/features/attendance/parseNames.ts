/**
 * 카톡 투표 결과·단톡방 메시지 등 붙여넣은 글에서 회원 이름을 찾아 출석 명단으로 만든다.
 *
 * 처리하는 형식 예)
 *  - 줄바꿈·쉼표·슬래시·가운뎃점 구분: "김동인, 조인규 / 남상혁 · 이강재"
 *  - 번호·기호: "1. 김동인", "- 조인규", "@남상혁", "✅이동익"
 *  - 덧붙인 말: "김동인님", "조인규(91)", "남상혁 참석", "이강재91"
 *  - 이름 사이 띄어쓰기: "김 진" → 김진
 *  - "불참"이 들어간 줄의 이름은 제외
 *  - 카톡 투표 결과처럼 "불참 (2)" 같은 제목 줄 아래 이름들도 제외 (다시 "참석" 제목이 나오기 전까지)
 */

export interface NameMember {
  id: string
  name: string
}

export interface ParseResult {
  /** 찾은 회원 id (입력 순서, 중복 제거) */
  ids: string[]
  /** 이름처럼 보이지만 회원 목록에 없는 단어 (용병·오타 확인용) */
  unknown: string[]
  /** 불참 줄에서 찾은 회원 id */
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
])

const ABSENT_LINE = /불참|결석|못\s*가|못\s*감|빠짐|❌/

export function parseNames(text: string, members: NameMember[]): ParseResult {
  const byName = new Map<string, string>()
  for (const m of members) byName.set(norm(m.name), m.id)
  // 긴 이름부터 접두어 비교 (예: 김진수 → 김진보다 먼저)
  const names = [...byName.keys()].sort((a, b) => b.length - a.length)

  const ids: string[] = []
  const absentIds: string[] = []
  const unknown: string[] = []
  const add = (list: string[], id: string) => { if (!list.includes(id)) list.push(id) }

  let absentSection = false
  for (const rawLine of text.split(/\r?\n/)) {
    const words = rawLine.replace(/[^\p{Script=Hangul}A-Za-z\s]/gu, ' ').split(/\s+/).filter(Boolean)
    const isHeader = words.length > 0 && words.every((w) => STOP.has(w) || /^(불참|결석|참석|참가)/.test(w))
    if (isHeader) {
      if (ABSENT_LINE.test(rawLine)) absentSection = true
      else if (/참석|참가/.test(rawLine)) absentSection = false
      continue
    }
    const absent = absentSection || ABSENT_LINE.test(rawLine)
    const target = absent ? absentIds : ids
    // 구분 기호·번호·이모지 등을 공백으로
    const line = rawLine
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/^\s*\d+\s*[.)]/, ' ')
      .replace(/[^\p{Script=Hangul}A-Za-z0-9\s]/gu, ' ')
    const tokens = line.split(/\s+/).filter(Boolean)

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      // 1) 정확히 일치
      if (byName.has(t)) { add(target, byName.get(t)!); continue }
      // 2) 띄어 쓴 이름 (김 진, 이 대 근)
      let joined = t
      let matched = false
      for (let j = i + 1; j < Math.min(tokens.length, i + 3); j++) {
        joined += tokens[j]
        if (byName.has(joined)) { add(target, byName.get(joined)!); i = j; matched = true; break }
      }
      if (matched) continue
      // 3) 이름 + 덧붙인 말 (김동인님, 이강재91, 남상혁참석)
      const prefix = names.find((n) => t.startsWith(n) && SUFFIX.test(t.slice(n.length)))
      if (prefix) { add(target, byName.get(prefix)!); continue }
      // 4) 이름처럼 보이는 한글 2~4자 → 확인 필요 목록
      const hangul = t.replace(/\d+$/, '')
      if (!absent && /^\p{Script=Hangul}{2,4}$/u.test(hangul) && !STOP.has(hangul) && !/[ㄱ-ㅎㅏ-ㅣ]/.test(hangul)) {
        if (!unknown.includes(hangul)) unknown.push(hangul)
      }
    }
  }
  // 같은 사람이 참석·불참 줄에 모두 있으면 참석으로 본다
  return { ids, unknown, absentIds: absentIds.filter((id) => !ids.includes(id)) }
}
