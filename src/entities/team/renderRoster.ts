/** 드래프트 최종 명단 이미지 (Canvas) — 팀별 1장, 3팀 1장 */

export type RosterPos = 'GK' | 'DF' | 'MF' | 'FW'

export interface RosterImagePlayer {
  name: string
  year: string // 예: 91
  pos?: RosterPos
  /** 팀장·부팀장 */
  role?: '팀장' | '부팀장'
  pickNo?: number
}

export interface RosterImageTeam {
  name: string
  color: string
  players: RosterImagePlayer[] // 팀장, 부팀장, 지명 선수 순
}

export interface RosterImageMeta {
  seasonName: string
  dates: string // 예: 11/9 · 11/16 · 11/23 · 11/30
  status: string // 예: 최종 확정
}

const W = 1080
const FONT = `'Pretendard', -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`
const BG = '#0f1a14'
const CARD = '#18261d'
const POS_COLOR: Record<RosterPos, string> = { GK: '#f59f00', DF: '#4c6ef5', MF: '#12b886', FW: '#f03e3e' }
const POS_LABEL: Record<RosterPos, string> = { GK: 'GK', DF: 'DF', MF: 'MF', FW: 'FW' }

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function makeCanvas(h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, h)
  ctx.textBaseline = 'middle'
  return { canvas, ctx }
}

/** 긴 이름은 폭에 맞게 줄임 */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, cy: number, bg: string, size = 22, fg = '#fff'): number {
  ctx.font = `800 ${size}px ${FONT}`
  const w = ctx.measureText(text).width + size
  roundRect(ctx, x, cy - size * 0.75, w, size * 1.5, 8)
  ctx.fillStyle = bg
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textAlign = 'center'
  ctx.fillText(text, x + w / 2, cy + 1)
  ctx.textAlign = 'left'
  return w
}

function summary(players: RosterImagePlayer[], compact = false): string {
  const counts = (['GK', 'DF', 'MF', 'FW'] as RosterPos[])
    .map((p) => [p, players.filter((x) => x.pos === p).length] as const)
    .filter(([, n]) => n > 0)
    .map(([p, n]) => (compact ? `${POS_LABEL[p]}${n}` : `${POS_LABEL[p]} ${n}`))
  return compact ? `${players.length}명 · ${counts.join(' ')}` : [`${players.length}명`, ...counts].join(' · ')
}

function footer(ctx: CanvasRenderingContext2D, h: number, meta: RosterImageMeta) {
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = `600 22px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(`CSFC 팀짜기 · ${meta.seasonName}`, W - 60, h - 36)
  ctx.textAlign = 'left'
}

/** 한 팀 명단 (1080 × 가변, 최소 1350 = 4:5) */
export function renderTeamRoster(team: RosterImageTeam, meta: RosterImageMeta): HTMLCanvasElement {
  const leaders = team.players.filter((p) => p.role)
  const picks = team.players.filter((p) => !p.role)
  const rowH = 76
  const cols = 2
  const rows = Math.ceil(picks.length / cols)
  const listTop = 520
  const h = Math.max(1350, listTop + rows * rowH + 120)
  const { canvas, ctx } = makeCanvas(h)

  // 헤더
  ctx.fillStyle = team.color
  ctx.fillRect(0, 0, W, 14)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `700 28px ${FONT}`
  ctx.fillText(`${meta.seasonName} · ${meta.status}`, 60, 74)
  ctx.fillStyle = '#fff'
  ctx.font = `900 76px ${FONT}`
  ctx.fillText(team.name, 60, 150)
  ctx.font = `800 30px ${FONT}`
  ctx.fillStyle = team.color
  ctx.textAlign = 'right'
  ctx.fillText('CSFC', W - 60, 74)
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = `600 30px ${FONT}`
  ctx.fillText(summary(team.players), 60, 214)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `600 26px ${FONT}`
  ctx.fillText(fit(ctx, meta.dates, W - 120), 60, 256)

  // 팀장·부팀장
  const lw = (W - 120 - 20) / 2
  leaders.forEach((p, i) => {
    const x = 60 + i * (lw + 20)
    const y = 300
    roundRect(ctx, x, y, lw, 150, 18)
    ctx.fillStyle = CARD
    ctx.fill()
    ctx.lineWidth = 4
    ctx.strokeStyle = team.color
    ctx.stroke()
    pill(ctx, p.role!, x + 24, y + 42, p.role === '팀장' ? team.color : 'rgba(255,255,255,0.18)', 24, p.role === '팀장' && team.color === '#f5b800' ? '#1a1a1a' : '#fff')
    ctx.fillStyle = '#fff'
    ctx.font = `900 52px ${FONT}`
    ctx.fillText(fit(ctx, p.name, lw - 170), x + 24, y + 106)
    ctx.font = `700 28px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.textAlign = 'right'
    ctx.fillText(`${p.year}년생`, x + lw - 24, y + 42)
    ctx.textAlign = 'left'
    if (p.pos) pill(ctx, p.pos, x + lw - 24 - 66, y + 108, POS_COLOR[p.pos], 24)
  })

  // 지명 선수
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `700 26px ${FONT}`
  ctx.fillText(`선수 ${picks.length}명`, 60, listTop - 22)
  const cw = (W - 120 - 20) / cols
  picks.forEach((p, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = 60 + col * (cw + 20)
    const y = listTop + row * rowH
    roundRect(ctx, x, y, cw, rowH - 12, 12)
    ctx.fillStyle = CARD
    ctx.fill()
    const cy = y + (rowH - 12) / 2
    ctx.fillStyle = '#fff'
    ctx.font = `800 34px ${FONT}`
    ctx.fillText(fit(ctx, p.name, cw - 170), x + 24, cy)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = `700 24px ${FONT}`
    ctx.textAlign = 'right'
    ctx.fillText(`'${p.year}`, x + cw - 92, cy)
    ctx.textAlign = 'left'
    if (p.pos) pill(ctx, p.pos, x + cw - 82, cy, POS_COLOR[p.pos], 22)
  })

  footer(ctx, h, meta)
  return canvas
}

