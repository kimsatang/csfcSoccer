import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionIcon, Alert, Badge, Box, Button, Card, Center, Chip, Drawer, Group, Loader, Menu, Modal, NativeSelect, Paper, ScrollArea,
  SegmentedControl, SimpleGrid, Stack, Text, Title, UnstyledButton,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconDots, IconDownload, IconEraser, IconPlus, IconTrash, IconUserPlus, IconWand, IconX } from '@tabler/icons-react'
import type { Player } from '../entities/player'
import { shortYear } from '../entities/player'
import type { SeasonBundle } from '../entities/season'
import { matchDates, nextMatchDate, rosters, shortDate } from '../entities/season'
import type { TeamGame } from '../entities/team/api'
import { fetchTeamDay, newGame, removeGame, saveAttendees, saveGame } from '../entities/team/api'
import type { Slot, SlotMap } from '../entities/team/formations'
import { FORMATIONS, FORMATION_NAMES, assignSlot, remapSlots } from '../entities/team/formations'
import { exportCanvas, renderLineup } from '../entities/team/renderLineup'
import type { Viewer } from '../features/auth/useAuth'
import { TEAM_COLORS } from '../features/build-teams'
import { PosBadge, RoleBadge } from '../shared/ui/badges'
import { confirmAction, notify } from '../shared/ui/feedback'
import { InvitePanel } from './InvitePanel'

