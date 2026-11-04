import { useEffect, useReducer } from 'react'
import type { MatchRole, Player } from '../entities/player'
import { SAMPLE_MEMBERS } from '../entities/player'
import type { Team } from '../features/build-teams'
import { loadJson, saveJson } from '../shared/lib/storage'

const STORAGE_KEY = 'csfc-team-maker:v1'

export interface AppState {
  members: Player[]
  /** 오늘 참석자 id */
  attendance: string[]
  /** 오늘 역할 (팀장/부주장) */
  roles: Record<string, MatchRole>
  matchTitle: string
  teams: Team[] | null
  showSkill: boolean
}

export type Action =
  | { type: 'member/add'; player: Player }
  | { type: 'member/update'; player: Player }
  | { type: 'member/remove'; id: string }
  | { type: 'member/replaceAll'; players: Player[] }
  | { type: 'member/append'; players: Player[] }
  | { type: 'attend/toggle'; id: string }
  | { type: 'attend/set'; ids: string[] }
  | { type: 'role/set'; id: string; role: MatchRole }
  | { type: 'role/reset' }
  | { type: 'match/title'; title: string }
  | { type: 'teams/set'; teams: Team[] | null }
  | { type: 'ui/showSkill'; value: boolean }

function defaultTitle(): string {
  const d = new Date()
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `CSFC ${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]}) 팀 편성`
}

const initial: AppState = {
  members: SAMPLE_MEMBERS,
  attendance: [],
  roles: {},
  matchTitle: defaultTitle(),
  teams: null,
  showSkill: true,
}

function withoutId(state: AppState, id: string): Pick<AppState, 'attendance' | 'roles'> {
  const roles = { ...state.roles }
  delete roles[id]
  return { attendance: state.attendance.filter((x) => x !== id), roles }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'member/add':
      return { ...state, members: [...state.members, action.player] }
    case 'member/update': {
      const members = state.members.map((m) => (m.id === action.player.id ? action.player : m))
      // 휴면 처리 시 오늘 참석에서도 제외
      const extra = action.player.status === 'INACTIVE' ? withoutId(state, action.player.id) : {}
      return { ...state, members, ...extra }
    }
    case 'member/remove':
      return { ...state, members: state.members.filter((m) => m.id !== action.id), ...withoutId(state, action.id), teams: null }
    case 'member/replaceAll':
      return { ...state, members: action.players, attendance: [], roles: {}, teams: null }
    case 'member/append':
      return { ...state, members: [...state.members, ...action.players] }
    case 'attend/toggle':
      return state.attendance.includes(action.id)
        ? { ...state, ...withoutId(state, action.id) }
        : { ...state, attendance: [...state.attendance, action.id] }
    case 'attend/set': {
      const roles = Object.fromEntries(Object.entries(state.roles).filter(([id]) => action.ids.includes(id)))
      return { ...state, attendance: action.ids, roles }
    }
    case 'role/set':
      return { ...state, roles: { ...state.roles, [action.id]: action.role } }
    case 'role/reset':
      return { ...state, roles: {} }
    case 'match/title':
      return { ...state, matchTitle: action.title }
    case 'teams/set':
      return { ...state, teams: action.teams }
    case 'ui/showSkill':
      return { ...state, showSkill: action.value }
  }
}

export function useAppStore() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ ...initial, ...loadJson<Partial<AppState>>(STORAGE_KEY, {}) }))
  useEffect(() => saveJson(STORAGE_KEY, state), [state])
  return [state, dispatch] as const
}
