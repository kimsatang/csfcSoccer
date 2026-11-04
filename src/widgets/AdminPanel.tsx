import { useCallback, useEffect, useState } from 'react'
import { Accordion, ActionIcon, Badge, Button, Card, Group, Stack, Text, TextInput } from '@mantine/core'
import { IconShieldLock, IconTrash, IconUserPlus } from '@tabler/icons-react'
import type { AdminRow } from '../features/auth/adminsApi'
import { addAdmin, fetchAdmins, removeAdmin } from '../features/auth/adminsApi'
import { confirmAction, notify } from '../shared/ui/feedback'

/** 슈퍼 관리자 전용: 운영진(관리자) 추가·삭제 */
export function AdminPanel() {
  const [rows, setRows] = useState<AdminRow[]>([])
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => { fetchAdmins().then(setRows).catch((e) => notify.error((e as Error).message)) }, [])
  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try { await addAdmin(email, name); setEmail(''); setName(''); notify.ok('운영진을 추가했습니다.'); load() }
    catch (err) { notify.error((err as Error).message) }
    finally { setBusy(false) }
  }
  const remove = async (r: AdminRow) => {
    if (!(await confirmAction({ title: `${r.name ?? r.email} 운영진을 삭제할까요?`, confirmLabel: '삭제', danger: true }))) return
    try { await removeAdmin(r.email); notify.ok('삭제했습니다.'); load() }
    catch (e) { notify.error((e as Error).message) }
  }

  return (
    <Card padding={0}>
      <Accordion variant="default" chevronPosition="right">
        <Accordion.Item value="admins" style={{ borderBottom: 0 }}>
          <Accordion.Control icon={<IconShieldLock size={20} color="var(--mantine-color-brand-8)" />}>
            <Group gap={8}><Text fw={800}>운영진 관리</Text><Badge variant="light" size="sm">{rows.length}명</Badge><Text size="xs" c="dimmed">슈퍼 관리자 전용</Text></Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <form onSubmit={add}>
                <Group gap="xs" align="flex-end" wrap="wrap">
                  <TextInput type="email" required label="이메일" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.currentTarget.value)} style={{ flex: 2, minWidth: 180 }} />
                  <TextInput label="이름" value={name} onChange={(e) => setName(e.currentTarget.value)} style={{ flex: 1, minWidth: 100 }} />
                  <Button type="submit" loading={busy} leftSection={<IconUserPlus size={16} />}>추가</Button>
                </Group>
              </form>
              <Stack gap={6}>
                {rows.map((r) => (
                  <Group key={r.email} justify="space-between" wrap="nowrap" p="xs" style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <Group gap={6}><Text fw={700} size="sm">{r.name ?? '-'}</Text>{r.role === 'SUPER' && <Badge size="xs">슈퍼 관리자</Badge>}</Group>
                      <Text size="xs" c="dimmed" truncate>{r.email}</Text>
                    </div>
                    {r.role !== 'SUPER' && <ActionIcon variant="subtle" color="red" onClick={() => remove(r)} aria-label="삭제"><IconTrash size={16} /></ActionIcon>}
                  </Group>
                ))}
              </Stack>
              <Text size="xs" c="dimmed">추가된 운영진은 이메일 인증번호로 로그인하면 바로 운영진 화면을 씁니다.</Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Card>
  )
}
