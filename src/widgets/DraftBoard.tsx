import { useEffect, useMemo, useState } from 'react'
import {
  ActionIcon, Alert, Badge, Box, Button, Card, Chip, Group, Indicator, Menu, NativeSelect, Paper, ScrollArea, SegmentedControl,
  SimpleGrid, Stack, Switch, Text, TextInput, Title,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import {
  IconArrowBackUp, IconCheck, IconChevronLeft, IconChevronRight, IconCopy, IconDice5, IconDots, IconLockOpen, IconRefresh, IconSearch,
} from '@tabler/icons-react'
import type { Player, Position } from '../entities/player'
import {
  AGE_GROUPS, ATTENDANCE_LABEL, ATTENDANCE_LEVELS, POSITIONS, POSITION_LABEL, UNKNOWN_AGE, ageGroupOf, shortYear, skillText,
} from '../entities/player'
import type { Roster, SeasonBundle } from '../entities/season'
import { availablePlayers, matchDates, nextPickNo, orderedTeams, rosters, shortDate, teamForPick } from '../entities/season'
import { cancelPick, finishDraft, makePick, movePick, reopenDraft, setDraftOrder, undoLastPick } from '../entities/season/api'
import { TEAM_COLORS } from '../features/build-teams'
import { supabase } from '../shared/api/supabase'
import { shuffle } from '../shared/lib/rng'
import { AttBadge, PosBadge, RoleBadge } from '../shared/ui/badges'
import { confirmAction, copyText, notify } from '../shared/ui/feedback'

interface Props {
  members: Player[]
  bundle: SeasonBundle
  showSkill: boolean
  onChanged: () => Promise<void>
  /** 운영진: 순서 변경·되돌리기·완료 가능, 모든 차례 지명 가능 */
  isAdmin: boolean
  /** 슈퍼관리자: 드래프트 완료 후 다시 열기·확정 팀 수정 */
  isSuper: boolean
  /** 팀장·부팀장으로 맡은 팀: 자기 팀 차례에만 지명 가능 */
  myTeamIds: string[]
}

const ALL_AGE_GROUPS = [...AGE_GROUPS, UNKNOWN_AGE]

export function DraftBoard({ members, bundle, showSkill, onChanged, isAdmin, isSuper, myTeamIds }: Props) {
  const { season } = bundle
  const isMobile = useMediaQuery('(max-width: 48em)', true)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<string>('ALL')
  const [age, setAge] = useState<string>('ALL')
  const [att, setAtt] = useState<string>('ALL')
  const [grouped, setGrouped] = useState(true)

  const drafting = season.status === 'DRAFTING'
  const pickNo = nextPickNo(bundle.picks)
  const onClock = teamForPick(bundle, pickNo)
  const ordered = orderedTeams(season, bundle.teams)
  const available = useMemo(() => availablePlayers(members, bundle), [members, bundle])
  const teamRosters = rosters(members, bundle)
  const round = Math.floor((pickNo - 1) / 3) + 1
  const myTurn = myTeamIds.includes(onClock.id)
  const canPick = drafting && (isAdmin || myTurn)
  const [viewTeam, setViewTeam] = useState<string>(() => myTeamIds[0] ?? bundle.teams[0]?.id)

  // 여러 폰에서 동시에 진행: Realtime으로 즉시 반영, 끊긴 경우를 대비해 20초 폴링·복귀 시 새로고침
  const [live, setLive] = useState(false)
  useEffect(() => {
    let timer: number | undefined
    const refresh = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void onChanged(), 250) }
    const channel = supabase
      .channel(`draft:${season.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'seasons', filter: `id=eq.${season.id}` }, refresh)
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))
    const poll = window.setInterval(() => { if (!document.hidden) void onChanged() }, 20000)
    const onVisible = () => { if (!document.hidden) void onChanged() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [season.id, onChanged])

  const upcoming = [1, 2, 3].map((k) => teamForPick(bundle, pickNo + k).name.replace(/팀$/, ''))
  const filtered = available
    .filter((p) => (pos === 'ALL' ? true : p.mainPosition === pos || p.subPosition === pos))
    .filter((p) => (age === 'ALL' ? true : ageGroupOf(p).key === age))
    .filter((p) => (att === 'ALL' ? true : att === 'NONE' ? !p.attendanceLevel : p.attendanceLevel === att))
    .filter((p) => p.name.includes(query.trim()))
    .sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999) || a.name.localeCompare(b.name))
  const ageCounts = Object.fromEntries(ALL_AGE_GROUPS.map((g) => [g.key, available.filter((p) => ageGroupOf(p).key === g.key).length]))
  const sections = grouped
    ? ALL_AGE_GROUPS.map((g) => ({ group: g, players: filtered.filter((p) => ageGroupOf(p).key === g.key) })).filter((x) => x.players.length)
    : [{ group: null, players: filtered }]

  const run = async (job: () => Promise<void>, done?: string) => {
    setBusy(true)
    try { await job(); await onChanged(); if (done) notify.ok(done) }
    catch (e) { notify.error((e as Error).message); await onChanged() }
    finally { setBusy(false) }
  }

  const pick = (p: Player) => run(() => makePick(season.id, p.id).then(() => undefined), `${onClock.name} ← ${p.name}`)
  const undo = async () => {
    const last = bundle.picks.find((p) => p.pickNo === pickNo - 1)
    const name = members.find((m) => m.id === last?.memberId)?.name
    if (await confirmAction({ title: '마지막 지명을 되돌릴까요?', message: name ? `#${pickNo - 1} ${name} 지명이 취소됩니다.` : undefined, confirmLabel: '되돌리기' })) {
      void run(() => undoLastPick(season.id, pickNo - 1), '마지막 지명을 취소했습니다.')
    }
  }
  const finish = async () => {
    if (await confirmAction({
      title: '드래프트를 완료할까요?',
      message: available.length ? `아직 ${available.length}명이 남아 있습니다. 완료하면 팀이 확정됩니다.` : '모든 회원이 지명되었습니다. 팀이 확정됩니다.',
      confirmLabel: '팀 확정',
    })) void run(() => finishDraft(season.id), '팀을 확정했습니다.')
  }
  const reopen = async () => {
    if (await confirmAction({ title: '드래프트를 다시 열까요?', message: '신입 회원 추가 지명 등을 위해 드래프트를 다시 엽니다. (슈퍼관리자 전용)' })) {
      void run(() => reopenDraft(season.id), '드래프트를 다시 열었습니다.')
    }
  }
  /** 슈퍼관리자: 확정된 팀 수정 (선수 이동·지명 취소) */
  const editPick = {
    move: (pickNo: number, teamId: string, name: string, teamName: string) => run(() => movePick(season.id, pickNo, teamId), `${name} → ${teamName}`),
    cancel: async (pickNo: number, name: string) => {
      if (await confirmAction({ title: `${name} 지명을 취소할까요?`, message: '팀에서 빠지고 미배정 회원이 됩니다.', confirmLabel: '지명 취소', danger: true })) {
        void run(() => cancelPick(season.id, pickNo), `${name} 지명을 취소했습니다.`)
      }
    },
  }
  const superEdit = isSuper && !drafting
  const moveOrder = (idx: number, dir: -1 | 1) => {
    const ids = ordered.map((t) => t.id)
    const j = idx + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    void run(() => setDraftOrder(season.id, ids))
  }
  const drawOrder = () => run(() => setDraftOrder(season.id, shuffle(ordered.map((t) => t.id), Math.random)), '지명 순서를 추첨했습니다.')
  const copyRoster = () => copyText(draftText(season.name, matchDates(season), teamRosters), '팀 명단을 복사했습니다.')

  const clockColor = TEAM_COLORS[onClock.slot]

  return (
    <Stack gap="sm">
      <Card padding="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <Group gap={8}>
              <Title order={3}>드래프트</Title>
              <Badge color={drafting ? 'orange' : 'brand'} variant="light">{drafting ? '지명 중' : '팀 확정'}</Badge>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>{matchDates(season).map(shortDate).join(' · ')} 경기 동안 유지</Text>
          </div>
          <Group gap={6} wrap="nowrap">
            {isAdmin && drafting && !isMobile && (
              <>
                <Button variant="default" leftSection={<IconArrowBackUp size={16} />} disabled={busy || pickNo === 1} onClick={undo}>되돌리기</Button>
                <Button leftSection={<IconCheck size={16} />} disabled={busy} onClick={finish}>드래프트 완료</Button>
              </>
            )}
            <Menu position="bottom-end" shadow="md">
              <Menu.Target><ActionIcon variant="default" size={36} aria-label="더보기"><IconDots size={18} /></ActionIcon></Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconCopy size={16} />} onClick={copyRoster}>팀 명단 복사 (단톡방용)</Menu.Item>
                <Menu.Item leftSection={<IconRefresh size={16} />} onClick={() => void run(async () => {})}>새로고침</Menu.Item>
                {isAdmin && drafting && isMobile && (
                  <>
                    <Menu.Divider />
                    <Menu.Item leftSection={<IconArrowBackUp size={16} />} disabled={pickNo === 1} onClick={undo}>마지막 지명 되돌리기</Menu.Item>
                    <Menu.Item leftSection={<IconCheck size={16} />} onClick={finish}>드래프트 완료</Menu.Item>
                  </>
                )}
                {isSuper && !drafting && <Menu.Item leftSection={<IconLockOpen size={16} />} onClick={reopen}>드래프트 다시 열기 (슈퍼관리자)</Menu.Item>}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        {isAdmin && drafting && pickNo === 1 && (
          <Paper mt="md" p="sm" withBorder style={{ borderStyle: 'dashed' }}>
            <Text size="xs" c="dimmed" mb={8}>1라운드 지명 순서 · 이후 스네이크(1→2→3→3→2→1…)</Text>
            <Group gap={6} wrap="wrap">
              {ordered.map((t, i) => (
                <Group key={t.id} gap={2} wrap="nowrap" px={6} py={2} style={{ border: `2px solid ${TEAM_COLORS[t.slot].hex}`, borderRadius: 999 }}>
                  <ActionIcon size="sm" variant="subtle" color="gray" disabled={busy || i === 0} onClick={() => moveOrder(i, -1)} aria-label="앞으로"><IconChevronLeft size={14} /></ActionIcon>
                  <Text size="sm" fw={800}>{i + 1}. {t.name}</Text>
                  <ActionIcon size="sm" variant="subtle" color="gray" disabled={busy || i === ordered.length - 1} onClick={() => moveOrder(i, 1)} aria-label="뒤로"><IconChevronRight size={14} /></ActionIcon>
                </Group>
              ))}
              <Button size="xs" variant="light" leftSection={<IconDice5 size={14} />} disabled={busy} onClick={drawOrder}>순서 추첨</Button>
            </Group>
          </Paper>
        )}
      </Card>

      {superEdit && (
        <Alert color="violet" variant="light" title="슈퍼관리자 수정 모드">
          확정된 팀의 선수 옆 메뉴(⋯)에서 다른 팀으로 이동하거나 지명을 취소할 수 있습니다. 신입 추가 지명은 상단 메뉴의 <b>드래프트 다시 열기</b>를 쓰세요.
        </Alert>
      )}

      {drafting && (
        <Paper p="md" className="on-clock" style={{ ['--team' as string]: clockColor.hex }}>
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap={10} wrap="nowrap">
              <Badge color={clockColor.mantine} size="lg" radius="sm">지금 차례</Badge>
              <div>
                <Text fw={900} size="xl" lh={1.1}>{onClock.name}</Text>
                <Text size="xs" c="dimmed">{round}라운드 · {pickNo}번째 지명</Text>
              </div>
            </Group>
            <Stack gap={2} align={isMobile ? 'flex-start' : 'flex-end'}>
              {myTurn
                ? <Text fw={800} c="red" size="sm">우리 팀 차례예요! 아래에서 지명하세요</Text>
                : !isAdmin && <Text size="sm" c="dimmed">다른 팀 차례</Text>}
              <Group gap={8}>
                <Indicator color={live ? 'brand' : 'gray'} processing={live} size={8} position="middle-start" offset={-2}>
                  <Text size="xs" c={live ? 'brand' : 'dimmed'} fw={700} pl={10}>{live ? '실시간' : '연결 중'}</Text>
                </Indicator>
                <Text size="xs" c="dimmed">다음: {upcoming.join(' → ')}</Text>
              </Group>
            </Stack>
          </Group>
        </Paper>
      )}

      {isMobile ? (
        <Stack gap={8}>
          <SegmentedControl
            fullWidth value={viewTeam} onChange={setViewTeam}
            data={teamRosters.map((r) => ({ value: r.team.id, label: `${r.team.name.replace(/팀$/, '')} ${2 + r.picks.length}` }))}
          />
          {teamRosters.filter((r) => r.team.id === viewTeam).map((r) => (
            <RosterCard key={r.team.id} roster={r} showSkill={showSkill} active={drafting && r.team.id === onClock.id} teams={bundle.teams} onEdit={superEdit ? editPick : undefined} />
          ))}
        </Stack>
      ) : (
        <SimpleGrid cols={3} spacing="sm">
          {teamRosters.map((r) => <RosterCard key={r.team.id} roster={r} showSkill={showSkill} active={drafting && r.team.id === onClock.id} teams={bundle.teams} onEdit={superEdit ? editPick : undefined} />)}
        </SimpleGrid>
      )}

      {drafting && (
        <Card padding="md">
          <Group justify="space-between" mb="sm">
            <Group gap={6}><Title order={4}>지명 가능</Title><Badge variant="light" color="gray">{available.length}명</Badge></Group>
            <Switch size="sm" label="나이대별 묶기" checked={grouped} onChange={(e) => setGrouped(e.currentTarget.checked)} />
          </Group>
          <Stack gap={8}>
            <TextInput placeholder="이름 검색" leftSection={<IconSearch size={16} />} value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
            <ScrollArea type="never">
              <Chip.Group value={pos} onChange={(v) => setPos(v as string)}>
                <Group gap={6} wrap="nowrap">
                  {(['ALL', ...POSITIONS] as const).map((p) => (
                    <Chip key={p} value={p} size="sm" variant="light">{p === 'ALL' ? '전체 포지션' : POSITION_LABEL[p as Position]}</Chip>
                  ))}
                </Group>
              </Chip.Group>
            </ScrollArea>
            <Group grow gap={8}>
              <NativeSelect
                size="sm" value={age} onChange={(e) => setAge(e.currentTarget.value)} aria-label="나이대"
                data={[{ value: 'ALL', label: `전 연령 (${available.length})` },
                  ...ALL_AGE_GROUPS.filter((g) => ageCounts[g.key] > 0 || g !== UNKNOWN_AGE).map((g) => ({ value: g.key, label: `${g.label} (${ageCounts[g.key]})` }))]}
              />
              <NativeSelect
                size="sm" value={att} onChange={(e) => setAtt(e.currentTarget.value)} aria-label="참석률"
                data={[{ value: 'ALL', label: '참석률 전체' },
                  ...ATTENDANCE_LEVELS.map((l) => ({ value: l, label: `참석 ${ATTENDANCE_LABEL[l]} (${available.filter((p) => p.attendanceLevel === l).length})` })),
                  { value: 'NONE', label: `참석 미입력 (${available.filter((p) => !p.attendanceLevel).length})` }]}
              />
            </Group>
          </Stack>

          <Box mt="md">
            {available.length === 0 ? (
              <Alert color="brand" variant="light">
                {members.length <= 6 ? '회원 명단을 먼저 등록하세요.' : '모든 회원이 지명되었습니다.'}{isAdmin && ' 드래프트 완료로 팀을 확정하세요.'}
              </Alert>
            ) : filtered.length === 0 ? (
              <Text c="dimmed" ta="center" py="md">조건에 맞는 회원이 없습니다.</Text>
            ) : (
              <Stack gap="md">
                {sections.map(({ group, players }) => (
                  <div key={group?.key ?? 'all'}>
                    {group && <Text fw={800} size="sm" mb={6}>{group.label} <Text span c="dimmed" size="sm">{players.length}명</Text></Text>}
                    <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing={6}>
                      {players.map((p) => (
                        <Paper key={p.id} withBorder p={6} pl="sm" radius="md">
                          <Group gap={6} wrap="nowrap">
                            <span className="year">{shortYear(p.birthYear)}</span>
                            <Text fw={700} size="sm" style={{ flex: 1 }} truncate>{p.name}</Text>
                            <AttBadge level={p.attendanceLevel} compact />
                            {!p.positionReview && <PosBadge pos={p.mainPosition} size="xs" />}
                            {showSkill && !p.needsReview && <Text size="xs" c="dimmed" fw={700}>{skillText(p)}</Text>}
                            <Button size="compact-sm" color={clockColor.mantine} disabled={busy || !canPick} onClick={() => pick(p)}>지명</Button>
                          </Group>
                        </Paper>
                      ))}
                    </SimpleGrid>
                  </div>
                ))}
              </Stack>
            )}
          </Box>
        </Card>
      )}
    </Stack>
  )
}

