import { useCallback, useEffect, useState } from 'react'
import { Accordion, ActionIcon, Badge, Button, Card, Group, Menu, Stack, Text } from '@mantine/core'
import { IconCopy, IconDots, IconLink, IconRefresh, IconRotate } from '@tabler/icons-react'
import type { Player } from '../entities/player'
import type { SeasonBundle } from '../entities/season'
import { TEAM_COLORS } from '../features/build-teams'
import type { InviteRow } from '../features/invite/api'
import { LEADER_ROLE_LABEL, fetchInvites, inviteUrl, regenerateInvite } from '../features/invite/api'
import { confirmAction, copyText, notify } from '../shared/ui/feedback'

/** 운영진 전용: 팀장·부팀장 초대 링크 복사·가입 현황·재발급 */
export function InvitePanel({ bundle, members }: { bundle: SeasonBundle; members: Player[] }) {
  const [rows, setRows] = useState<InviteRow[]>([])
  const load = useCallback(() => { fetchInvites().then(setRows).catch((e) => notify.error((e as Error).message)) }, [])
  useEffect(() => { load() }, [load])

  const teamOf = (id: string) => bundle.teams.find((t) => t.id === id)
  const nameOf = (id?: string) => members.find((m) => m.id === id)?.name ?? '-'
  const sorted = rows
    .filter((r) => teamOf(r.seasonTeamId))
    .sort((a, b) => teamOf(a.seasonTeamId)!.slot - teamOf(b.seasonTeamId)!.slot || (a.role === 'CAPTAIN' ? -1 : 1))
  const joined = sorted.filter((r) => r.claimedEmail).length
  const pending = sorted.filter((r) => !r.claimedEmail)

  const allText = () => [
    `⚽ ${bundle.season.name} 팀장·부팀장 가입 링크`,
    ...pending.map((r) => `${teamOf(r.seasonTeamId)!.name} ${LEADER_ROLE_LABEL[r.role]} ${nameOf(r.memberId)}\n${inviteUrl(r.token)}`),
  ].join('\n\n')

  const regen = async (r: InviteRow) => {
    const ok = await confirmAction({
      title: `${nameOf(r.memberId)} 링크를 재발급할까요?`,
      message: '기존 링크는 더 이상 쓸 수 없습니다. 이미 가입한 계정의 권한은 유지됩니다.',
      confirmLabel: '재발급',
    })
    if (!ok) return
    try { await regenerateInvite(r.token); notify.ok('새 링크를 만들었습니다.'); load() }
    catch (e) { notify.error((e as Error).message) }
  }

  return (
    <Card padding={0}>
      <Accordion chevronPosition="right">
        <Accordion.Item value="invites" style={{ borderBottom: 0 }}>
          <Accordion.Control icon={<IconLink size={20} color="var(--mantine-color-brand-8)" />}>
            <Group gap={8}><Text fw={800}>팀장·부팀장 초대 링크</Text><Badge variant="light" size="sm" color={joined === sorted.length ? 'brand' : 'orange'}>가입 {joined}/{sorted.length}</Badge></Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Group gap="xs">
                <Button size="sm" leftSection={<IconCopy size={16} />} disabled={!pending.length} onClick={() => copyText(allText(), `미가입 ${pending.length}명 링크를 복사했습니다.`)}>
                  미가입자 링크 전체 복사
                </Button>
                <ActionIcon variant="default" size={36} onClick={load} aria-label="새로고침"><IconRefresh size={16} /></ActionIcon>
              </Group>
              <Text size="xs" c="dimmed">링크 하나에 계정 하나만 등록됩니다. 각자에게 개인 톡으로 보내는 것을 추천해요.</Text>
              <Stack gap={6}>
                {sorted.map((r) => {
                  const t = teamOf(r.seasonTeamId)!
                  const color = TEAM_COLORS[t.slot].mantine
                  return (
                    <Group key={r.token} justify="space-between" wrap="nowrap" p="xs" style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 10, borderLeft: `4px solid ${TEAM_COLORS[t.slot].hex}` }}>
                      <div style={{ minWidth: 0 }}>
                        <Group gap={6} wrap="nowrap">
                          <Text fw={800} size="sm">{nameOf(r.memberId)}</Text>
                          <Badge size="xs" variant="light" color={color}>{t.name} {LEADER_ROLE_LABEL[r.role]}</Badge>
                        </Group>
                        {r.claimedEmail
                          ? <Text size="xs" c="brand" fw={700} truncate>가입 완료 · {r.claimedEmail}</Text>
                          : <Text size="xs" c="dimmed">대기 중</Text>}
                      </div>
                      <Group gap={4} wrap="nowrap">
                        {!r.claimedEmail && (
                          <Button size="xs" variant="light" leftSection={<IconCopy size={14} />} onClick={() => copyText(inviteUrl(r.token), `${nameOf(r.memberId)} 링크를 복사했습니다.`)}>복사</Button>
                        )}
                        <Menu position="bottom-end">
                          <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label="더보기"><IconDots size={16} /></ActionIcon></Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => copyText(inviteUrl(r.token), '링크를 복사했습니다.')}>링크 복사</Menu.Item>
                            <Menu.Item leftSection={<IconRotate size={14} />} color="red" onClick={() => regen(r)}>재발급</Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
                    </Group>
                  )
                })}
              </Stack>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Card>
  )
}
