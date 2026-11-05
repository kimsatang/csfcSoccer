import { useMemo, useState } from 'react'
import type { Dispatch } from 'react'
import {
  Accordion, Alert, Badge, Button, Card, Chip, Group, Menu, NativeSelect, Paper, SimpleGrid, Stack, Switch, Text, TextInput,
} from '@mantine/core'
import { IconArrowsExchange, IconClipboardList, IconCopy, IconDeviceFloppy, IconDownload, IconWand } from '@tabler/icons-react'
import { PasteAttendance } from '../features/attendance/PasteAttendance'
import { confirmAction, copyText, notify } from '../shared/ui/feedback'
import { PosBadge, RoleBadge } from '../shared/ui/badges'
import type { Action, DayDraft } from '../app/store'
import type { Player } from '../entities/player'
import { POSITIONS, POSITION_LABEL, shortYear, skillText } from '../entities/player'
import type { SeasonBundle } from '../entities/season'
import { matchDates, nextMatchDate, rosters, shortDate } from '../entities/season'
import { TEAM_COLORS } from '../features/build-teams'
import type { MatchPlayerInput } from '../features/build-teams/saveMatch'
import { saveMatch } from '../features/build-teams/saveMatch'
import { fetchDayAttendeesAllTeams } from '../entities/team/api'

interface Props {
  members: Player[]
  bundle: SeasonBundle
  days: Record<string, DayDraft>
  showSkill: boolean
  dispatch: Dispatch<Action>
}

interface DayPlayer { player: Player; homeSlot?: number; slot?: number; role: MatchPlayerInput['role'] }

