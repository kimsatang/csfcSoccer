import type { Player } from './model'

export interface AgeGroup {
  key: string
  label: string
  min: number
  max: number
}

/**
 * 드래프트 나이대 그룹. 현재 명단 기준(지명 대상 46명) 9 / 12 / 16 / 9명으로 나뉘도록 설정.
 * 인원 분포가 바뀌면 이 배열만 수정하면 된다.
 */
export const AGE_GROUPS: AgeGroup[] = [
  { key: '70s', label: '70년대생', min: 0, max: 1979 },
  { key: '80-84', label: '80~84년생', min: 1980, max: 1984 },
  { key: '85-87', label: '85~87년생', min: 1985, max: 1987 },
  { key: '88+', label: '88년생 이후', min: 1988, max: 9999 },
]

export const UNKNOWN_AGE: AgeGroup = { key: 'unknown', label: '년생 미입력', min: -1, max: -1 }

export function ageGroupOf(p: Pick<Player, 'birthYear'>): AgeGroup {
  if (!p.birthYear) return UNKNOWN_AGE
  return AGE_GROUPS.find((g) => p.birthYear! >= g.min && p.birthYear! <= g.max) ?? UNKNOWN_AGE
}

/** 1987 → "87" */
export function shortYear(y?: number): string {
  return y ? String(y).slice(2) : '-'
}

/** "87", "1987", "05" 등을 4자리 년도로 (두 자리는 30 이상이면 19xx, 미만이면 20xx) */
export function parseBirthYear(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const digits = raw.replace(/[^0-9]/g, '')
  if (!digits) return undefined
  const n = Number(digits)
  if (digits.length <= 2) return n >= 30 ? 1900 + n : 2000 + n
  return n >= 1940 && n <= 2020 ? n : undefined
}

/** 실력이 아직 확인되지 않은 회원은 숫자 대신 '-' */
export function skillText(p: Pick<Player, 'skill' | 'needsReview'>): string {
  return p.needsReview ? '-' : String(p.skill)
}
