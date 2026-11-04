import { useEffect, useReducer } from 'react'
import type { Player } from '../entities/player'
import { loadJson, saveJson } from '../shared/lib/storage'

// 회원·시즌·드래프트는 Supabase, 경기 당일 참석 체크·임시 이동은 기기별 localStorage(날짜별)
const STORAGE_KEY = 'csfc-team-maker:v3'

export interface DayDraft {
  attendance: string[]
  /** 그날만 다른 팀으로 뛰는 회원: memberId → slot */
  overrides: Record<string, number>
  title?: string
}

export interface AppState {
  members: Player[]
  days: Record<string, DayDraft>
  showSkill: boolean
}

export type Action =
  | { type: 'member/update'; player: Player }
  | { type: 'member/remove'; id: string }
  | { type: 'member/set'; players: Player[] }
  | { type: 'member/append'; players: Player[] }
  | { type: 'day/toggle'; date: string; id: string }
  | { type: 'day/setAttendance'; date: string; ids: string[] }
  | { type: 'day/override'; date: string; id: string; slot: number | null }
  | { type: 'day/title'; date: string; title: string }
  | { type: 'ui/showSkill'; value: boolean }

const emptyDay = (): DayDraft => ({ attendance: [], overrides: {} })

function patchDay(state: AppState, date: string, fn: (d: DayDraft) => DayDraft): AppState {
  return { ...state, days: { ...state.days, [date]: fn(state.days[date] ?? emptyDay()) } }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'member/update':
      return { ...state, members: state.members.map((m) => (m.id === action.player.id ? action.player : m)) }
    case 'member/remove':
      return { ...state, members: state.members.filter((m) => m.id !== action.id) }
    case 'member/set':
      return { ...state, members: action.players }
    case 'member/append': {
      const ids = new Set(action.players.map((p) => p.id))
      return { ...state, members: [...state.members.filter((m) => !ids.has(m.id)), ...action.players] }
    }
    case 'day/toggle':
      return patchDay(state, action.date, (d) => {
        if (!d.attendance.includes(action.id)) return { ...d, attendance: [...d.attendance, action.id] }
        const overrides = { ...d.overrides }
        delete overrides[action.id]
        return { ...d, attendance: d.attendance.filter((x) => x !== action.id), overrides }
      })
    case 'day/setAttendance':
      return patchDay(state, action.date, (d) => ({ ...d, attendance: action.ids }))
    case 'day/override':
      return patchDay(state, action.date, (d) => {
        const overrides = { ...d.overrides }
        if (action.slot === null) delete overrides[action.id]
        else overrides[action.id] = action.slot
        return { ...d, overrides }
      })
    case 'day/title':
      return patchDay(state, action.date, (d) => ({ ...d, title: action.title }))
    case 'ui/showSkill':
      return { ...state, showSkill: action.value }
  }
}

export function useAppStore() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    days: {},
    showSkill: true,
    ...loadJson<Partial<AppState>>(STORAGE_KEY, {}),
    members: [],
  }))
  useEffect(() => {
    saveJson(STORAGE_KEY, { days: state.days, showSkill: state.showSkill })
  }, [state.days, state.showSkill])
  return [state, dispatch] as const
}
