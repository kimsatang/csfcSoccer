import type { AttendanceLevel } from '../entities/player'
import { ATTENDANCE_LABEL } from '../entities/player'

/** 참석률 등급 뱃지. compact면 한 글자(높/중/낮) */
export function AttendanceBadge({ level, compact = false }: { level?: AttendanceLevel; compact?: boolean }) {
  if (!level) return compact ? null : <span className="att att-none">-</span>
  const text = ATTENDANCE_LABEL[level]
  return <span className={`att att-${level}`} title={`참석률 ${text}`}>{compact ? text[0] : text}</span>
}
