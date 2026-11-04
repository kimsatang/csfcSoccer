import { supabase } from '../../shared/api/supabase'
import type { AttendanceLevel, MemberStatus, Player, Position } from './model'

interface MemberRow {
  id: string
  name: string
  back_number: number | null
  main_position: Position
  sub_position: Position | null
  skill: number
  status: MemberStatus
  memo: string | null
  birth_year: number | null
  needs_review: boolean
  position_review: boolean
  attendance_level: AttendanceLevel | null
}

const COLUMNS = 'id,name,back_number,main_position,sub_position,skill,status,memo,birth_year,needs_review,position_review,attendance_level'

function fromRow(r: MemberRow): Player {
  return {
    id: r.id,
    name: r.name,
    backNumber: r.back_number ?? undefined,
    mainPosition: r.main_position,
    subPosition: r.sub_position ?? undefined,
    skill: r.skill,
    status: r.status,
    memo: r.memo ?? undefined,
    birthYear: r.birth_year ?? undefined,
    needsReview: r.needs_review,
    positionReview: r.position_review,
    attendanceLevel: r.attendance_level ?? undefined,
  }
}

function toRow(p: Omit<Player, 'id'>): Omit<MemberRow, 'id'> {
  return {
    name: p.name,
    back_number: p.backNumber ?? null,
    main_position: p.mainPosition,
    sub_position: p.subPosition ?? null,
    skill: p.skill,
    status: p.status,
    memo: p.memo ?? null,
    birth_year: p.birthYear ?? null,
    needs_review: p.needsReview ?? false,
    position_review: p.positionReview ?? false,
    attendance_level: p.attendanceLevel ?? null,
  }
}

export async function fetchMembers(): Promise<Player[]> {
  const { data, error } = await supabase.from('members').select(COLUMNS).order('birth_year', { nullsFirst: false }).order('name')
  if (error) throw error
  return (data as MemberRow[]).map(fromRow)
}

/** 신규 회원 일괄/단건 등록 — DB가 id를 발급 */
export async function insertMembers(players: Omit<Player, 'id'>[]): Promise<Player[]> {
  const { data, error } = await supabase.from('members').insert(players.map(toRow)).select(COLUMNS)
  if (error) throw error
  return (data as MemberRow[]).map(fromRow)
}

export async function updateMember(p: Player): Promise<Player> {
  const { data, error } = await supabase.from('members').update(toRow(p)).eq('id', p.id).select(COLUMNS).single()
  if (error) throw error
  return fromRow(data as MemberRow)
}

export async function deleteMember(id: string): Promise<void> {
  const { error } = await supabase.from('members').delete().eq('id', id)
  if (error) throw error
}

/**
 * CSV 일괄 등록: 같은 이름의 회원이 이미 있으면 정보를 갱신, 없으면 새로 등록.
 * (팀장·부팀장처럼 임시값으로 먼저 등록된 회원을 명단으로 덮어쓰기 위함)
 */
export async function upsertMembersByName(
  incoming: Omit<Player, 'id'>[],
  existing: Player[],
): Promise<{ inserted: Player[]; updated: Player[] }> {
  const byName = new Map(existing.map((m) => [m.name, m]))
  const toUpdate = incoming.filter((p) => byName.has(p.name))
  const toInsert = incoming.filter((p) => !byName.has(p.name))
  const updated: Player[] = []
  for (const p of toUpdate) updated.push(await updateMember({ ...p, id: byName.get(p.name)!.id }))
  const inserted = toInsert.length ? await insertMembers(toInsert) : []
  return { inserted, updated }
}
