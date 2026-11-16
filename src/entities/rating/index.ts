import { supabase } from '../../shared/api/supabase'

/**
 * 선수 지표(1~10) 6개 → 육각형 그래프, 지표 평균으로 등급.
 * 라커룸(packages/shared/ratings.ts)과 같은 규칙.
 */

export const RATING_KEYS = ['attack', 'technique', 'pass', 'defense', 'physical', 'speed'] as const
export type RatingKey = (typeof RATING_KEYS)[number]
export type Ratings = Partial<Record<RatingKey, number | null>>

export const RATING_LABEL: Record<RatingKey, string> = {
  attack: '공격', technique: '테크닉', pass: '패스', defense: '수비', physical: '피지컬', speed: '스피드',
}
export const RATING_MIN = 1
export const RATING_MAX = 10

export interface GradeStep { grade: string; min: number }
export const DEFAULT_GRADES: GradeStep[] = [
  { grade: 'S', min: 8.5 }, { grade: 'A', min: 7 }, { grade: 'B', min: 5.5 }, { grade: 'C', min: 4 }, { grade: 'D', min: 0 },
]

export function ratingAverage(r: Ratings | null | undefined): number | null {
  if (!r) return null
  const vals = RATING_KEYS.map((k) => r[k]).filter((v): v is number => typeof v === 'number')
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

export function normalizeGrades(steps: GradeStep[] | null | undefined): GradeStep[] {
  const valid = (steps ?? [])
    .map((s) => ({ grade: String(s.grade ?? '').trim().slice(0, 4), min: Number(s.min) }))
    .filter((s) => s.grade && Number.isFinite(s.min) && s.min >= 0 && s.min <= RATING_MAX)
  if (!valid.length) return DEFAULT_GRADES
  const sorted = [...valid].sort((a, b) => b.min - a.min)
  sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], min: 0 }
  return sorted
}

export function gradeOf(avg: number | null, steps: GradeStep[] = DEFAULT_GRADES): string | null {
  if (avg === null) return null
  for (const s of normalizeGrades(steps)) if (avg >= s.min) return s.grade
  return null
}

export function gradeRangesText(steps: GradeStep[] = DEFAULT_GRADES): string {
  const n = normalizeGrades(steps)
  return n.map((s, i) => {
    const upper = i === 0 ? null : Math.round((n[i - 1].min - 0.1) * 10) / 10
    return upper === null ? `${s.grade} ${s.min}~` : `${s.grade} ${s.min}~${upper}`
  }).join(' · ')
}

export const skillFromRatings = (r: Ratings | null | undefined): number | null => {
  const a = ratingAverage(r)
  return a === null ? null : Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(a)))
}

/** 등급을 고르면 넣을 대표 지표값: 그 등급 구간의 가운데 정수 (예: S 9 · A 8 · B 6 · C 5 · D 2) */
export function gradeValue(grade: string, steps: GradeStep[] = DEFAULT_GRADES): number | null {
  const n = normalizeGrades(steps)
  const i = n.findIndex((s) => s.grade === grade)
  if (i < 0) return null
  const lo = Math.max(RATING_MIN, n[i].min)
  const hi = i === 0 ? RATING_MAX : n[i - 1].min - 0.1
  const mid = Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round((lo + hi) / 2)))
  if (gradeOf(mid, n) === grade) return mid
  const up = Math.min(RATING_MAX, Math.ceil(lo))
  return gradeOf(up, n) === grade ? up : mid
}

/** 6개 지표를 같은 값으로 */
export const flatRatings = (v: number): Ratings => Object.fromEntries(RATING_KEYS.map((k) => [k, v])) as Ratings

// ── 공개 범위 ──
/** super: 슈퍼만 · admin: 운영진(기본) · leader_grade: 팀장은 등급만 · leader_all: 팀장도 지표까지 */
export type RatingVisibility = 'super' | 'admin' | 'leader_grade' | 'leader_all'
export const VISIBILITY_LABEL: Record<RatingVisibility, string> = {
  super: '슈퍼 관리자만', admin: '운영진', leader_grade: '팀장·부팀장은 등급만', leader_all: '팀장·부팀장도 지표까지',
}

export interface RatingSettings { visibility: RatingVisibility; grades: GradeStep[] }
export interface RatingAccess { see: boolean; edit: boolean; gradeOnly: boolean }

export function ratingAccess(v: { isAdmin: boolean; isSuper: boolean; isLeader: boolean }, vis: RatingVisibility): RatingAccess {
  const see = vis === 'super' ? v.isSuper : vis === 'leader_all' ? v.isAdmin || v.isLeader : v.isAdmin
  const edit = vis === 'super' ? v.isSuper : v.isAdmin
  return { see, edit, gradeOnly: !see && vis === 'leader_grade' && (v.isAdmin || v.isLeader) }
}

// ── API (테이블이 아직 없으면 null → 기능 숨김) ──

export async function fetchRatingSettings(): Promise<RatingSettings | null> {
  const { data, error } = await supabase.from('app_settings').select('key,value').in('key', ['rating_visibility', 'rating_grades'])
  if (error) return null
  const get = (k: string) => (data ?? []).find((r) => r.key === k)?.value
  return { visibility: (get('rating_visibility') as RatingVisibility) ?? 'admin', grades: normalizeGrades(get('rating_grades') as GradeStep[]) }
}

export async function saveRatingSettings(patch: Partial<RatingSettings>): Promise<void> {
  const rows = [
    ...(patch.visibility ? [{ key: 'rating_visibility', value: patch.visibility }] : []),
    ...(patch.grades ? [{ key: 'rating_grades', value: normalizeGrades(patch.grades) }] : []),
  ].map((r) => ({ ...r, updated_at: new Date().toISOString() }))
  const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' })
  if (error) throw error
}

export async function fetchRatings(): Promise<Map<string, Ratings>> {
  const { data, error } = await supabase.from('member_ratings').select(`member_id,${RATING_KEYS.join(',')}`)
  if (error) throw error
  return new Map((data ?? []).map((r) => {
    const row = r as unknown as Record<string, number | null> & { member_id: string }
    return [row.member_id, Object.fromEntries(RATING_KEYS.map((k) => [k, row[k] ?? null])) as Ratings]
  }))
}

export async function fetchGrades(): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('list_member_grades')
  if (error) throw error
  return new Map(((data ?? []) as { member_id: string; grade: string }[]).map((r) => [r.member_id, r.grade]))
}

export async function saveRatings(memberId: string, r: Ratings): Promise<void> {
  const row = Object.fromEntries(RATING_KEYS.map((k) => [k, r[k] ?? null]))
  const empty = RATING_KEYS.every((k) => r[k] == null)
  const { error } = empty
    ? await supabase.from('member_ratings').delete().eq('member_id', memberId)
    : await supabase.from('member_ratings').upsert({ member_id: memberId, ...row }, { onConflict: 'member_id' })
  if (error) throw error
}
