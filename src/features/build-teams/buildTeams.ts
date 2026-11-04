import type { Player, Position } from '../../entities/player'
import { canPlayGK } from '../../entities/player'
import type { Rng } from '../../shared/lib/rng'
import { shuffle } from '../../shared/lib/rng'

export const TEAM_COUNT = 3

export const TEAM_COLORS = [
  { key: 'RED', label: '빨강', hex: '#e5484d' },
  { key: 'BLUE', label: '파랑', hex: '#3e63dd' },
  { key: 'YELLOW', label: '노랑', hex: '#f5b800' },
] as const

export interface Team {
  index: number
  captain: Player
  vice: Player
  /** 팀장·부주장을 제외한 팀원 */
  members: Player[]
}

export interface TeamStats {
  size: number
  totalSkill: number
  avgSkill: number
  positions: Record<Position, number>
  gkCapable: number
}

export interface BuildInput {
  attendees: Player[]
  captainIds: string[]
  viceIds: string[]
  rng?: Rng
  /** 무작위 재시작 횟수 (클수록 균형↑, 속도↓) */
  restarts?: number
}

export interface BuildResult {
  teams: Team[]
  cost: number
}

/** 비용 함수 가중치 — 값이 낮을수록 균형 잡힌 편성 */
export const WEIGHTS = {
  avgSkillRange: 10, // 팀 평균 실력 최대-최소 차
  totalSkillRange: 1, // 팀 실력 합 최대-최소 차
  positionRange: 1.5, // DF/MF/FW 인원 최대-최소 차 (포지션별)
  gkRange: 4, // 주포지션 GK 인원 최대-최소 차
  noGkPenalty: 6, // GK 가능자가 충분한데 GK 가능자가 0명인 팀
}

/** 다시 섞기 시 최적해 근처에서 무작위로 고르는 허용 오차 */
const VARIETY_TOLERANCE = 0.6

export function allPlayers(team: Team): Player[] {
  return [team.captain, team.vice, ...team.members]
}

export function teamStats(team: Team): TeamStats {
  const players = allPlayers(team)
  const positions: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
  let totalSkill = 0
  let gkCapable = 0
  for (const p of players) {
    positions[p.mainPosition]++
    totalSkill += p.skill
    if (canPlayGK(p)) gkCapable++
  }
  return { size: players.length, totalSkill, avgSkill: totalSkill / players.length, positions, gkCapable }
}

const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs)

export function evaluate(teams: Team[]): number {
  const stats = teams.map(teamStats)
  const totalGkCapable = stats.reduce((s, t) => s + t.gkCapable, 0)
  // 인원이 같을 때만 합계를 비교 (13/14/13처럼 다르면 합계 차는 불가피하므로 평균만 비교)
  const sameSize = range(stats.map((s) => s.size)) === 0
  let cost =
    WEIGHTS.avgSkillRange * range(stats.map((s) => s.avgSkill)) +
    (sameSize ? WEIGHTS.totalSkillRange * range(stats.map((s) => s.totalSkill)) : 0) +
    WEIGHTS.gkRange * range(stats.map((s) => s.positions.GK))
  for (const pos of ['DF', 'MF', 'FW'] as const) {
    cost += WEIGHTS.positionRange * range(stats.map((s) => s.positions[pos]))
  }
  if (totalGkCapable >= teams.length) {
    cost += WEIGHTS.noGkPenalty * stats.filter((s) => s.gkCapable === 0).length
  }
  return cost
}

export function validateLeaders(attendees: Player[], captainIds: string[], viceIds: string[]): string[] {
  const errors: string[] = []
  const ids = new Set(attendees.map((p) => p.id))
  if (captainIds.length !== TEAM_COUNT) errors.push(`팀장은 ${TEAM_COUNT}명이어야 합니다. (현재 ${captainIds.length}명)`)
  if (viceIds.length !== TEAM_COUNT) errors.push(`부주장은 ${TEAM_COUNT}명이어야 합니다. (현재 ${viceIds.length}명)`)
  if (captainIds.some((id) => viceIds.includes(id))) errors.push('같은 사람이 팀장과 부주장을 동시에 맡을 수 없습니다.')
  if ([...captainIds, ...viceIds].some((id) => !ids.has(id))) errors.push('팀장·부주장은 참석자 중에서 지정해야 합니다.')
  return errors
}

/**
 * 팀장-부주장 페어링: 실력 높은 팀장 ↔ 실력 낮은 부주장
 * → 리더 조합 단계에서 1차 균형을 맞춘다.
 */
function pairLeaders(captains: Player[], vices: Player[]): [Player, Player][] {
  const cs = [...captains].sort((a, b) => b.skill - a.skill)
  const vs = [...vices].sort((a, b) => a.skill - b.skill)
  return cs.map((c, i) => [c, vs[i]])
}

