import { useMemo, useState } from 'react'
import type { Dispatch } from 'react'
import {
  ActionIcon, Alert, Badge, Button, Card, Chip, Drawer, Group, Menu, Modal, NativeSelect, Paper, SegmentedControl, Stack, Switch,
  Table, Text, TextInput, Textarea, Title,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconDots, IconFileImport, IconFileExport, IconPencil, IconPlus, IconRefresh, IconSearch, IconTrash, IconUsersPlus } from '@tabler/icons-react'
import type { Action } from '../app/store'
import type { AttendanceLevel, Player, Position } from '../entities/player'
import {
  ATTENDANCE_LABEL, ATTENDANCE_LEVELS, CSV_TEMPLATE, POSITIONS, POSITION_LABEL, SAMPLE_MEMBERS, SKILL_MAX, SKILL_MIN,
  membersToCsv, parseBirthYear, parseMembersCsv, shortYear,
} from '../entities/player'
import { deleteMember, insertMembers, updateMember, upsertMembersByName } from '../entities/player/api'
import { MissingBadge } from '../shared/ui/badges'
import { confirmAction, copyText, notify } from '../shared/ui/feedback'

interface Props {
  members: Player[]
  dispatch: Dispatch<Action>
  onReload: () => void
  /** 회원 삭제: 슈퍼관리자만 (운영진은 휴면) */
  canDelete: boolean
}

const stripId = ({ id: _id, ...rest }: Player): Omit<Player, 'id'> => { void _id; return rest }
const SKILL_OPTIONS = Array.from({ length: SKILL_MAX - SKILL_MIN + 1 }, (_, i) => String(SKILL_MAX - i))
const isMissing = (m: Player) => Boolean(m.needsReview || m.positionReview || !m.attendanceLevel)

