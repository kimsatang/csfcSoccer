/** 포지션: 골키퍼 / 수비 / 미드필더 / 공격 */
export type Position = 'GK' | 'DF' | 'MF' | 'FW'

export const POSITIONS: Position[] = ['GK', 'DF', 'MF', 'FW']

export const POSITION_LABEL: Record<Position, string> = {
  GK: '골키퍼',
  DF: '수비',
  MF: '미드',
  FW: '공격',
}

/** 회원 상태: 활동 / 휴면(목록에는 남지만 참석 체크 대상에서 제외) */
export type MemberStatus = 'ACTIVE' | 'INACTIVE'

/** 경기 당일 역할 */
/** 참석률 등급 (운영진 판단) */
export type AttendanceLevel = 'HIGH' | 'MID' | 'LOW'

export const ATTENDANCE_LEVELS: AttendanceLevel[] = ['HIGH', 'MID', 'LOW']

export const ATTENDANCE_LABEL: Record<AttendanceLevel, string> = {
  HIGH: '높음',
  MID: '중간',
  LOW: '낮음',
}

export type MatchRole = 'MEMBER' | 'CAPTAIN' | 'VICE'

export const ROLE_LABEL: Record<MatchRole, string> = {
  MEMBER: '일반',
  CAPTAIN: '팀장',
  VICE: '부주장',
}

export const SKILL_MIN = 1
export const SKILL_MAX = 10

/** 회원(선수) 마스터 데이터 */
export interface Player {
  id: string
  /** 이름 (필수) */
  name: string
  /** 주 포지션 (필수) — 포지션 균형의 기준 */
  mainPosition: Position
  /** 부 포지션 (선택) — GK 부족 시 대체 키퍼 판단에 사용 */
  subPosition?: Position
  /** 종합 실력 1~10 (필수) — 팀 전력 균형의 기준 */
  skill: number
  /** 등번호 (선택) */
  backNumber?: number
  /** 출생년도 4자리 (선택) — 드래프트 나이대 그룹 */
  birthYear?: number
  /** 포지션·실력이 임시값이라 확인이 필요한 회원 */
  needsReview?: boolean
  /** 참석률 등급 (선택) — 드래프트 참고, 팀별 분포 표시 */
  attendanceLevel?: AttendanceLevel
  /** 회원 상태 (필수, 기본 ACTIVE) */
  status: MemberStatus
  /** 메모 (선택) — 운영진 참고용 */
  memo?: string
}

export function clampSkill(v: number): number {
  if (Number.isNaN(v)) return 5
  return Math.min(SKILL_MAX, Math.max(SKILL_MIN, Math.round(v)))
}

export function canPlayGK(p: Player): boolean {
  return p.mainPosition === 'GK' || p.subPosition === 'GK'
}

export function newPlayerId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}
