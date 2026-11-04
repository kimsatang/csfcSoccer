import { useEffect, useState } from 'react'
import { Alert, Anchor, Button, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconAlertTriangle, IconMail, IconMailCheck } from '@tabler/icons-react'
import type { InviteInfo } from '../invite/api'
import { LEADER_ROLE_LABEL, fetchInviteInfo, readInviteToken } from '../invite/api'
import { linkError } from '../../shared/api/supabase'
import { AuthLayout } from './AuthLayout'
import { sendMagicLink, signOut, verifyEmailCode } from './useAuth'

/** Supabase 프로젝트 설정(Email OTP Length)에 따라 6~10자리 */
const CODE_MIN = 6
const CODE_MAX = 10

export function LoginScreen({ forbiddenEmail }: { forbiddenEmail?: string }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(linkError ?? '')
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [token] = useState(readInviteToken)
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [inviteMissing, setInviteMissing] = useState(false)

  useEffect(() => {
    if (!token) return
    fetchInviteInfo(token)
      .then((info) => (info ? setInvite(info) : setInviteMissing(true)))
      .catch(() => setInviteMissing(true))
  }, [token])

  if (forbiddenEmail) {
    return (
      <AuthLayout>
        <Alert color="orange" icon={<IconAlertTriangle size={18} />} title="등록되지 않은 계정">
          <b>{forbiddenEmail}</b> 계정은 운영진이나 팀장으로 등록되어 있지 않습니다.
        </Alert>
        <Text size="sm" c="dimmed">팀장·부팀장은 운영진에게 받은 <b>초대 링크</b>로 들어와 로그인하세요.</Text>
        <Button variant="default" onClick={() => signOut()}>다른 계정으로 로그인</Button>
      </AuthLayout>
    )
  }

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setBusy(true); setError('')
    try { await sendMagicLink(email, token); setSent(true); setCode('') }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  const verify = async (value = code) => {
    if (value.length < CODE_MIN) return
    setBusy(true); setError('')
    // 성공하면 onAuthStateChange가 화면을 바꾼다 (초대 토큰은 주소에 남아 있어 등록 확인으로 이어짐)
    try { await verifyEmailCode(email, value) }
    catch (err) { setError((err as Error).message); setCode('') }
    finally { setBusy(false) }
  }

  return (
    <AuthLayout>
      {invite ? (
        <Paper p="md" radius="md" bg="brand.0" withBorder style={{ borderColor: 'var(--mantine-color-brand-2)' }}>
          <Text size="xs" c="dimmed">{invite.seasonName}</Text>
          <Title order={4} mt={4}>{invite.teamName} {LEADER_ROLE_LABEL[invite.role]}{invite.memberName && ` · ${invite.memberName}`}</Title>
          <Text size="sm" mt={6}>초대 링크입니다. 이메일 인증으로 가입하면 팀 관리 권한이 연결됩니다.</Text>
          {invite.claimed && <Text size="sm" c="orange" fw={700} mt={6}>이미 가입된 링크입니다. 가입한 이메일로 로그인하세요.</Text>}
        </Paper>
      ) : inviteMissing ? (
        <Alert color="red" title="초대 링크 오류">초대 링크가 만료되었거나 잘못되었습니다. 운영진에게 새 링크를 요청하세요.</Alert>
      ) : (
        <Stack gap={4}>
          <Title order={3}>로그인</Title>
          <Text size="sm" c="dimmed">운영진·팀장 전용입니다. 이메일로 받은 인증번호로 로그인해요.</Text>
        </Stack>
      )}

      {!sent ? (
        <form onSubmit={send}>
          <Stack gap="sm">
            <TextInput
              type="email" required size="md" label="이메일" placeholder="name@example.com" autoComplete="email"
              leftSection={<IconMail size={18} />} value={email} onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <Button type="submit" size="md" loading={busy} fullWidth>
              {invite ? '가입하고 인증번호 받기' : '인증번호 받기'}
            </Button>
          </Stack>
        </form>
      ) : (
        <Stack gap="md">
          <Alert color="brand" icon={<IconMailCheck size={18} />} variant="light">
            <b>{email}</b>로 메일을 보냈어요. 메일의 <b>인증번호(숫자 전체)</b>를 입력하세요. (스팸함도 확인)
          </Alert>
          <form onSubmit={(e) => { e.preventDefault(); void verify() }}>
            <Stack gap="sm">
              <TextInput
                size="lg" label="인증번호" placeholder="숫자만 입력" autoFocus
                inputMode="numeric" autoComplete="one-time-code" maxLength={CODE_MAX}
                value={code} onChange={(e) => setCode(e.currentTarget.value.replace(/\D/g, '').slice(0, CODE_MAX))}
                disabled={busy}
                styles={{ input: { textAlign: 'center', letterSpacing: '0.3em', fontWeight: 700, fontSize: 24 } }}
              />
              <Button type="submit" size="md" fullWidth loading={busy} disabled={code.length < CODE_MIN}>로그인</Button>
            </Stack>
          </form>
          <Text size="xs" c="dimmed" ta="center">
            링크를 누르면 다른 앱 브라우저에서 열릴 수 있어요. 이 화면에 번호를 입력하는 걸 권장해요.<br />
            <Anchor size="xs" onClick={() => { setSent(false); setCode(''); setError('') }}>이메일 다시 입력</Anchor>{' · '}
            <Anchor size="xs" onClick={() => void send()}>재전송</Anchor>
          </Text>
        </Stack>
      )}
      {error && <Alert color="red" variant="light">{error}</Alert>}
    </AuthLayout>
  )
}
