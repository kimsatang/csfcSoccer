import type { Ratings } from '../../entities/rating'
import { RATING_KEYS, RATING_LABEL, RATING_MAX } from '../../entities/rating'

/** 선수 지표 육각형 그래프 (SVG). 값이 없는 축은 0으로 그림 */
export function RatingRadar({ ratings, size = 220, color = '#0b7a3e', showValues = true }: {
  ratings: Ratings; size?: number; color?: string; showValues?: boolean
}) {
  const n = RATING_KEYS.length
  const c = 100, R = 66
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v] as const
  }
  const ring = (f: number) => RATING_KEYS.map((_, i) => pt(i, f).join(',')).join(' ')
  const vals = RATING_KEYS.map((k) => Math.max(0, Math.min(RATING_MAX, ratings[k] ?? 0)) / RATING_MAX)
  const poly = vals.map((v, i) => pt(i, v).join(',')).join(' ')
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img"
      aria-label={`선수 지표: ${RATING_KEYS.map((k) => `${RATING_LABEL[k]} ${ratings[k] ?? '미입력'}`).join(', ')}`}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={ring(f)} fill={f === 1 ? 'var(--mantine-color-gray-0)' : 'none'} stroke="var(--mantine-color-gray-3)" strokeWidth={f === 1 ? 1 : 0.6} />
      ))}
      {RATING_KEYS.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--mantine-color-gray-3)" strokeWidth={0.6} /> })}
      <polygon points={poly} fill={color} fillOpacity={0.28} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {vals.map((v, i) => { const [x, y] = pt(i, v); return v > 0 ? <circle key={i} cx={x} cy={y} r={2.6} fill={color} /> : null })}
      {RATING_KEYS.map((k, i) => {
        const [x, y] = pt(i, 1.27)
        const v = ratings[k]
        return (
          <text key={k} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={10.5} fontWeight={700} fill="var(--mantine-color-text)">
            {RATING_LABEL[k]}{showValues && <tspan fill={v == null ? 'var(--mantine-color-gray-5)' : color} fontWeight={800}> {v ?? '-'}</tspan>}
          </text>
        )
      })}
    </svg>
  )
}

const GRADE_BADGE: Record<string, string> = { S: 'grape', A: 'blue', B: 'teal', C: 'yellow', D: 'gray' }

/** 등급 배지 (구단이 바꾼 등급 이름도 표시, 색은 S~D만) */
export function GradeBadge({ grade, size = 'sm' }: { grade?: string | null; size?: 'xs' | 'sm' | 'md' }) {
  if (!grade) return null
  return <span className={`grade-badge grade-${size}`} data-c={GRADE_BADGE[grade] ?? 'dark'} title="선수 등급">{grade}</span>
}