export function MemberManager({ members, dispatch, onReload, canDelete }: Props) {
  const isMobile = useMediaQuery('(max-width: 48em)', true)
  const [query, setQuery] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [editing, setEditing] = useState<Player | 'new' | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())

  /** 빠른 입력: 화면 먼저 바꾸고 저장 — 실패하면 되돌림 */
  const quickUpdate = (m: Player, patch: Partial<Player>) => {
    const next = { ...m, ...patch }
    dispatch({ type: 'member/update', player: next })
    setSavingIds((s) => new Set(s).add(m.id))
    updateMember(next)
      .then((saved) => dispatch({ type: 'member/update', player: saved }))
      .catch((e) => { dispatch({ type: 'member/update', player: m }); notify.error(`${m.name} 저장 실패: ${(e as Error).message}`) })
      .finally(() => setSavingIds((s) => { const n = new Set(s); n.delete(m.id); return n }))
  }

  const filtered = useMemo(
    () => members.filter((m) => m.name.includes(query.trim())).filter((m) => !onlyMissing || isMissing(m)),
    [members, query, onlyMissing],
  )
  const activeCount = members.filter((m) => m.status === 'ACTIVE').length
  const missingCount = members.filter(isMissing).length

  const addSamples = async () => {
    if (!(await confirmAction({ title: '샘플 회원 24명을 넣을까요?' }))) return
    try { dispatch({ type: 'member/append', players: await insertMembers(SAMPLE_MEMBERS.map(stripId)) }); notify.ok('샘플 회원을 넣었습니다.') }
    catch (e) { notify.error((e as Error).message) }
  }

  return (
    <Stack gap="sm">
      <Card padding="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Title order={3}>회원</Title>
            <Group gap={6} mt={6}>
              <Badge variant="light" color="gray">전체 {members.length}</Badge>
              <Badge variant="light">활동 {activeCount}</Badge>
              {missingCount > 0 && <Badge variant="light" color="orange">미입력 {missingCount}</Badge>}
            </Group>
          </div>
          <Group gap={6} wrap="nowrap">
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')} size={isMobile ? 'sm' : 'sm'}>
              {isMobile ? '추가' : '회원 추가'}
            </Button>
            <Menu position="bottom-end" shadow="md">
              <Menu.Target><ActionIcon variant="default" size={36} aria-label="더보기"><IconDots size={18} /></ActionIcon></Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconFileImport size={16} />} onClick={() => setCsvOpen(true)}>CSV·엑셀 불러오기</Menu.Item>
                <Menu.Item leftSection={<IconFileExport size={16} />} disabled={!members.length} onClick={() => copyText(membersToCsv(members), 'CSV를 클립보드에 복사했습니다.')}>CSV 내보내기(복사)</Menu.Item>
                <Menu.Item leftSection={<IconRefresh size={16} />} onClick={onReload}>새로고침</Menu.Item>
                {members.length === 0 && <Menu.Item leftSection={<IconUsersPlus size={16} />} onClick={addSamples}>샘플 데이터 넣기</Menu.Item>}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        <Group mt="md" gap="sm" wrap="wrap">
          <TextInput
            placeholder="이름 검색" leftSection={<IconSearch size={16} />} value={query} onChange={(e) => setQuery(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 160 }}
          />
          <Chip checked={onlyMissing} onChange={setOnlyMissing} color="orange" variant="light">미입력만 ({missingCount})</Chip>
        </Group>
        <Text size="xs" c="dimmed" mt={6}>포지션·실력·참석률은 목록에서 바로 고르면 자동 저장됩니다.</Text>
      </Card>

      {members.length === 0 ? (
        <Alert color="gray">아직 등록된 회원이 없습니다. <b>회원 추가</b>나 <b>CSV 불러오기</b>로 시작하세요.</Alert>
      ) : isMobile ? (
        <Stack gap={8}>
          {filtered.map((m) => (
            <MemberCard key={m.id} m={m} saving={savingIds.has(m.id)} onQuick={(p) => quickUpdate(m, p)} onEdit={() => setEditing(m)} />
          ))}
        </Stack>
      ) : (
        <Card padding={0}>
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing={6} highlightOnHover striped={false}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={56}>년생</Table.Th><Table.Th>이름</Table.Th><Table.Th w={110}>주포지션</Table.Th><Table.Th w={110}>부포지션</Table.Th>
                  <Table.Th w={100}>실력</Table.Th><Table.Th w={100}>참석률</Table.Th><Table.Th w={70}>상태</Table.Th><Table.Th>메모</Table.Th><Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((m) => (
                  <Table.Tr key={m.id} style={{ opacity: m.status === 'INACTIVE' ? 0.5 : 1 }}>
                    <Table.Td className="tnum">{shortYear(m.birthYear)}</Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Text fw={700} size="sm">{m.name}</Text>
                        {m.backNumber != null && <Text size="xs" c="dimmed">#{m.backNumber}</Text>}
                        {savingIds.has(m.id) && <Text size="xs" c="dimmed">저장…</Text>}
                      </Group>
                    </Table.Td>
                    <Table.Td><QuickSelects m={m} which="main" onQuick={(p) => quickUpdate(m, p)} /></Table.Td>
                    <Table.Td><QuickSelects m={m} which="sub" onQuick={(p) => quickUpdate(m, p)} /></Table.Td>
                    <Table.Td><QuickSelects m={m} which="skill" onQuick={(p) => quickUpdate(m, p)} /></Table.Td>
                    <Table.Td><QuickSelects m={m} which="att" onQuick={(p) => quickUpdate(m, p)} /></Table.Td>
                    <Table.Td>
                      <Switch size="xs" checked={m.status === 'ACTIVE'} onChange={(e) => quickUpdate(m, { status: e.currentTarget.checked ? 'ACTIVE' : 'INACTIVE' })} aria-label={`${m.name} 활동`} />
                    </Table.Td>
                    <Table.Td><Text size="xs" c="dimmed" lineClamp={1}>{m.memo}</Text></Table.Td>
                    <Table.Td>
                      <ActionIcon variant="subtle" color="gray" onClick={() => setEditing(m)} aria-label={`${m.name} 수정`}><IconPencil size={16} /></ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}
      {filtered.length === 0 && members.length > 0 && <Text c="dimmed" ta="center" py="md">조건에 맞는 회원이 없습니다.</Text>}

      <MemberEditor
        opened={editing !== null}
        member={editing === 'new' ? null : editing}
        members={members}
        isMobile={isMobile}
        canDelete={canDelete}
        onClose={() => setEditing(null)}
        dispatch={dispatch}
      />
      <CsvImport opened={csvOpen} onClose={() => setCsvOpen(false)} members={members} dispatch={dispatch} />
    </Stack>
  )
}

/** 모바일 회원 카드: 이름 탭 → 편집, 아래 3개 셀렉트로 빠른 입력 */
function MemberCard({ m, saving, onQuick, onEdit }: { m: Player; saving: boolean; onQuick: (p: Partial<Player>) => void; onEdit: () => void }) {
  return (
    <Paper p="sm" withBorder className={`member-card ${m.status === 'INACTIVE' ? 'inactive' : ''}`}>
      <Group justify="space-between" wrap="nowrap" onClick={onEdit} style={{ cursor: 'pointer' }}>
        <Group gap={8} wrap="nowrap" miw={0}>
          <Text fw={800} truncate>{m.name}</Text>
          <span className="year">{shortYear(m.birthYear)}</span>
          {m.backNumber != null && <Text size="xs" c="dimmed">#{m.backNumber}</Text>}
          {m.status === 'INACTIVE' && <Badge size="xs" color="gray">휴면</Badge>}
          {m.memo && <Badge size="xs" variant="outline" color="gray">{m.memo}</Badge>}
        </Group>
        <Group gap={4} wrap="nowrap">
          {saving && <Text size="xs" c="dimmed">저장…</Text>}
          <IconPencil size={16} color="var(--mantine-color-gray-5)" />
        </Group>
      </Group>
      <Group gap={6} mt={8} grow wrap="nowrap">
        <QuickSelects m={m} which="main" onQuick={onQuick} />
        <QuickSelects m={m} which="skill" onQuick={onQuick} />
        <QuickSelects m={m} which="att" onQuick={onQuick} />
      </Group>
    </Paper>
  )
}

function QuickSelects({ m, which, onQuick }: { m: Player; which: 'main' | 'sub' | 'skill' | 'att'; onQuick: (p: Partial<Player>) => void }) {
  const common = { size: 'xs' as const, radius: 'md' as const }
  const missingStyle = { input: { background: 'var(--mantine-color-orange-0)', borderColor: 'var(--mantine-color-orange-3)', color: 'var(--mantine-color-orange-8)', fontWeight: 700 } }
  if (which === 'main') {
    return (
      <NativeSelect
        {...common} aria-label={`${m.name} 주포지션`} styles={m.positionReview ? missingStyle : { input: { fontWeight: 700 } }}
        value={m.positionReview ? '' : m.mainPosition}
        onChange={(e) => e.currentTarget.value && onQuick({ mainPosition: e.currentTarget.value as Position, positionReview: false })}
        data={[...(m.positionReview ? [{ value: '', label: '포지션 -' }] : []), ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABEL[p] }))]}
      />
    )
  }
  if (which === 'sub') {
    return (
      <NativeSelect
        {...common} aria-label={`${m.name} 부포지션`} value={m.subPosition ?? ''}
        onChange={(e) => onQuick({ subPosition: (e.currentTarget.value || undefined) as Position | undefined })}
        data={[{ value: '', label: '-' }, ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABEL[p] }))]}
      />
    )
  }
  if (which === 'skill') {
    return (
      <NativeSelect
        {...common} aria-label={`${m.name} 실력`} styles={m.needsReview ? missingStyle : { input: { fontWeight: 700 } }}
        value={m.needsReview ? '' : String(m.skill)}
        onChange={(e) => e.currentTarget.value && onQuick({ skill: Number(e.currentTarget.value), needsReview: false })}
        data={[...(m.needsReview ? [{ value: '', label: '실력 -' }] : []), ...SKILL_OPTIONS.map((v) => ({ value: v, label: `실력 ${v}` }))]}
      />
    )
  }
  return (
    <NativeSelect
      {...common} aria-label={`${m.name} 참석률`} styles={!m.attendanceLevel ? missingStyle : { input: { fontWeight: 700 } }}
      value={m.attendanceLevel ?? ''}
      onChange={(e) => onQuick({ attendanceLevel: (e.currentTarget.value || undefined) as AttendanceLevel | undefined })}
      data={[{ value: '', label: '참석 -' }, ...ATTENDANCE_LEVELS.map((l) => ({ value: l, label: `참석 ${ATTENDANCE_LABEL[l]}` }))]}
    />
  )
}