export function MatchDay({ members, bundle, days, showSkill, dispatch }: Props) {
  const dates = matchDates(bundle.season)
  const [date, setDate] = useState(() => nextMatchDate(bundle.season) ?? dates[0])
  const day = days[date] ?? { attendance: [], overrides: {} }
  const title = day.title ?? `CSFC ${shortDate(date)} 경기`
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [openPanel, setOpenPanel] = useState<string | null>(day.attendance.length === 0 ? 'att' : null)

  const teamRosters = useMemo(() => rosters(members, bundle), [members, bundle])
  const homeSlot = useMemo(() => {
    const m = new Map<string, { slot: number; role: MatchPlayerInput['role'] }>()
    for (const r of teamRosters) {
      if (r.captain) m.set(r.captain.id, { slot: r.team.slot, role: 'CAPTAIN' })
      if (r.vice) m.set(r.vice.id, { slot: r.team.slot, role: 'VICE' })
      r.picks.forEach(({ player }) => m.set(player.id, { slot: r.team.slot, role: 'MEMBER' }))
    }
    return m
  }, [teamRosters])

  const active = members.filter((m) => m.status === 'ACTIVE')
  const unassignedMembers = active.filter((m) => !homeSlot.has(m.id))
  const attending: DayPlayer[] = active
    .filter((m) => day.attendance.includes(m.id))
    .map((player) => {
      const home = homeSlot.get(player.id)
      const slot = day.overrides[player.id] ?? home?.slot
      // 다른 팀으로 임시 이동한 팀장·부팀장은 그날 일반 팀원으로 기록
      const role = home && slot === home.slot ? home.role : 'MEMBER'
      return { player, homeSlot: home?.slot, slot, role }
    })
  const bySlot = [0, 1, 2].map((s) => attending.filter((a) => a.slot === s))
  const waiting = attending.filter((a) => a.slot === undefined)
  const counts = bySlot.map((t) => t.length)
  const gap = Math.max(...counts) - Math.min(...counts)

  const setOverride = (id: string, slot: number | null) => { setSaved(null); dispatch({ type: 'day/override', date, id, slot }) }

  /** 미배정 참석자를 인원 적은 팀 → 평균 실력 낮은 팀 순으로 자동 배치 */
  const autoAssign = () => {
    const load = bySlot.map((t) => ({ n: t.length, sum: t.reduce((s, a) => s + a.player.skill, 0) }))
    for (const a of [...waiting].sort((x, y) => y.player.skill - x.player.skill)) {
      const target = [0, 1, 2].sort((i, j) => load[i].n - load[j].n || load[i].sum - load[j].sum)[0]
      load[target].n++; load[target].sum += a.player.skill
      setOverride(a.player.id, target)
    }
  }

  const copy = async () => {
    const text = [
      `⚽ ${title}`,
      ...bySlot.map((t, s) => [
        `[${bundle.teams.find((x) => x.slot === s)?.name ?? TEAM_COLORS[s].label}] ${t.length}명`,
        ...t.map((a) => `- ${a.player.name}${a.role === 'CAPTAIN' ? ' (팀장)' : a.role === 'VICE' ? ' (부팀장)' : ''}${a.homeSlot !== undefined && a.homeSlot !== a.slot ? ' *임시' : ''}`),
      ].join('\n')),
    ].join('\n\n')
    await copyText(text, '복사했습니다. 단톡방에 붙여넣으세요.')
  }

  const save = async () => {
    if (!(await confirmAction({ title: `${shortDate(date)} 경기 기록을 저장할까요?`, message: `참석 ${attending.length}명의 팀 배정이 기록됩니다.` }))) return
    setBusy(true)
    try {
      const players = attending.filter((a) => a.slot !== undefined).map((a) => ({ member_id: a.player.id, role: a.role, team_index: a.slot! }))
      await saveMatch(title, date, players, bundle.season.id)
      setSaved(date)
      notify.ok(`${shortDate(date)} 경기 기록을 저장했습니다.`)
    } catch (e) {
      notify.error(`저장 실패: ${(e as Error).message}`)
    } finally { setBusy(false) }
  }

  const importLeaders = async () => {
    try {
      const ids = await fetchDayAttendeesAllTeams(date)
      dispatch({ type: 'day/setAttendance', date, ids })
      notify.ok(`팀장 입력 참석자 ${ids.length}명을 불러왔습니다.`)
    } catch (e) { notify.error((e as Error).message) }
  }
  const toggle = (id: string) => { setSaved(null); dispatch({ type: 'day/toggle', date, id }) }

  const teamName = (slot: number) => bundle.teams.find((t) => t.slot === slot)?.name ?? TEAM_COLORS[slot].label

  const order = { CAPTAIN: 0, VICE: 1, MEMBER: 2 }
  const groups = [
    ...teamRosters.map((r) => ({
      key: r.team.id, title: r.team.name, slot: r.team.slot,
      players: [r.captain, r.vice, ...r.picks.map((p) => p.player)].filter((p): p is Player => !!p && p.status === 'ACTIVE'),
    })),
    ...(unassignedMembers.length ? [{ key: 'none', title: '팀 미배정', slot: -1, players: unassignedMembers }] : []),
  ]

  return (
    <Stack gap="sm">
      <Card padding="md">
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <NativeSelect
            label="경기일" w={120} value={date} onChange={(e) => { setDate(e.currentTarget.value); setSaved(null) }}
            data={dates.map((d) => ({ value: d, label: shortDate(d) }))} styles={{ input: { fontWeight: 800 } }}
          />
          <TextInput label="제목" style={{ flex: 1 }} value={title} onChange={(e) => dispatch({ type: 'day/title', date, title: e.currentTarget.value })} />
        </Group>
        <Group gap={6} mt="sm">
          <Badge variant="light" color="gray">참석 {attending.length}</Badge>
          {counts.map((c, i) => <Badge key={i} variant="light" color={TEAM_COLORS[i].mantine}>{teamName(i).replace(/팀$/, '')} {c}</Badge>)}
          {saved === date && <Badge>기록 저장됨</Badge>}
        </Group>
        <Group gap={6} mt="md" grow>
          <Button variant="default" leftSection={<IconCopy size={16} />} disabled={!attending.length} onClick={copy}>결과 복사</Button>
          <Button leftSection={<IconDeviceFloppy size={16} />} loading={busy} disabled={!attending.length || waiting.length > 0 || saved === date} onClick={save}>기록 저장</Button>
        </Group>
        <Group justify="space-between" mt="sm">
          <Switch size="sm" label="실력 표시" checked={showSkill} onChange={(e) => dispatch({ type: 'ui/showSkill', value: e.currentTarget.checked })} />
        </Group>
      </Card>

      <Card padding={0}>
        <Accordion value={openPanel} onChange={setOpenPanel}>
          <Accordion.Item value="att" style={{ borderBottom: 0 }}>
            <Accordion.Control><Text fw={800}>참석 체크 <Text span c="dimmed" fw={600}>{attending.length}/{active.length}</Text></Text></Accordion.Control>
            <Accordion.Panel>
              <Group gap={6} mb="sm">
                <Button size="compact-sm" leftSection={<IconClipboardList size={14} />} onClick={() => setPasteOpen(true)}>명단 붙여넣기</Button>
                <Button size="compact-sm" variant="light" leftSection={<IconDownload size={14} />} onClick={importLeaders}>팀장 입력 불러오기</Button>
                <Button size="compact-sm" variant="default" onClick={() => dispatch({ type: 'day/setAttendance', date, ids: active.map((m) => m.id) })}>전체 참석</Button>
                <Button size="compact-sm" variant="subtle" color="gray" onClick={() => dispatch({ type: 'day/setAttendance', date, ids: [] })}>전체 해제</Button>
              </Group>
              <Stack gap="sm">
                {groups.map((g) => {
                  const color = g.slot >= 0 ? TEAM_COLORS[g.slot] : null
                  return (
                    <div key={g.key} style={{ borderLeft: `4px solid ${color?.hex ?? 'var(--mantine-color-gray-4)'}`, paddingLeft: 10 }}>
                      <Text size="sm" fw={800} mb={6}>{g.title} <Text span c="dimmed" size="sm">{g.players.filter((p) => day.attendance.includes(p.id)).length}/{g.players.length}</Text></Text>
                      <Group gap={6}>
                        {g.players.map((p) => (
                          <Chip key={p.id} size="sm" checked={day.attendance.includes(p.id)} onChange={() => toggle(p.id)} color={color?.mantine ?? 'gray'}>{p.name}</Chip>
                        ))}
                      </Group>
                    </div>
                  )
                })}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Card>

      <PasteAttendance
        opened={pasteOpen} onClose={() => setPasteOpen(false)}
        members={members} current={day.attendance}
        teamColor={(id) => { const h = homeSlot.get(id); return h ? TEAM_COLORS[h.slot].mantine : undefined }}
        onApply={(ids) => {
          setSaved(null)
          dispatch({ type: 'day/setAttendance', date, ids })
          setOpenPanel('att')
          notify.ok(`참석 ${ids.length}명으로 체크했습니다.`)
        }}
      />

      {waiting.length > 0 && (
        <Alert color="orange" title={`팀 미배정 참석자 ${waiting.length}명`}>
          <Text size="sm" mb="xs">드래프트되지 않은 회원(신입 등)입니다. 오늘 뛸 팀을 정해 주세요.</Text>
          <Stack gap={6}>
            {waiting.map((a) => (
              <Group key={a.player.id} justify="space-between" wrap="nowrap">
                <Text fw={700} size="sm">{a.player.name}</Text>
                <MoveMenu label="팀 선택" current={undefined} teamName={teamName} onChange={(s) => setOverride(a.player.id, s)} />
              </Group>
            ))}
          </Stack>
          <Button mt="sm" size="xs" variant="white" leftSection={<IconWand size={14} />} onClick={autoAssign}>자동 배치</Button>
        </Alert>
      )}

      {gap >= 2 && attending.length > 0 && (
        <Alert color="yellow" variant="light">팀 인원 차이가 {gap}명입니다. 인원이 많은 팀에서 <b>오늘만 이동</b>으로 맞출 수 있어요.</Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        {bySlot.map((players, slot) => {
          const r = teamRosters.find((x) => x.team.slot === slot)
          const absentLeaders = [r?.captain, r?.vice].filter((p) => p && !day.attendance.includes(p.id)) as Player[]
          const rated = players.filter((a) => !a.player.needsReview)
          const avg = rated.length ? rated.reduce((s, a) => s + a.player.skill, 0) / rated.length : 0
          const color = TEAM_COLORS[slot]
          return (
            <Card key={slot} padding="sm" className="team-card" style={{ ['--team' as string]: color.hex }}>
              <Group justify="space-between" mb={6}>
                <Text fw={900} size="lg" c={`${color.mantine}.8`}>{teamName(slot)}</Text>
                <Text size="xs" c="dimmed" fw={700}>{players.length}명{showSkill && rated.length > 0 && ` · 평균 ${avg.toFixed(1)}`}</Text>
              </Group>
              <Group gap={4} mb={6}>
                {POSITIONS.map((p) => <Badge key={p} size="xs" variant="outline" radius="sm">{POSITION_LABEL[p]} {players.filter((a) => !a.player.positionReview && a.player.mainPosition === p).length}</Badge>)}
              </Group>
              <Stack gap={4}>
                {[...players].sort((a, b) => order[a.role] - order[b.role]).map((a) => (
                  <Paper key={a.player.id} withBorder px={8} py={5} radius="md">
                    <Group gap={6} wrap="nowrap">
                      {a.role === 'CAPTAIN' && <RoleBadge role="팀장" color={color.mantine} />}
                      {a.role === 'VICE' && <RoleBadge role="부팀장" color={color.mantine} />}
                      <Text fw={700} size="sm" style={{ flex: 1 }} truncate>
                        {a.player.name} <span className="year">{shortYear(a.player.birthYear)}</span>
                        {a.homeSlot !== undefined && a.homeSlot !== slot && <Badge size="xs" color="orange" variant="light" ml={4}>임시</Badge>}
                      </Text>
                      {!a.player.positionReview && <PosBadge pos={a.player.mainPosition} size="xs" />}
                      {showSkill && !a.player.needsReview && <Text size="xs" c="dimmed" fw={700}>{skillText(a.player)}</Text>}
                      <MoveMenu current={slot} home={a.homeSlot} teamName={teamName} onChange={(s) => setOverride(a.player.id, s === a.homeSlot ? null : s)} />
                    </Group>
                  </Paper>
                ))}
                {players.length === 0 && <Text size="sm" c="dimmed">참석자 없음</Text>}
              </Stack>
              {absentLeaders.length > 0 && <Text size="xs" c="dimmed" mt={6}>불참: {absentLeaders.map((p) => p.name).join(', ')}</Text>}
            </Card>
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}

function MoveMenu({ current, home, label, teamName, onChange }: {
  current?: number; home?: number; label?: string; teamName: (slot: number) => string; onChange: (slot: number) => void
}) {
  return (
    <Menu position="bottom-end" shadow="md">
      <Menu.Target>
        {label
          ? <Button size="compact-xs" variant="default">{label}</Button>
          : <Button size="compact-xs" variant="subtle" color="gray" px={4} aria-label="오늘만 이동"><IconArrowsExchange size={14} /></Button>}
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{current === undefined ? '오늘 뛸 팀' : '오늘만 이동'}</Menu.Label>
        {[0, 1, 2].filter((s) => s !== current).map((s) => (
          <Menu.Item key={s} onClick={() => onChange(s)}>→ {teamName(s)}{s === home ? ' (원래 팀)' : ''}</Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
