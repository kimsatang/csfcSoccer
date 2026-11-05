import { useMemo, useState } from 'react'
import { Alert, Badge, Button, Group, Modal, SegmentedControl, Stack, Text, Textarea } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import type { Player } from '../../entities/player'
import { parseNames } from './parseNames'

type Mode = 'replace' | 'add'

interface Props {
  opened: boolean
  onClose: () => void
  /** 전체 회원 (휴면 포함 — 휴면 회원 이름을 따로 알려 주기 위해) */
  members: Player[]
  /** 현재 체크된 참석자 */
  current: string[]
  /** 회원 id → 팀 색 (mantine color) */
  teamColor: (id: string) => string | undefined
  onApply: (ids: string[]) => void
}

/** 카톡 투표 결과·이름 목록을 붙여넣어 참석 체크 */
export function PasteAttendance({ opened, onClose, members, current, teamColor, onApply }: Props) {
  const isMobile = useMediaQuery('(max-width: 48em)', true)
  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>('replace')

  const result = useMemo(() => parseNames(text, members), [text, members])
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const found = result.ids.map((id) => byId.get(id)!).filter(Boolean)
  const activeFound = found.filter((m) => m.status === 'ACTIVE')
  const inactiveFound = found.filter((m) => m.status !== 'ACTIVE')
  const absent = result.absentIds.map((id) => byId.get(id)!).filter(Boolean)
  const next = mode === 'replace'
    ? activeFound.map((m) => m.id)
    : [...current, ...activeFound.map((m) => m.id).filter((id) => !current.includes(id))]
  const added = next.filter((id) => !current.includes(id)).length
  const removed = current.filter((id) => !next.includes(id)).length

  const close = () => { setText(''); onClose() }
  const apply = () => { onApply(next); close() }

  return (
    <Modal opened={opened} onClose={close} title={<Text fw={800}>명단 붙여넣기로 참석 체크</Text>} size="lg" fullScreen={isMobile}>
      <Stack gap="sm">
        <Textarea
          autosize minRows={5} maxRows={12} autoFocus
          placeholder={'카톡 투표 결과나 이름 목록을 붙여넣으세요\n예) 김동인, 조인규\n1. 남상혁님\n2. 이강재(86)'}
          value={text} onChange={(e) => setText(e.currentTarget.value)}
        />
        <Text size="xs" c="dimmed">
          줄바꿈·쉼표 등 아무 구분이나 괜찮아요. 번호·호칭·년생은 무시하고, "불참" 줄이나 불참 항목 아래 이름은 빼요.
        </Text>

        {text.trim() && (
          <>
            <div>
              <Text size="sm" fw={800} mb={6}>찾은 회원 <Text span c="brand" fw={800}>{activeFound.length}명</Text></Text>
              {activeFound.length === 0
                ? <Text size="sm" c="dimmed">일치하는 회원이 없어요.</Text>
                : (
                  <Group gap={4}>
                    {activeFound.map((m) => (
                      <Badge key={m.id} variant="light" color={teamColor(m.id) ?? 'gray'} tt="none" size="md">{m.name}</Badge>
                    ))}
                  </Group>
                )}
            </div>
            {result.unknown.length > 0 && (
              <Alert color="orange" variant="light" p="xs" title={`회원 목록에 없는 이름 ${result.unknown.length}개`}>
                <Text size="sm">{result.unknown.join(', ')}</Text>
                <Text size="xs" c="dimmed" mt={4}>오타이거나 용병일 수 있어요. 회원이면 회원 탭에서 이름을 확인하세요.</Text>
              </Alert>
            )}
            {inactiveFound.length > 0 && (
              <Alert color="gray" variant="light" p="xs" title="휴면 회원 (체크하지 않음)">
                <Text size="sm">{inactiveFound.map((m) => m.name).join(', ')}</Text>
              </Alert>
            )}
            {absent.length > 0 && (
              <Text size="xs" c="dimmed">불참으로 보고 뺀 이름: {absent.map((m) => m.name).join(', ')}</Text>
            )}

            <SegmentedControl
              fullWidth value={mode} onChange={(v) => setMode(v as Mode)}
              data={[{ value: 'replace', label: '이 명단으로 바꾸기' }, { value: 'add', label: '기존 체크에 추가' }]}
            />
            <Text size="xs" c="dimmed" ta="center">
              적용하면 참석 {next.length}명 (추가 {added}{mode === 'replace' ? ` · 해제 ${removed}` : ''})
            </Text>
          </>
        )}

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={close}>취소</Button>
          <Button disabled={!text.trim() || (activeFound.length === 0 && mode === 'add')} onClick={apply}>참석 체크 적용</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
