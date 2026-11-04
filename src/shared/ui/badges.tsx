import { Badge } from '@mantine/core'
import type { AttendanceLevel, Position } from '../../entities/player'
import { ATTENDANCE_LABEL, POSITION_LABEL } from '../../entities/player'

export const POSITION_COLOR: Record<Position, string> = { GK: 'yellow', DF: 'blue', MF: 'teal', FW: 'red' }
const ATT_COLOR: Record<AttendanceLevel, string> = { HIGH: 'brand', MID: 'gray', LOW: 'red' }

export function PosBadge({ pos, light, size = 'sm' }: { pos?: Position; light?: boolean; size?: 'xs' | 'sm' | 'md' }) {
  if (!pos) return null
  return <Badge size={size} color={POSITION_COLOR[pos]} variant={light ? 'light' : 'filled'} radius="sm">{POSITION_LABEL[pos]}</Badge>
}

export function AttBadge({ level, compact }: { level?: AttendanceLevel; compact?: boolean }) {
  if (!level) return null
  const t = ATTENDANCE_LABEL[level]
  return <Badge size="xs" color={ATT_COLOR[level]} variant="light" radius="sm" title={`참석률 ${t}`}>{compact ? `참${t[0]}` : `참석 ${t}`}</Badge>
}

export function MissingBadge({ label = '미입력' }: { label?: string }) {
  return <Badge size="xs" color="orange" variant="light" radius="sm">{label}</Badge>
}

export function RoleBadge({ role, color }: { role: '팀장' | '부팀장'; color: string }) {
  return <Badge size="xs" radius="sm" variant={role === '팀장' ? 'filled' : 'light'} color={color}>{role}</Badge>
}
