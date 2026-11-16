import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Ratings, RatingAccess, RatingSettings } from './index'
import { fetchGrades, fetchRatingSettings, fetchRatings, gradeOf, ratingAccess, ratingAverage } from './index'
import { GradeBadge } from '../../shared/ui/RatingRadar'

export interface RatingState {
  /** DB에 지표 기능이 있는지 (SQL 적용 전이면 false → 화면에서 숨김) */
  available: boolean
  settings: RatingSettings | null
  access: RatingAccess
  ratings: Map<string, Ratings>
  grades: Map<string, string>
  reload: () => Promise<void>
  /** 저장 직후 화면 반영 */
  setOne: (memberId: string, r: Ratings) => void
}

const NONE: RatingAccess = { see: false, edit: false, gradeOnly: false }

export function useRatings(viewer: { isAdmin: boolean; isSuper: boolean; leaderTeams: unknown[] }): RatingState {
  const [settings, setSettings] = useState<RatingSettings | null>(null)
  const [ratings, setRatings] = useState<Map<string, Ratings>>(new Map())
  const [serverGrades, setServerGrades] = useState<Map<string, string>>(new Map())
  const isLeader = viewer.leaderTeams.length > 0
  const access = settings ? ratingAccess({ isAdmin: viewer.isAdmin, isSuper: viewer.isSuper, isLeader }, settings.visibility) : NONE

  const reload = useCallback(async () => {
    const s = await fetchRatingSettings()
    setSettings(s)
    if (!s) return
    const a = ratingAccess({ isAdmin: viewer.isAdmin, isSuper: viewer.isSuper, isLeader }, s.visibility)
    try {
      if (a.see) { setRatings(await fetchRatings()); setServerGrades(new Map()) }
      else if (a.gradeOnly) { setServerGrades(await fetchGrades()); setRatings(new Map()) }
      else { setRatings(new Map()); setServerGrades(new Map()) }
    } catch { /* 지표 없이 계속 */ }
  }, [viewer.isAdmin, viewer.isSuper, isLeader])
  useEffect(() => { void reload() }, [reload])

  const grades = useMemo(() => {
    if (serverGrades.size) return serverGrades
    const out = new Map<string, string>()
    for (const [id, r] of ratings) { const g = gradeOf(ratingAverage(r), settings?.grades); if (g) out.set(id, g) }
    return out
  }, [ratings, serverGrades, settings])

  const setOne = useCallback((id: string, r: Ratings) => setRatings((m) => new Map(m).set(id, r)), [])
  return { available: Boolean(settings), settings, access, ratings, grades, reload, setOne }
}

export const GradesContext = createContext<Map<string, string>>(new Map())

/** 볼 수 있을 때만 등급 배지 (드래프트·명단 등) */
export function MemberGrade({ id, size = 'xs' }: { id: string; size?: 'xs' | 'sm' }) {
  const grades = useContext(GradesContext)
  return <GradeBadge grade={grades.get(id)} size={size} />
}
