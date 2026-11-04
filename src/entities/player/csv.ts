import type { MemberStatus, Player, Position } from './model'
import { clampSkill, newPlayerId } from './model'

const POSITION_ALIASES: Record<string, Position> = {
  gk: 'GK', 골키퍼: 'GK', 키퍼: 'GK', 골: 'GK',
  df: 'DF', 수비: 'DF', 수비수: 'DF', 디펜스: 'DF', cb: 'DF', lb: 'DF', rb: 'DF',
  mf: 'MF', 미드: 'MF', 미드필더: 'MF', 중원: 'MF', cm: 'MF', dm: 'MF', am: 'MF',
  fw: 'FW', 공격: 'FW', 공격수: 'FW', 포워드: 'FW', st: 'FW', cf: 'FW', lw: 'FW', rw: 'FW',
}

export function parsePosition(raw: string | undefined): Position | undefined {
  if (!raw) return undefined
  return POSITION_ALIASES[raw.trim().toLowerCase()]
}

const HEADER_ALIASES: Record<string, keyof Player> = {
  이름: 'name', name: 'name',
  등번호: 'backNumber', 번호: 'backNumber', number: 'backNumber', backnumber: 'backNumber',
  주포지션: 'mainPosition', 포지션: 'mainPosition', position: 'mainPosition', mainposition: 'mainPosition',
  부포지션: 'subPosition', subposition: 'subPosition',
  실력: 'skill', 능력치: 'skill', skill: 'skill', 레벨: 'skill',
  상태: 'status', status: 'status',
  메모: 'memo', memo: 'memo', 비고: 'memo',
}

export interface CsvParseResult {
  players: Player[]
  errors: string[]
}

/**
 * CSV 또는 엑셀에서 복사한 탭 구분 텍스트를 회원 목록으로 변환.
 * 첫 줄은 헤더(이름, 주포지션, 실력 필수).
 */
export function parseMembersCsv(text: string): CsvParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const errors: string[] = []
  if (lines.length < 2) return { players: [], errors: ['헤더와 1명 이상의 데이터가 필요합니다.'] }

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const headers = lines[0].split(delimiter).map((h) => HEADER_ALIASES[h.trim().replace(/\s/g, '').toLowerCase()])
  for (const required of ['name', 'mainPosition', 'skill'] as const) {
    if (!headers.includes(required)) errors.push(`필수 컬럼 누락: ${required === 'name' ? '이름' : required === 'mainPosition' ? '주포지션' : '실력'}`)
  }
  if (errors.length) return { players: [], errors }

  const players: Player[] = []
  lines.slice(1).forEach((line, idx) => {
    const cells = line.split(delimiter).map((c) => c.trim())
    const row: Partial<Record<keyof Player, string>> = {}
    headers.forEach((key, i) => { if (key) row[key] = cells[i] })

    const lineNo = idx + 2
    if (!row.name) { errors.push(`${lineNo}행: 이름이 비어 있습니다.`); return }
    const mainPosition = parsePosition(row.mainPosition)
    if (!mainPosition) { errors.push(`${lineNo}행(${row.name}): 주포지션 '${row.mainPosition ?? ''}'을 알 수 없습니다.`); return }
    const skillNum = Number(row.skill)
    if (!row.skill || Number.isNaN(skillNum)) { errors.push(`${lineNo}행(${row.name}): 실력은 1~10 숫자여야 합니다.`); return }

    const status: MemberStatus = row.status && /휴면|inactive|n/i.test(row.status) ? 'INACTIVE' : 'ACTIVE'
    const backNumber = row.backNumber ? Number(row.backNumber) : undefined
    players.push({
      id: newPlayerId(),
      name: row.name,
      mainPosition,
      subPosition: parsePosition(row.subPosition),
      skill: clampSkill(skillNum),
      backNumber: backNumber !== undefined && !Number.isNaN(backNumber) ? backNumber : undefined,
      status,
      memo: row.memo || undefined,
    })
  })
  return { players, errors }
}

export function membersToCsv(players: Player[]): string {
  const header = '이름,등번호,주포지션,부포지션,실력,상태,메모'
  const rows = players.map((p) =>
    [p.name, p.backNumber ?? '', p.mainPosition, p.subPosition ?? '', p.skill, p.status === 'ACTIVE' ? '활동' : '휴면', (p.memo ?? '').replace(/,/g, ' ')].join(','),
  )
  return [header, ...rows].join('\n')
}