/** 회원 추가·수정 (모바일: 아래에서 올라오는 시트) */
function MemberEditor({ opened, member, members, isMobile, canDelete, onClose, dispatch }: {
  opened: boolean; member: Player | null; members: Player[]; isMobile: boolean; canDelete: boolean; onClose: () => void; dispatch: Dispatch<Action>
}) {
  const key = member?.id ?? 'new'
  return (
    <Drawer
      opened={opened} onClose={onClose} position={isMobile ? 'bottom' : 'right'} size={isMobile ? '92%' : 420}
      title={<Text fw={800} size="lg">{member ? `${member.name} 수정` : '회원 추가'}</Text>}
    >
      {opened && <EditorForm key={key} member={member} members={members} canDelete={canDelete} onClose={onClose} dispatch={dispatch} />}
    </Drawer>
  )
}

function EditorForm({ member, members, canDelete, onClose, dispatch }: { member: Player | null; members: Player[]; canDelete: boolean; onClose: () => void; dispatch: Dispatch<Action> }) {
  const [name, setName] = useState(member?.name ?? '')
  const [year, setYear] = useState(member?.birthYear ? shortYear(member.birthYear) : '')
  const [no, setNo] = useState(member?.backNumber != null ? String(member.backNumber) : '')
  const [main, setMain] = useState<string>(member && !member.positionReview ? member.mainPosition : '')
  const [sub, setSub] = useState<string>(member?.subPosition ?? '')
  const [skill, setSkill] = useState<string>(member && !member.needsReview ? String(member.skill) : '')
  const [att, setAtt] = useState<string>(member?.attendanceLevel ?? '')
  const [active, setActive] = useState(member ? member.status === 'ACTIVE' : true)
  const [memo, setMemo] = useState(member?.memo ?? '')
  const [busy, setBusy] = useState(false)
  const dup = !member && members.some((m) => m.name === name.trim())

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    const body: Omit<Player, 'id'> = {
      name: name.trim(),
      birthYear: parseBirthYear(year),
      backNumber: no ? Number(no) : undefined,
      mainPosition: (main || member?.mainPosition || 'MF') as Position,
      positionReview: !main,
      subPosition: (sub || undefined) as Position | undefined,
      skill: skill ? Number(skill) : member?.skill ?? 5,
      needsReview: !skill,
      attendanceLevel: (att || undefined) as AttendanceLevel | undefined,
      status: active ? 'ACTIVE' : 'INACTIVE',
      memo: memo.trim() || undefined,
    }
    try {
      if (member) dispatch({ type: 'member/update', player: await updateMember({ ...body, id: member.id }) })
      else dispatch({ type: 'member/append', players: await insertMembers([body]) })
      notify.ok(`${body.name} ${member ? '수정' : '추가'}했습니다.`)
      onClose()
    } catch (e) { notify.error((e as Error).message) }
    finally { setBusy(false) }
  }

  const remove = async () => {
    if (!member) return
    const ok = await confirmAction({
      title: `${member.name} 회원을 삭제할까요?`,
      message: '드래프트·경기 기록에서도 빠집니다. 기록을 남기려면 삭제 대신 휴면으로 바꾸세요.',
      confirmLabel: '삭제', danger: true,
    })
    if (!ok) return
    try { await deleteMember(member.id); dispatch({ type: 'member/remove', id: member.id }); notify.ok('삭제했습니다.'); onClose() }
    catch (e) { notify.error((e as Error).message) }
  }

  const posData = [{ value: '', label: '미입력' }, ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABEL[p] }))]
  return (
    <Stack gap="md" pb="xl">
      <TextInput label="이름" required size="md" value={name} onChange={(e) => setName(e.currentTarget.value)} error={dup ? '같은 이름이 있습니다' : undefined} />
      <Group grow>
        <TextInput label="년생" placeholder="예: 87" inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.currentTarget.value.replace(/[^0-9]/g, ''))} />
        <TextInput label="등번호" inputMode="numeric" value={no} onChange={(e) => setNo(e.currentTarget.value.replace(/[^0-9]/g, ''))} />
      </Group>
      <div>
        <Text size="sm" fw={500} mb={4}>주포지션</Text>
        <SegmentedControl fullWidth value={main} onChange={setMain} data={posData} />
      </div>
      <div>
        <Text size="sm" fw={500} mb={4}>부포지션</Text>
        <SegmentedControl fullWidth value={sub} onChange={setSub} data={[{ value: '', label: '없음' }, ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABEL[p] }))]} />
      </div>
      <Group grow>
        <NativeSelect label="실력 (1~10)" value={skill} onChange={(e) => setSkill(e.currentTarget.value)} data={[{ value: '', label: '미입력' }, ...SKILL_OPTIONS]} />
        <NativeSelect label="참석률" value={att} onChange={(e) => setAtt(e.currentTarget.value)} data={[{ value: '', label: '미입력' }, ...ATTENDANCE_LEVELS.map((l) => ({ value: l, label: ATTENDANCE_LABEL[l] }))]} />
      </Group>
      <Textarea label="메모" autosize minRows={1} value={memo} onChange={(e) => setMemo(e.currentTarget.value)} placeholder="예: 회장, 주말만 가능" />
      <Switch label="활동 회원 (끄면 휴면 — 참석·지명 목록에서 빠짐)" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />
      {member && !canDelete && <Text size="xs" c="dimmed">회원 삭제는 슈퍼관리자만 할 수 있어요. 활동하지 않는 회원은 휴면으로 바꿔 주세요.</Text>}
      {(!main || !skill) && <Group gap={6}><MissingBadge label={!main && !skill ? '포지션·실력 미입력' : !main ? '포지션 미입력' : '실력 미입력'} /><Text size="xs" c="dimmed">비워 두면 통계에서 빠집니다</Text></Group>}
      <Group grow mt="sm">
        {member && canDelete && <Button variant="light" color="red" leftSection={<IconTrash size={16} />} onClick={remove}>삭제</Button>}
        <Button size="md" loading={busy} disabled={!name.trim()} onClick={save}>{member ? '저장' : '추가'}</Button>
      </Group>
    </Stack>
  )
}

