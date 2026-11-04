import { useState } from 'react'
import { Alert, Button, Paper, Stack, Text, Title } from '@mantine/core'
import { IconUserCheck } from '@tabler/icons-react'
import { AuthLayout } from '../auth/AuthLayout'
import { signOut } from '../auth/useAuth'
import type { InviteInfo } from './api'
import { LEADER_ROLE_LABEL, claimInvite, clearInviteToken } from './api'

export function InviteConfirm({ email, token, info, onDone }: {
  email: string; token: string; info: InviteInfo | null; onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const accept = async () => {
    setBusy(true); setError('')
    try { await claimInvite(token); clearInviteToken(); onDone() }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  const skip = () => { clearInviteToken(); onDone() }

  return (
    <AuthLayout>
      {info ? (
        <Paper p="md" radius="md" bg="brand.0" withBorder style={{ borderColor: 'var(--mantine-color-brand-2)' }}>
          <Text size="xs" c="dimmed">{info.seasonName}</Text>
          <Title order={4} mt={4}>{info.teamName} {LEADER_ROLE_LABEL[info.role]}{info.memberName && ` · ${info.memberName}`}</Title>
          <Text size="sm" mt={8}><b>{email}</b> 계정을 이 팀의 {LEADER_ROLE_LABEL[info.role]}으로 등록합니다.</Text>
          <Text size="xs" c="dimmed" mt={6}>본인 링크가 맞는지 확인하세요. 등록하면 다른 계정은 이 링크를 쓸 수 없습니다.</Text>
        </Paper>
      ) : (
        <Alert color="red" title="초대 링크 오류">초대 링크가 만료되었거나 잘못되었습니다. 운영진에게 새 링크를 요청하세요.</Alert>
      )}
      {error && <Alert color="red" variant="light">{error}</Alert>}
      <Stack gap="xs">
        {info && <Button size="md" leftSection={<IconUserCheck size={18} />} loading={busy} onClick={accept}>등록하고 시작하기</Button>}
        <Button size="md" variant="default" disabled={busy} onClick={skip}>등록하지 않고 계속</Button>
        <Button size="md" variant="subtle" color="gray" disabled={busy} onClick={() => signOut()}>다른 이메일로 로그인</Button>
      </Stack>
    </AuthLayout>
  )
}