interface Props {
  members: Player[]
  bundle: SeasonBundle
  viewer: Viewer
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** 자리 라벨에 맞는 포지션 선호 (자동 채우기용) */
const SLOT_POS: Record<string, Player['mainPosition']> = {
  GK: 'GK', LB: 'DF', RB: 'DF', CB: 'DF', LWB: 'DF', RWB: 'DF',
  DM: 'MF', CM: 'MF', LM: 'MF', RM: 'MF', AM: 'MF',
  LW: 'FW', RW: 'FW', ST: 'FW',
}

export function TeamManager({ members, bundle, viewer }: Props) {
  const manageable = useMemo(() => {
    const teams = [...bundle.teams].sort((a, b) => a.slot - b.slot)
    return viewer.isAdmin ? teams : teams.filter((t) => viewer.leaderTeams.some((l) => l.teamId === t.id))
  }, [bundle.teams, viewer])
  const dates = matchDates(bundle.season)
  const [teamId, setTeamId] = useState(
    () => manageable.find((t) => viewer.leaderTeams.some((l) => l.teamId === t.id))?.id ?? manageable[0]?.id,
  )
  const [date, setDate] = useState(() => nextMatchDate(bundle.season) ?? dates[0])
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])
  const [games, setGames] = useState<TeamGame[]>([newGame(1)])
  const [active, setActive] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [pickSlot, setPickSlot] = useState<Slot | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const isMobile = useMediaQuery('(max-width: 48em)', true)
  const saveTimer = useRef<number | undefined>(undefined)

  const team = manageable.find((t) => t.id === teamId)
  /** 쓰기 권한: 슈퍼관리자 또는 이 팀의 팀장·부팀장. 운영진은 조회만 */
  const canEdit = viewer.isSuper || viewer.leaderTeams.some((l) => l.teamId === teamId)
  const tc = TEAM_COLORS[team?.slot ?? 0]
  const color = tc.hex
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const roster = useMemo(() => {
    const r = rosters(members, bundle).find((x) => x.team.id === teamId)
    return r ? ([r.captain, r.vice, ...r.picks.map((p) => p.player)].filter(Boolean) as Player[]) : []
  }, [members, bundle, teamId])
  const leaderRole = (id: string) => (team?.captainId === id ? '팀장' : team?.viceId === id ? '부팀장' : undefined)

  const load = useCallback(async () => {
    if (!teamId) return
    setLoading(true); setPreview(null)
    try {
      const d = await fetchTeamDay(teamId, date)
      setAttendeeIds(d.attendeeIds)
      setGames(d.games.length ? d.games : [newGame(1)])
      setActive(d.games[0]?.gameNo ?? 1)
      setSaveState('idle')
    } catch (e) { notify.error((e as Error).message) }
    finally { setLoading(false) }
  }, [teamId, date])
  useEffect(() => { void load() }, [load])

  /** 변경 즉시 화면 반영, 0.6초 뒤 저장 (연속 터치 시 한 번만 저장) */
  const persist = (job: () => Promise<void>) => {
    window.clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = window.setTimeout(() => {
      job().then(() => setSaveState('saved')).catch((e) => { setSaveState('error'); notify.error(`저장 실패: ${(e as Error).message}`) })
    }, 600)
  }

  const game = games.find((g) => g.gameNo === active) ?? games[0]
  const slots = FORMATIONS[game.formation] ?? FORMATIONS['4-4-2']
  const assigned = new Set(Object.values(game.slots))
  const attendees = attendeeIds.map((id) => byId.get(id)).filter(Boolean) as Player[]
  const pool = attendees.length ? attendees : roster
  const bench = attendees.filter((p) => !assigned.has(p.id))
  const outsiders = members.filter((m) => m.status === 'ACTIVE' && !roster.some((r) => r.id === m.id))

  const updateGame = (g: TeamGame) => {
    if (!canEdit) return
    setGames((gs) => gs.map((x) => (x.gameNo === g.gameNo ? g : x)))
    setPreview(null)
    if (teamId) persist(() => saveGame(teamId, date, g))
  }

  const toggleAttendee = (id: string) => {
    if (!canEdit) return
    const next = attendeeIds.includes(id) ? attendeeIds.filter((x) => x !== id) : [...attendeeIds, id]
    setAttendeeIds(next)
    // 불참 처리된 선수는 모든 경기 라인업에서 제외
    if (!next.includes(id)) {
      setGames((gs) => gs.map((g) => {
        const key = Object.keys(g.slots).find((k) => g.slots[k] === id)
        if (!key) return g
        const ng = { ...g, slots: assignSlot(g.slots, key, null) }
        if (teamId) void saveGame(teamId, date, ng)
        return ng
      }))
    }
    if (teamId) persist(() => saveAttendees(teamId, date, next))
  }

  const addGame = () => {
    if (!canEdit) return
    const no = Math.max(...games.map((g) => g.gameNo)) + 1
    if (no > 10) return
    // 새 경기는 직전 경기 라인업을 복사해서 시작 (교체만 손보면 되도록)
    const prev = games[games.length - 1]
    const g: TeamGame = { gameNo: no, formation: prev.formation, slots: { ...prev.slots } }
    setGames([...games, g])
    setActive(no)
    if (teamId) persist(() => saveGame(teamId, date, g))
  }

  const deleteGame = async () => {
    if (!teamId) return
    if (!(await confirmAction({ title: `${game.gameNo}경기를 삭제할까요?`, message: '이 경기의 포메이션과 라인업이 지워집니다.', confirmLabel: '삭제', danger: true }))) return
    try {
      await removeGame(teamId, date, game.gameNo)
      const rest = games.filter((g) => g.gameNo !== game.gameNo)
      setGames(rest.length ? rest : [newGame(1)])
      setActive(rest[0]?.gameNo ?? 1)
    } catch (e) { notify.error((e as Error).message) }
  }

  const clearLineup = async () => {
    if (await confirmAction({ title: '라인업을 비울까요?', message: `${game.gameNo}경기 자리 배정이 모두 지워집니다.`, confirmLabel: '비우기', danger: true })) {
      updateGame({ ...game, slots: {} })
    }
  }

  const autoFill = () => {
    let next: SlotMap = { ...game.slots }
    const free = [...bench]
    const take = (pred: (p: Player) => boolean) => {
      const i = free.findIndex(pred)
      return i >= 0 ? free.splice(i, 1)[0] : undefined
    }
    for (const s of slots) {
      if (next[s.key]) continue
      const want = SLOT_POS[s.label]
      const p = take((x) => !x.positionReview && x.mainPosition === want)
        ?? take((x) => !x.positionReview && x.subPosition === want)
        ?? (want === 'GK' ? undefined : take(() => true))
      if (p) next = assignSlot(next, s.key, p.id)
    }
    updateGame({ ...game, slots: next })
  }

  const exportImage = async () => {
    if (!team) return
    const opp = bundle.teams.find((t) => t.id === game.opponentTeamId)
    const names = Object.fromEntries(Object.entries(game.slots).map(([k, id]) => [k, byId.get(id)?.name ?? '?']))
    const canvas = renderLineup({
      title: team.name,
      subtitle: `${shortDate(date)} ${game.gameNo}경기${opp ? ` vs ${opp.name}` : ''} · ${game.formation}`,
      color,
      slots,
      names,
      bench: bench.map((p) => p.name),
      footer: bundle.season.name,
    })
    setPreview(canvas.toDataURL('image/png'))
    try { await exportCanvas(canvas, `${team.name}_${date}_${game.gameNo}경기.png`) }
    catch (e) { notify.error((e as Error).message) }
  }

  if (!team) return <Alert color="gray">관리할 수 있는 팀이 없습니다.</Alert>

  const saveBadge = saveState === 'saving'
    ? <Badge variant="light" color="gray" leftSection={<Loader size={10} color="gray" />}>저장 중</Badge>
    : saveState === 'saved' ? <Badge variant="light">자동 저장됨</Badge>
      : saveState === 'error' ? <Badge color="red" variant="light">저장 실패</Badge>
        : <Badge variant="light" color="gray">자동 저장</Badge>
  const allRows = [...roster, ...attendees.filter((a) => !roster.some((r) => r.id === a.id))]

  return (
    <Stack gap="sm" style={{ ['--team' as string]: color }}>
      <Card padding="md" className="team-card" style={{ ['--team' as string]: color }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            {manageable.length > 1 ? (
              <ScrollArea type="never">
                <SegmentedControl
                  value={teamId} onChange={setTeamId} color={tc.mantine}
                  size={isMobile ? 'xs' : 'sm'}
                  data={manageable.map((t) => ({ value: t.id, label: isMobile ? t.name.replace(/팀$/, '') : t.name }))}
                />
              </ScrollArea>
            ) : <Title order={3} c={`${tc.mantine}.8`}>{team.name}</Title>}
            <Group gap={6} mt={8}>
              <Badge variant="light" color="gray">팀원 {roster.length}</Badge>
              <Badge variant="light" color={tc.mantine}>참석 {attendees.length}</Badge>
              {canEdit ? saveBadge : <Badge variant="light" color="gray">조회 전용</Badge>}
            </Group>
          </div>
          <NativeSelect
            value={date} onChange={(e) => setDate(e.currentTarget.value)} aria-label="경기일" w={isMobile ? 112 : 140}
            data={dates.map((d) => ({ value: d, label: shortDate(d) }))} styles={{ input: { fontWeight: 800 } }}
          />
        </Group>
      </Card>

      {viewer.isAdmin && <InvitePanel bundle={bundle} members={members} />}
      {!canEdit && (
        <Alert color="gray" variant="light" title="조회 전용">
          {team.name}의 참석·라인업은 팀장·부팀장과 슈퍼관리자만 수정할 수 있어요. 이미지 저장은 가능합니다.
        </Alert>
      )}

      {loading ? <Center py="xl"><Loader /></Center> : (
        <>
          <Card padding="md">
            <Group justify="space-between" mb="xs">
              <Text fw={800}>{shortDate(date)} 참석자 <Text span c="dimmed" fw={600}>{attendees.length}/{roster.length}</Text></Text>
              {canEdit && <Group gap={6}>
                <Button size="compact-sm" variant="light" onClick={() => { setAttendeeIds(roster.map((r) => r.id)); persist(() => saveAttendees(teamId!, date, roster.map((r) => r.id))) }}>전체 참석</Button>
                {outsiders.length > 0 && (
                  <Menu position="bottom-end" shadow="md">
                    <Menu.Target><Button size="compact-sm" variant="default" leftSection={<IconUserPlus size={14} />}>용병</Button></Menu.Target>
                    <Menu.Dropdown mah={320} style={{ overflowY: 'auto' }}>
                      <Menu.Label>다른 회원을 이 날만 추가</Menu.Label>
                      {outsiders.filter((m) => !attendeeIds.includes(m.id)).map((m) => (
                        <Menu.Item key={m.id} onClick={() => toggleAttendee(m.id)}>{m.name} <span className="year">{shortYear(m.birthYear)}</span></Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Group>}
            </Group>
            <Group gap={6}>
              {allRows.map((p) => {
                const on = attendeeIds.includes(p.id)
                const role = leaderRole(p.id)
                const guest = !roster.some((r) => r.id === p.id)
                return (
                  <Chip key={p.id} checked={on} onChange={() => toggleAttendee(p.id)} disabled={!canEdit && !on} color={tc.mantine} variant={on ? 'filled' : 'outline'} size="sm">
                    {role ? `${p.name} (${role})` : guest ? `${p.name} · 용병` : p.name}
                  </Chip>
                )
              })}
            </Group>
          </Card>

          <Card padding="md">
            <Group justify="space-between" wrap="nowrap" mb="sm">
              <ScrollArea type="never" style={{ flex: 1 }}>
                <Group gap={6} wrap="nowrap">
                  {games.map((g) => (
                    <Button
                      key={g.gameNo} size="sm" radius="xl" color={tc.mantine} variant={g.gameNo === active ? 'filled' : 'default'}
                      onClick={() => { setActive(g.gameNo); setPreview(null) }}
                    >
                      {g.gameNo}경기
                    </Button>
                  ))}
                  {canEdit && <Button size="sm" radius="xl" variant="subtle" leftSection={<IconPlus size={14} />} onClick={addGame} disabled={games.length >= 10}>경기 추가</Button>}
                </Group>
              </ScrollArea>
              {canEdit && <Menu position="bottom-end" shadow="md">
                <Menu.Target><ActionIcon variant="default" size={34} aria-label="경기 메뉴"><IconDots size={18} /></ActionIcon></Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconWand size={16} />} disabled={!bench.length} onClick={autoFill}>빈자리 자동 채우기</Menu.Item>
                  <Menu.Item leftSection={<IconEraser size={16} />} onClick={clearLineup}>라인업 비우기</Menu.Item>
                  {games.length > 1 && <Menu.Item leftSection={<IconTrash size={16} />} color="red" onClick={deleteGame}>{game.gameNo}경기 삭제</Menu.Item>}
                </Menu.Dropdown>
              </Menu>}
            </Group>

            <Group grow gap={8} mb="sm">
              <NativeSelect
                disabled={!canEdit} label="포메이션" value={game.formation}
                onChange={(e) => updateGame({ ...game, formation: e.currentTarget.value, slots: remapSlots(game.slots, game.formation, e.currentTarget.value) })}
                data={FORMATION_NAMES}
              />
              <NativeSelect
                disabled={!canEdit} label="상대" value={game.opponentTeamId ?? ''}
                onChange={(e) => updateGame({ ...game, opponentTeamId: e.currentTarget.value || undefined })}
                data={[{ value: '', label: '미정' }, ...bundle.teams.filter((t) => t.id !== teamId).map((t) => ({ value: t.id, label: t.name }))]}
              />
            </Group>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Box maw={520} w="100%" mx="auto">
                <div className="pitch" style={{ ['--team' as string]: color }}>
                  <PitchLines />
                  {slots.map((s) => {
                    const p = game.slots[s.key] ? byId.get(game.slots[s.key]) : undefined
                    return (
                      <button
                        key={s.key}
                        className={`slot ${p ? 'filled' : ''} ${pickSlot?.key === s.key ? 'picking' : ''}`}
                        style={{ left: `${s.x}%`, top: `${s.y}%` }}
                        onClick={() => canEdit && setPickSlot(s)}
                        disabled={!canEdit}
                        aria-label={`${s.label} ${p?.name ?? '비어 있음'}`}
                      >
                        <span className="slot-dot">{s.label}</span>
                        <span className="slot-name">{p?.name ?? '+'}</span>
                      </button>
                    )
                  })}
                </div>
                <Text size="xs" c="dimmed" ta="center" mt={6}>{canEdit ? '자리를 눌러 선수를 배정하세요 · ' : ''}선발 {assigned.size}/11</Text>
              </Box>

              <Stack gap="sm">
                <div>
                  <Text fw={800} size="sm" mb={6}>교체 / 미배정 <Text span c="dimmed">{bench.length}명</Text></Text>
                  {attendees.length === 0
                    ? <Text size="sm" c="dimmed">위에서 참석자를 먼저 체크하세요.</Text>
                    : (
                      <Group gap={6}>
                        {bench.map((p) => (
                          <Badge key={p.id} size="lg" variant="default" radius="md" tt="none" rightSection={!p.positionReview ? <PosBadge pos={p.mainPosition} size="xs" light /> : null}>
                            {p.name}
                          </Badge>
                        ))}
                        {bench.length === 0 && <Text size="sm" c="dimmed">모두 선발입니다.</Text>}
                      </Group>
                    )}
                </div>
                {!isMobile && (
                  <Button size="md" leftSection={<IconDownload size={18} />} color={tc.mantine} onClick={exportImage}>라인업 이미지 저장</Button>
                )}
              </Stack>
            </SimpleGrid>
          </Card>

          {isMobile && (
            <Box className="sticky-actions">
              <Button fullWidth size="md" radius="xl" leftSection={<IconDownload size={18} />} color={tc.mantine} onClick={exportImage} style={{ boxShadow: 'var(--mantine-shadow-md)' }}>
                {game.gameNo}경기 라인업 이미지 저장
              </Button>
            </Box>
          )}
        </>
      )}

      <Drawer
        opened={!!pickSlot} onClose={() => setPickSlot(null)} position="bottom" size={isMobile ? '75%' : 520}
        title={<Text fw={800}>{pickSlot?.label} 자리 선수 선택</Text>}
      >
        {pickSlot && (
          <Stack gap={6} pb="md">
            {game.slots[pickSlot.key] && (
              <Button variant="light" color="red" leftSection={<IconX size={16} />} onClick={() => { updateGame({ ...game, slots: assignSlot(game.slots, pickSlot.key, null) }); setPickSlot(null) }}>
                이 자리 비우기
              </Button>
            )}
            {attendees.length === 0 && <Text size="xs" c="dimmed">참석자가 없어 팀원 전체를 보여줍니다.</Text>}
            {[...pool].sort((a, b) => Number(assigned.has(a.id)) - Number(assigned.has(b.id))).map((p) => {
              const at = Object.keys(game.slots).find((k) => game.slots[k] === p.id)
              const atLabel = at ? slots.find((s) => s.key === at)?.label : undefined
              const current = at === pickSlot.key
              const role = leaderRole(p.id)
              return (
                <UnstyledButton
                  key={p.id}
                  onClick={() => {
                    if (!attendeeIds.includes(p.id)) toggleAttendee(p.id)
                    updateGame({ ...game, slots: assignSlot(game.slots, pickSlot.key, p.id) })
                    setPickSlot(null)
                  }}
                >
                  <Paper withBorder p="sm" radius="md" style={current ? { borderColor: color, background: `color-mix(in srgb, ${color} 8%, white)` } : undefined}>
                    <Group gap={8} wrap="nowrap">
                      {role && <RoleBadge role={role} color={tc.mantine} />}
                      <Text fw={700} style={{ flex: 1 }}>{p.name} <span className="year">{shortYear(p.birthYear)}</span></Text>
                      {!p.positionReview && <PosBadge pos={p.mainPosition} size="xs" />}
                      {atLabel && <Badge size="xs" variant="light" color={current ? tc.mantine : 'gray'}>{current ? '현재' : `${atLabel}와 교대`}</Badge>}
                    </Group>
                  </Paper>
                </UnstyledButton>
              )
            })}
          </Stack>
        )}
      </Drawer>

      <Modal opened={!!preview} onClose={() => setPreview(null)} title={<Text fw={800}>라인업 이미지</Text>} size="md">
        {preview && (
          <Stack gap="xs">
            <img src={preview} alt={`${team.name} ${game.gameNo}경기 라인업`} className="preview-img" />
            <Text size="xs" c="dimmed" ta="center">저장이 안 되면 이미지를 길게 눌러 저장하세요.</Text>
          </Stack>
        )}
      </Modal>
    </Stack>
  )
}

function PitchLines() {
  return (
    <svg className="pitch-lines" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden>
      <g fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.4">
        <rect x="0.5" y="0.5" width="67" height="104" />
        <line x1="0.5" y1="52.5" x2="67.5" y2="52.5" />
        <circle cx="34" cy="52.5" r="9.15" />
        <rect x="13.84" y="0.5" width="40.32" height="16.5" />
        <rect x="24.84" y="0.5" width="18.32" height="5.5" />
        <rect x="13.84" y="88" width="40.32" height="16.5" />
        <rect x="24.84" y="99" width="18.32" height="5.5" />
      </g>
    </svg>
  )
}