/** 3팀 한 장 (1080 × 가변) */
export function renderAllRosters(teams: RosterImageTeam[], meta: RosterImageMeta): HTMLCanvasElement {
  const n = Math.max(1, teams.length)
  const gap = 16
  const colW = (W - 80 - gap * (n - 1)) / n
  const rowH = 56
  const top = 200
  const maxRows = Math.max(0, ...teams.map((t) => t.players.length))
  const h = Math.max(1350, top + 110 + maxRows * rowH + 110)
  const { canvas, ctx } = makeCanvas(h)

  ctx.fillStyle = '#fff'
  ctx.font = `900 60px ${FONT}`
  ctx.fillText('최종 명단', 40, 78)
  ctx.font = `800 30px ${FONT}`
  ctx.fillStyle = '#7bd389'
  ctx.textAlign = 'right'
  ctx.fillText('CSFC', W - 40, 78)
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `600 28px ${FONT}`
  ctx.fillText(fit(ctx, `${meta.seasonName} · ${meta.status}`, W - 80), 40, 130)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `600 24px ${FONT}`
  ctx.fillText(meta.dates, 40, 168)

  teams.forEach((t, i) => {
    const x = 40 + i * (colW + gap)
    const colH = 110 + t.players.length * rowH + 16
    roundRect(ctx, x, top, colW, colH, 16)
    ctx.fillStyle = CARD
    ctx.fill()
    // 팀 헤더
    ctx.save()
    roundRect(ctx, x, top, colW, 96, 16)
    ctx.clip()
    ctx.fillStyle = t.color
    ctx.fillRect(x, top, colW, 96)
    ctx.restore()
    const dark = t.color === '#f5b800'
    ctx.fillStyle = dark ? '#1a1a1a' : '#fff'
    ctx.font = `900 38px ${FONT}`
    ctx.fillText(fit(ctx, t.name, colW - 40), x + 20, top + 40)
    ctx.font = `700 22px ${FONT}`
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)'
    ctx.fillText(fit(ctx, summary(t.players, true), colW - 40), x + 20, top + 76)

    t.players.forEach((p, j) => {
      const cy = top + 110 + j * rowH + rowH / 2
      if (j > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x + 16, cy - rowH / 2); ctx.lineTo(x + colW - 16, cy - rowH / 2); ctx.stroke()
      }
      let nx = x + 18
      if (p.role) nx += pill(ctx, p.role === '팀장' ? 'C' : 'V', nx, cy, p.role === '팀장' ? t.color : 'rgba(255,255,255,0.22)', 20, p.role === '팀장' && dark ? '#1a1a1a' : '#fff') + 10
      const right = x + colW - 16
      const posW = 58
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = `700 20px ${FONT}`
      ctx.textAlign = 'right'
      ctx.fillText(`'${p.year}`, right - posW - 8, cy)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#fff'
      ctx.font = `${p.role ? 900 : 700} 28px ${FONT}`
      ctx.fillText(fit(ctx, p.name, right - posW - 52 - nx), nx, cy)
      if (p.pos) pill(ctx, p.pos, right - posW + 2, cy, POS_COLOR[p.pos], 18)
    })
  })

  footer(ctx, h, meta)
  return canvas
}
