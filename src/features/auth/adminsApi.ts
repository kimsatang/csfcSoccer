import { supabase } from '../../shared/api/supabase'

export interface AdminRow { email: string; name?: string; role: 'SUPER' | 'ADMIN' }

export async function fetchAdmins(): Promise<AdminRow[]> {
  const { data, error } = await supabase.from('admins').select('email,name,role').order('role', { ascending: false }).order('created_at')
  if (error) throw error
  return (data ?? []).map((r) => ({ email: r.email, name: r.name ?? undefined, role: r.role }))
}

/** 슈퍼 관리자만 가능 (RLS) */
export async function addAdmin(email: string, name?: string): Promise<void> {
  const { error } = await supabase.from('admins').insert({ email: email.trim().toLowerCase(), name: name?.trim() || null })
  if (error) throw new Error(error.code === '23505' ? '이미 등록된 운영진입니다.' : error.message)
}

/** 슈퍼 관리자만 가능, 슈퍼 관리자 행은 삭제 불가 (RLS) */
export async function removeAdmin(email: string): Promise<void> {
  const { error } = await supabase.from('admins').delete().eq('email', email)
  if (error) throw error
}
