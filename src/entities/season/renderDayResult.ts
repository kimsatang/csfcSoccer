/** 경기일 결과 이미지 (1080 × 가변) — 스코어·득점자·MVP·시즌 순위 */

export interface ResultImageTeam { name: string; color: string }
export interface ResultImageGame {
  no: number
  home: ResultImageTeam; away: ResultImageTeam
  homeScore: number; awayScore: number
  homeGoals: string[]; awayGoals: string[]
}
export interface ResultImageStanding extends ResultImageTeam { played: number; win: number; draw: number; loss: number; gd: number; points: number }
export interface ResultImageData {
  seasonName: string
  dateLabel: string
  games: ResultImageGame[]
  mvp: string | null
  /** "강감찬 2 · 김구 1" */
  scorers: string | null
  assists: string | null
  standings: ResultImageStanding[]
}

const W = 1080
const PAD = 60
const FONT = `'Pretendard', -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`
const BG = '#0f1a14'
const CARD = '#18261d'
const DIM = 'rgba(255,255,255,0.55)'
const LINE_H = 40

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

/** 긴 글을 폭에 맞춰 여러 줄로 (구분자 ' · ' 단위) */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const parts = text.split(' · ')
  const lines: string[] = []
  let cur = ''
  for (const p of parts) {
    const next = cur ? `${cur} · ${p}` : p
    if (cur && ctx.measureText(next).width > max) { lines.push(cur); cur = p } else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

const gameHeight = (g: ResultImageGame) => {
  const n = Math.max(g.homeGoals.length, g.awayGoals.length)
  return 150 + (n ? n * LINE_H + 16 : 0)
}

export function renderDayResult(d: ResultImageData): HTMLCanvasElement {
  // 높이 계산용 측정 컨텍스트
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = `700 30px ${FONT}`
  const textW = W - PAD * 2 - 80
  const scorerLines = d.scorers ? wrap(measure, `득점  ${d.scorers}`, textW) : []
  const assistLines = d.assists ? wrap(measure, `도움  ${d.assists}`, textW) : []
  const summaryH = (d.mvp ? 70 : 0) + (scorerLines.length + assistLines.length) * 44 + 20
  const tableH = d.standings.length ? 90 + 70 + d.standings.length * 64 : 0

  let h = 230
  for (const g of d.games) h += gameHeight(g) + 20
  if (summaryH) h += summaryH + 50
  if (tableH) h += tableH + 30
  h = Math.max(h + 90, 1350)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, h)
  ctx.textBaseline = 'middle'

  // 머리말
  ctx.fillStyle = '#4ade80'
  ctx.font = `700 28px ${FONT}`
  ctx.fillText(d.seasonName, PAD, 90)
  ctx.fillStyle = '#fff'
  ctx.font = `900 72px ${FONT}`
  ctx.fillText(`${d.dateLabel} 경기 결과`, PAD, 160)

  let y = 230
  // 게임 카드
  for (const g of d.games) {
    const gh = gameHeight(g)
    roundRect(ctx, PAD, y, W - PAD * 2, gh, 24)
    ctx.fillStyle = CARD
    ctx.fill()
    // 팀 색 막대
    ctx.fillStyle = g.home.color
    roundRect(ctx, PAD, y, 12, gh, 6); ctx.fill()
    ctx.fillStyle = g.away.color
    roundRect(ctx, W - PAD - 12, y, 12, gh, 6); ctx.fill()

    ctx.fillStyle = DIM
    ctx.font = `700 24px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(`${g.no}경기`, W / 2, y + 34)

    const cy = y + 92
    const half = W / 2
    ctx.font = `900 72px ${FONT}`
    ctx.fillStyle = '#fff'
    ctx.fillText(`${g.homeScore} : ${g.awayScore}`, half, cy)
    const win = g.homeScore === g.awayScore ? 0 : g.homeScore > g.awayScore ? -1 : 1

    ctx.font = `800 40px ${FONT}`
    const nameMax = half - 130 - PAD - 40
    ctx.textAlign = 'right'
    ctx.fillStyle = win === 1 ? DIM : '#fff'
    ctx.fillText(fit(ctx, g.home.name, nameMax), half - 130, cy)
    ctx.textAlign = 'left'
    ctx.fillStyle = win === -1 ? DIM : '#fff'
    ctx.fillText(fit(ctx, g.away.name, nameMax), half + 130, cy)

    // 득점자
    ctx.font = `600 28px ${FONT}`
    const goalMax = half - PAD - 70
    g.homeGoals.forEach((t, i) => {
      ctx.textAlign = 'right'
      ctx.fillStyle = t.startsWith('자책골') ? '#ff8787' : 'rgba(255,255,255,0.85)'
      ctx.fillText(`${fit(ctx, t, goalMax)} ⚽`, half - 40, cy + 66 + i * LINE_H)
    })
    g.awayGoals.forEach((t, i) => {
      ctx.textAlign = 'left'
      ctx.fillStyle = t.startsWith('자책골') ? '#ff8787' : 'rgba(255,255,255,0.85)'
      ctx.fillText(`⚽ ${fit(ctx, t, goalMax)}`, half + 40, cy + 66 + i * LINE_H)
    })
    ctx.textAlign = 'left'
    y += gh + 20
  }

  // MVP·득점·도움
  if (summaryH) {
    y += 30
    roundRect(ctx, PAD, y, W - PAD * 2, summaryH + 10, 24)
    ctx.fillStyle = CARD
    ctx.fill()
    let ly = y + 50
    if (d.mvp) {
      ctx.font = `900 40px ${FONT}`
      ctx.fillStyle = '#fcc419'
      ctx.fillText(`🏆 MVP  ${d.mvp}`, PAD + 40, ly)
      ly += 70
    }
    ctx.font = `700 30px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (const line of [...scorerLines, ...assistLines]) { ctx.fillText(line, PAD + 40, ly); ly += 44 }
    y += summaryH + 50
  }

  // 시즌 순위
  if (tableH) {
    y += 10
    ctx.fillStyle = '#fff'
    ctx.font = `900 40px ${FONT}`
    ctx.fillText('시즌 순위', PAD, y + 30)
    y += 80
    const cols = [
      { label: '경기', x: 560 }, { label: '승', x: 650 }, { label: '무', x: 730 }, { label: '패', x: 810 }, { label: '득실', x: 905 }, { label: '승점', x: W - PAD - 10 },
    ]
    ctx.font = `700 24px ${FONT}`
    ctx.fillStyle = DIM
    ctx.textAlign = 'right'
    for (const c of cols) ctx.fillText(c.label, c.x, y + 20)
    ctx.textAlign = 'left'
    y += 50
    d.standings.forEach((r, i) => {
      if (i % 2 === 0) { roundRect(ctx, PAD, y, W - PAD * 2, 60, 12); ctx.fillStyle = CARD; ctx.fill() }
      const cy = y + 30
      ctx.font = `900 30px ${FONT}`
      ctx.fillStyle = DIM
      ctx.fillText(`${i + 1}`, PAD + 24, cy)
      ctx.fillStyle = r.color
      ctx.beginPath(); ctx.arc(PAD + 82, cy, 11, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = `800 32px ${FONT}`
      ctx.fillText(fit(ctx, r.name, 330), PAD + 108, cy)
      ctx.font = `700 30px ${FONT}`
      ctx.textAlign = 'right'
      const vals = [r.played, r.win, r.draw, r.loss, `${r.gd > 0 ? '+' : ''}${r.gd}`]
      vals.forEach((v, j) => ctx.fillText(String(v), cols[j].x, cy))
      ctx.font = `900 34px ${FONT}`
      ctx.fillStyle = '#4ade80'
      ctx.fillText(String(r.points), cols[5].x, cy)
      ctx.textAlign = 'left'
      y += 64
    })
  }

  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = `600 22px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(`CSFC 팀짜기 · ${d.seasonName}`, W - PAD, h - 36)
  ctx.textAlign = 'left'
  return canvas
}