type PickEditor = {
  move: (pickNo: number, teamId: string, name: string, teamName: string) => void
  cancel: (pickNo: number, name: string) => void
}

function RosterCard({ roster, showSkill, active, teams, onEdit }: {
  roster: Roster; showSkill: boolean; active: boolean; teams: SeasonBundle['teams']; onEdit?: PickEditor
}) {
  const { team, captain, vice, picks } = roster
  const color = TEAM_COLORS[team.slot]
  const players = [captain, vice, ...picks.map((p) => p.player)].filter(Boolean) as Player[]
  const rated = players.filter((p) => !p.needsReview)
  const positioned = players.filter((p) => !p.positionReview)
  const avg = rated.length ? rated.reduce((s, p) => s + p.skill, 0) / rated.length : 0
  return (
    <Card padding="sm" className={`team-card ${active ? 'active' : ''}`} style={{ ['--team' as string]: color.hex }}>
      <Group justify="space-between" mb={6}>
        <Text fw={900} size="lg" c={`${color.mantine}.8`}>{team.name}</Text>
        <Text size="xs" c="dimmed" fw={700}>{players.length}명{showSkill && rated.length > 0 && ` · 평균 ${avg.toFixed(1)}`}</Text>
      </Group>
      <Group gap={4} mb={6}>
        {ALL_AGE_GROUPS.map((g) => {
          const n = players.filter((p) => ageGroupOf(p).key === g.key).length
          return n > 0 || g !== UNKNOWN_AGE
            ? <Badge key={g.key} size="xs" variant="default" radius="sm">{g.label.replace('년생', '').replace(' 이후', '+')} {n}</Badge>
            : null
        })}
      </Group>
      {players.some((p) => p.attendanceLevel) && (
        <Group gap={4} mb={6}>
          {ATTENDANCE_LEVELS.map((l) => (
            <Group key={l} gap={2}><AttBadge level={l} /><Text size="xs" fw={700}>{players.filter((p) => p.attendanceLevel === l).length}</Text></Group>
          ))}
        </Group>
      )}
      {positioned.length > 0 && (
        <Group gap={4} mb={6}>
          {POSITIONS.map((p) => <Badge key={p} size="xs" variant="outline" radius="sm">{POSITION_LABEL[p]} {positioned.filter((x) => x.mainPosition === p).length}</Badge>)}
        </Group>
      )}
      <Stack gap={4}>
        {captain && <RosterRow p={captain} role="팀장" color={color.mantine} showSkill={showSkill} />}
        {vice && <RosterRow p={vice} role="부팀장" color={color.mantine} showSkill={showSkill} />}
        {picks.map(({ pickNo, player }) => (
          <RosterRow key={player.id} p={player} pickNo={pickNo} color={color.mantine} showSkill={showSkill}>
            {onEdit && (
              <Menu position="bottom-end" shadow="md">
                <Menu.Target><ActionIcon size="sm" variant="subtle" color="gray" aria-label={`${player.name} 수정`}><IconDots size={14} /></ActionIcon></Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{player.name}</Menu.Label>
                  {teams.filter((t) => t.id !== team.id).map((t) => (
                    <Menu.Item key={t.id} onClick={() => onEdit.move(pickNo, t.id, player.name, t.name)}>→ {t.name}으로 이동</Menu.Item>
                  ))}
                  <Menu.Divider />
                  <Menu.Item color="red" onClick={() => onEdit.cancel(pickNo, player.name)}>지명 취소</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </RosterRow>
        ))}
      </Stack>
    </Card>
  )
}

function RosterRow({ p, role, pickNo, color, showSkill, children }: {
  p: Player; role?: '팀장' | '부팀장'; pickNo?: number; color: string; showSkill: boolean; children?: React.ReactNode
}) {
  return (
    <Group gap={6} wrap="nowrap" px={8} py={5} style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 8, background: 'white' }}>
      {role ? <RoleBadge role={role} color={color} /> : <Text size="xs" c="dimmed" fw={700} w={26}>#{pickNo}</Text>}
      <Text fw={700} size="sm" style={{ flex: 1 }} truncate>{p.name} <span className="year">{shortYear(p.birthYear)}</span></Text>
      <AttBadge level={p.attendanceLevel} compact />
      {!p.positionReview && <PosBadge pos={p.mainPosition} size="xs" />}
      {showSkill && !p.needsReview && <Text size="xs" c="dimmed" fw={700}>{p.skill}</Text>}
      {children}
    </Group>
  )
}

export function draftText(seasonName: string, dates: string[], rs: Roster[]): string {
  const blocks = rs.map((r) => [
    `[${r.team.name}] ${2 + r.picks.length}명`,
    `팀장 ${r.captain?.name ?? '-'} / 부팀장 ${r.vice?.name ?? '-'}`,
    ...r.picks.map(({ player }, i) => `${i + 1}. ${player.name} (${shortYear(player.birthYear)}${player.positionReview ? '' : ` · ${POSITION_LABEL[player.mainPosition]}`})`),
  ].join('\n'))
  return [`⚽ CSFC ${seasonName} 팀 명단`, `경기: ${dates.map(shortDate).join(', ')}`, ...blocks].join('\n\n')
}