function greedyAssign(teams: Team[], pool: Player[], rng: Rng): void {
  // GK 먼저 → 이후 실력 내림차순(약간의 무작위 흔들림으로 매번 다른 결과)
  const order = shuffle(pool, rng)
    .map((p) => ({ p, key: (p.mainPosition === 'GK' ? 100 : 0) + p.skill + rng() * 1.5 }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.p)

  for (const p of order) {
    const sizes = teams.map((t) => allPlayers(t).length)
    const minSize = Math.min(...sizes)
    let best: Team | null = null
    let bestScore = Infinity
    for (const t of teams) {
      if (allPlayers(t).length !== minSize) continue
      const st = teamStats(t)
      let score = st.totalSkill + st.positions[p.mainPosition] * 2
      if (canPlayGK(p) && st.gkCapable === 0) score -= 50
      score += rng() * 0.5
      if (score < bestScore) { bestScore = score; best = t }
    }
    best!.members.push(p)
  }
}

/** 팀원 맞교환/이동으로 비용이 줄어드는 동안 반복 (hill climbing) */
function localSearch(teams: Team[]): number {
  let current = evaluate(teams)
  for (let pass = 0; pass < 50; pass++) {
    let improved = false
    for (let a = 0; a < teams.length; a++) {
      for (let b = a + 1; b < teams.length; b++) {
        const A = teams[a].members
        const B = teams[b].members
        // 1) 맞교환
        for (let i = 0; i < A.length; i++) {
          for (let j = 0; j < B.length; j++) {
            ;[A[i], B[j]] = [B[j], A[i]]
            const c = evaluate(teams)
            if (c < current - 1e-9) { current = c; improved = true }
            else { ;[A[i], B[j]] = [B[j], A[i]] }
          }
        }
        // 2) 인원이 많은 팀 → 적은 팀으로 이동 (인원 차 1 이내 유지)
        const [big, small] = A.length > B.length ? [A, B] : [B, A]
        if (big.length - small.length >= 1) {
          for (let i = 0; i < big.length; i++) {
            const [p] = big.splice(i, 1)
            small.push(p)
            const sizes = teams.map((t) => allPlayers(t).length)
            const c = evaluate(teams)
            if (range(sizes) <= 1 && c < current - 1e-9) { current = c; improved = true; break }
            small.pop()
            big.splice(i, 0, p)
          }
        }
      }
    }
    if (!improved) break
  }
  return current
}

export function buildTeams({ attendees, captainIds, viceIds, rng = Math.random, restarts = 40 }: BuildInput): BuildResult {
  const errors = validateLeaders(attendees, captainIds, viceIds)
  if (errors.length) throw new Error(errors.join('\n'))

  const byId = new Map(attendees.map((p) => [p.id, p]))
  const captains = captainIds.map((id) => byId.get(id)!)
  const vices = viceIds.map((id) => byId.get(id)!)
  const leaderIds = new Set([...captainIds, ...viceIds])
  const pool = attendees.filter((p) => !leaderIds.has(p.id))
  const pairs = pairLeaders(captains, vices)

  const candidates: BuildResult[] = []
  for (let r = 0; r < restarts; r++) {
    const teams: Team[] = shuffle(pairs, rng).map(([captain, vice], index) => ({ index, captain, vice, members: [] }))
    greedyAssign(teams, pool, rng)
    const cost = localSearch(teams)
    candidates.push({ teams, cost })
  }

  const bestCost = Math.min(...candidates.map((c) => c.cost))
  const nearBest = candidates.filter((c) => c.cost <= bestCost + VARIETY_TOLERANCE)
  const picked = nearBest[Math.floor(rng() * nearBest.length)]
  picked.teams.forEach((t) => t.members.sort((x, y) => order(x) - order(y) || y.skill - x.skill))
  return picked
}

const POS_ORDER: Record<Position, number> = { GK: 0, DF: 1, MF: 2, FW: 3 }
const order = (p: Player) => POS_ORDER[p.mainPosition]

/** 결과 화면에서 수동으로 팀원을 옮길 때 사용 (팀장·부주장은 이동 불가) */
export function movePlayer(teams: Team[], playerId: string, toIndex: number): Team[] {
  const next = teams.map((t) => ({ ...t, members: [...t.members] }))
  const from = next.find((t) => t.members.some((m) => m.id === playerId))
  if (!from || from.index === toIndex) return teams
  const p = from.members.find((m) => m.id === playerId)!
  from.members = from.members.filter((m) => m.id !== playerId)
  next[toIndex].members.push(p)
  return next
}
