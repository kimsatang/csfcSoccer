import type { Slot } from './formations'
import { slotColor } from './formations'

export interface LineupImageInput {
  title: string // 예: 김동인팀
  subtitle: string // 예: 11/9(월) 1경기 vs 남상혁팀 · 4-4-2
  color: string
  slots: Slot[]
  names: Record<string, string> // slotKey → 이름
  bench: string[]
  footer?: string
}

const W = 1080
const H = 1500
const FONT = `'Pretendard', -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 전술판 이미지를 그려서 canvas로 반환 (1080×1500, 인스타·카톡 공유용 세로 비율) */
export function renderLineup(input: LineupImageInput): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // 배경
  ctx.fillStyle = '#0f1a14'
  ctx.fillRect(0, 0, W, H)

  // 헤더
  ctx.fillStyle = input.color
  ctx.fillRect(0, 0, W, 12)
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 58px ${FONT}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(input.title, 60, 100)
  ctx.font = `600 32px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText(input.subtitle, 60, 150)
  ctx.font = `800 30px ${FONT}`
  ctx.fillStyle = input.color
  ctx.textAlign = 'right'
  ctx.fillText('CSFC', W - 60, 100)
  ctx.textAlign = 'left'

  // 경기장
  const px = 60, py = 190, pw = W - 120, ph = 1060
  const stripes = 10
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2f7d43' : '#2a723c'
    ctx.fillRect(px, py + (ph / stripes) * i, pw, ph / stripes + 1)
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 4
  ctx.strokeRect(px, py, pw, ph)
  // 하프라인, 센터서클
  ctx.beginPath(); ctx.moveTo(px, py + ph / 2); ctx.lineTo(px + pw, py + ph / 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, 90, 0, Math.PI * 2); ctx.stroke()
  // 페널티 박스 (위·아래)
  const boxW = pw * 0.6, boxH = ph * 0.15, smallW = pw * 0.28, smallH = ph * 0.055
  for (const top of [true, false]) {
    const y0 = top ? py : py + ph - boxH
    ctx.strokeRect(px + (pw - boxW) / 2, y0, boxW, boxH)
    const y1 = top ? py : py + ph - smallH
    ctx.strokeRect(px + (pw - smallW) / 2, y1, smallW, smallH)
    ctx.beginPath()
    if (top) ctx.arc(px + pw / 2, py + boxH, 60, 0.15 * Math.PI, 0.85 * Math.PI)
    else ctx.arc(px + pw / 2, py + ph - boxH, 60, 1.15 * Math.PI, 1.85 * Math.PI)
    ctx.stroke()
  }

  // 선수
  for (const s of input.slots) {
    const cx = px + (s.x / 100) * pw
    const cy = py + (s.y / 100) * ph
    const name = input.names[s.key]
    ctx.beginPath()
    ctx.arc(cx, cy, 40, 0, Math.PI * 2)
    const pc = slotColor(s.label)
    ctx.fillStyle = name ? pc : 'rgba(255,255,255,0.12)'
    ctx.fill()
    ctx.lineWidth = 5
    ctx.strokeStyle = name ? '#ffffff' : pc
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 24px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(s.label, cx, cy + 1)

    const label = name ?? '-'
    ctx.font = `800 30px ${FONT}`
    const tw = ctx.measureText(label).width + 28
    roundRect(ctx, cx - tw / 2, cy + 50, tw, 44, 10)
    ctx.fillStyle = name ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.35)'
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, cx, cy + 73)
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // 교체 명단
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `700 28px ${FONT}`
  ctx.fillText(`교체 ${input.bench.length}명`, 60, 1310)
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 32px ${FONT}`
  const maxW = W - 120
  let line = ''
  let y = 1360
  for (const n of input.bench) {
    const next = line ? `${line} · ${n}` : n
    if (ctx.measureText(next).width > maxW && line) {
      ctx.fillText(line, 60, y)
      y += 44
      line = n
    } else line = next
  }
  if (line) ctx.fillText(line, 60, y)
  if (!input.bench.length) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillText('없음', 60, 1360) }

  if (input.footer) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = `600 22px ${FONT}`
    ctx.textAlign = 'right'
    ctx.fillText(input.footer, W - 60, H - 30)
    ctx.textAlign = 'left'
  }
  return canvas
}

/** 이미지 저장: 휴대폰은 공유 시트(카톡 바로 전송 가능), 그 외에는 다운로드 */
export async function exportCanvas(canvas: HTMLCanvasElement, filename: string): Promise<'shared' | 'downloaded'> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 생성 실패'))), 'image/png'))
  const file = new File([blob], filename, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] }) && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared' }
    catch (e) { if ((e as Error).name === 'AbortError') return 'shared' }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}
