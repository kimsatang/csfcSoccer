import { supabase } from '../../shared/api/supabase'
import type { MemberStatus, Player, Position } from './model'

interface MemberRow {
  id: string
  name: string
  back_number: number | null
  main_position: Position
  sub_position: Position | null
  skill: number
  status: MemberStatus
  memo: string | null
}

const COLUMNS = 'id,name,back_number,main_position,sub_position,skill,status,memo'

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
  }
}

export async function fetchMembers(): Promise<Player[]> {
  const { data, error } = await supabase.from('members').select(COLUMNS).order('back_number', { nullsFirst: false }).order('name')
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