function CsvImport({ opened, onClose, members, dispatch }: { opened: boolean; onClose: () => void; members: Player[]; dispatch: Dispatch<Action> }) {
  const [text, setText] = useState('')
  const [msgs, setMsgs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    const { players, errors } = parseMembersCsv(text)
    try {
      let summary = '등록할 회원이 없습니다.'
      if (players.length) {
        const { inserted, updated } = await upsertMembersByName(players.map(stripId), members)
        dispatch({ type: 'member/append', players: [...updated, ...inserted] })
        summary = `신규 ${inserted.length}명 등록 · 기존 ${updated.length}명 갱신`
        notify.ok(summary)
      }
      setMsgs([summary, ...errors])
      if (!errors.length && players.length) { setText(''); onClose() }
    } catch (e) { notify.error((e as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={800}>CSV·엑셀 불러오기</Text>} size="lg">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">엑셀에서 표를 복사해 붙여넣거나 CSV를 입력하세요. 필수: <b>이름, 주포지션, 실력</b>. 같은 이름은 갱신, 없으면 추가됩니다.</Text>
        <Textarea autosize minRows={6} maxRows={14} value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder={CSV_TEMPLATE} styles={{ input: { fontFamily: 'ui-monospace, monospace', fontSize: 13 } }} />
        {msgs.length > 0 && (
          <Alert color={msgs.length > 1 ? 'orange' : 'brand'} variant="light">
            {msgs.map((m) => <Text key={m} size="sm">{m}</Text>)}
          </Alert>
        )}
        <Group justify="space-between">
          <Button variant="subtle" onClick={() => setText(CSV_TEMPLATE)}>양식 넣기</Button>
          <Button loading={busy} disabled={!text.trim()} onClick={run}>등록</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
