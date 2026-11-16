import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Accordion, ActionIcon, Alert, Badge, Button, Card, Center, ColorSwatch, Group, Loader, Modal, SegmentedControl, Select, Stack, Table, Text, TextInput, Title,
} from '@mantine/core'
import { IconBallFootball, IconCopy, IconPlus, IconTrash, IconTrophy, IconX } from '@tabler/icons-react'
import type { Player } from '../entities/player'
import type { DayGame, DayGoal, NewGoal, Roster, SeasonBundle, SeasonTeam } from '../entities/season'
import {
  addDayGame, addGoal, deleteDayGame, deleteGoal, fetchSeasonRecords, gameScore, goalText, matchDates, nextMatchDate, rosters, scorerTable,
  setDayMvp, shortDate, standings, toIsoDate,
} from '../entities/season'
import { TEAM_COLORS } from '../features/build-teams/buildTeams'
import { confirmAction, copyText, notify } from '../shared/ui/feedback'

interface Props {
  members: Player[]
  bundle: SeasonBundle
  isAdmin: boolean
  /** 팀장·부팀장으로 맡은 팀 (그 팀이 나오는 게임만 기록 가능) */
  myTeamIds: string[]
}

const GUEST = '__guest'
const UNKNOWN = '__unknown'

/** 경기 기록: 경기일마다 게임(팀 vs 팀)·골·도움·자책골·MVP, 시즌 순위·득점 순위 */
export function DayRecords({ members, bundle, isAdmin, myTeamIds }: Props) {
  const { season } = bundle
  const dates = useMemo(() => matchDates(season), [season])
  const [day, setDay] = useState(() => nextMatchDate(season) ?? dates[0])
  const [data, setData] = useState<{ games: DayGame[]; goals: DayGoal[]; mvps: Map<string, string> } | null | undefined>(undefined)
  const [adding, setAdding] = useState<{ game: DayGame; teamId: string } | null>(null)
  const [today] = useState(() => toIsoDate(new Date()))

  const names = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members])
  const teams = useMemo(() => [...bundle.teams].sort((a, b) => a.slot - b.slot), [bundle.teams])
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])
  const rosterById = useMemo(() => new Map(rosters(members, bundle).map((r) => [r.team.id, r])), [members, bundle])

  const load = useCallback(async () => {
    try { setData(await fetchSeasonRecords(season.id)) }
    catch (e) { notify.error((e as Error).message, '경기 기록을 불러오지 못했어요'); setData(null) }
  }, [season.id])
  useEffect(() => { void load() }, [load])

  if (data === undefined) return <Center py="xl"><Loader /></Center>
  if (data === null) {
    return <Alert color="gray" title="경기 기록 준비 중">운영진이 DB 설정을 마치면 쓸 수 있어요.</Alert>
  }

  const games = data.games.filter((g) => g.playedOn === day)
  const dayGoals = data.goals.filter((x) => games.some((g) => g.id === x.gameId))
  const mvp = data.mvps.get(day) ?? null
  const canEdit = (g: Pick<DayGame, 'homeTeamId' | 'awayTeamId'>) => isAdmin || myTeamIds.includes(g.homeTeamId) || myTeamIds.includes(g.awayTeamId)
  const canAdd = isAdmin || myTeamIds.length > 0

  // 시즌 누적: 지난 경기일 + 오늘은 골이 기록된 게임만 (방금 만든 빈 게임이 0:0 무승부로 잡히지 않게)
  const playedGames = data.games.filter((g) => g.playedOn < today || (g.playedOn === today && data.goals.some((x) => x.gameId === g.id)))
  const playedGoals = data.goals.filter((x) => playedGames.some((g) => g.id === x.gameId))
  const table = standings(teams.map((t) => t.id), playedGames, playedGoals)
  const seasonScorers = scorerTable(data.goals, names)
  const dayScorers = scorerTable(dayGoals, names)

  const newGame = async () => {
    const no = (games.at(-1)?.gameNo ?? 0) + 1
    const pairs: [number, number][] = teams.length >= 3 ? [[0, 1], [1, 2], [0, 2]] : [[0, 1]]
    let [h, a] = pairs[games.length % pairs.length].map((i) => teams[i]?.id) as [string, string]
    // 팀장은 자기 팀 게임만 만들 수 있으니 자기 팀을 넣음
    if (!isAdmin && !myTeamIds.includes(h) && !myTeamIds.includes(a)) { h = myTeamIds[0]; a = teams.find((t) => t.id !== h)!.id }
    try {
      const g = await addDayGame(season.id, day, no, h, a)
      setData((d) => d && { ...d, games: [...d.games, g] })
    } catch (e) { notify.error((e as Error).message, '게임을 추가하지 못했어요') }
  }
  const removeGame = async (g: DayGame) => {
    if (!(await confirmAction({ title: `${g.gameNo}경기를 지울까요?`, message: '이 게임의 골 기록도 함께 지워져요.', confirmLabel: '지우기', danger: true }))) return
    try { await deleteDayGame(g.id); setData((d) => d && { ...d, games: d.games.filter((x) => x.id !== g.id), goals: d.goals.filter((x) => x.gameId !== g.id) }) }
    catch (e) { notify.error((e as Error).message) }
  }
  const removeGoal = async (x: DayGoal) => {
    if (!(await confirmAction({ title: '이 골 기록을 지울까요?', message: goalText(x, names), confirmLabel: '지우기', danger: true }))) return
    try { await deleteGoal(x.id); setData((d) => d && { ...d, goals: d.goals.filter((y) => y.id !== x.id) }) }
    catch (e) { notify.error((e as Error).message) }
  }
  const chooseMvp = async (id: string | null) => {
    try {
      await setDayMvp(season.id, day, id)
      setData((d) => { if (!d) return d; const m = new Map(d.mvps); if (id) m.set(day, id); else m.delete(day); return { ...d, mvps: m } })
    } catch (e) { notify.error((e as Error).message) }
  }

  const tName = (id: string) => teamById.get(id)?.name ?? '?'
  const tColor = (id: string) => TEAM_COLORS[teamById.get(id)?.slot ?? 0]
  const resultText = () => {
    const lines = [`📋 ${season.name} ${shortDate(day)} 경기 결과`, '']
    for (const g of games) {
      const [h, a] = gameScore(data.goals, g)
      lines.push(`${g.gameNo}경기 ${tName(g.homeTeamId)} ${h} : ${a} ${tName(g.awayTeamId)}`)
      const side = (tid: string) => data.goals.filter((x) => x.gameId === g.id && x.teamId === tid).map((x) => goalText(x, names)).join(', ')
      if (data.goals.some((x) => x.gameId === g.id)) lines.push(`  ⚽ ${side(g.homeTeamId) || '-'} / ${side(g.awayTeamId) || '-'}`)
    }
    if (mvp) lines.push('', `🏆 MVP ${names.get(mvp) ?? ''}`)
    if (dayScorers.some((r) => r.goals)) lines.push('', `득점 ${dayScorers.filter((r) => r.goals).map((r) => `${r.name} ${r.goals}`).join(' · ')}`)
    if (playedGames.length) {
      lines.push('', '[시즌 순위]')
      table.forEach((r, i) => lines.push(`${i + 1}. ${tName(r.teamId)} ${r.points}점 (${r.win}승 ${r.draw}무 ${r.loss}패, 득실 ${r.gf - r.ga >= 0 ? '+' : ''}${r.gf - r.ga})`))
    }
    return lines.join('\n')
  }

  const dayPlayers = [...new Set(teams.flatMap((t) => rosterIds(rosterById.get(t.id))))].sort((a, b) => (names.get(a) ?? '').localeCompare(names.get(b) ?? '', 'ko'))

  return (
    <Stack gap="sm">
      <Card padding="md">
        <Group justify="space-between" mb="sm" gap={8}>
          <Title order={4}>경기 기록</Title>
          <Button size="xs" variant="default" leftSection={<IconCopy size={14} />} onClick={() => copyText(resultText(), '카톡에 붙여 넣을 결과를 복사했어요')} disabled={!games.length}>
            결과 복사
          </Button>
        </Group>
        <SegmentedControl fullWidth size="xs" value={day} onChange={setDay} data={dates.map((d) => ({ value: d, label: shortDate(d) }))} />

        <Stack gap="sm" mt="sm">
          {games.map((g) => {
            const [hs, as] = gameScore(data.goals, g)
            const gl = data.goals.filter((x) => x.gameId === g.id)
            const editable = canEdit(g)
            return (
              <div key={g.id} className="game-card">
                <Group justify="space-between" gap={4} mb={2}>
                  <Text size="xs" c="dimmed">{g.gameNo}경기</Text>
                  {editable && g.id === games.at(-1)?.id && (
                    <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => void removeGame(g)} aria-label={`${g.gameNo}경기 지우기`}><IconTrash size={14} /></ActionIcon>
                  )}
                </Group>
                <Group justify="space-between" wrap="nowrap" gap={6}>
                  <Group gap={6} wrap="nowrap" justify="flex-end" style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={700} truncate>{tName(g.homeTeamId)}</Text>
                    <ColorSwatch size={12} color={tColor(g.homeTeamId).hex} style={{ flexShrink: 0 }} />
                  </Group>
                  <Text fw={900} size="xl" className="score" aria-label={`${g.gameNo}경기 점수 ${hs} 대 ${as}`}>{hs} : {as}</Text>
                  <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <ColorSwatch size={12} color={tColor(g.awayTeamId).hex} style={{ flexShrink: 0 }} />
                    <Text fw={700} truncate>{tName(g.awayTeamId)}</Text>
                  </Group>
                </Group>
                {gl.length > 0 && (
                  <div className="goal-cols">
                    {[g.homeTeamId, g.awayTeamId].map((tid, side) => (
                      <Stack key={tid} gap={2} align={side === 0 ? 'flex-end' : 'flex-start'}>
                        {gl.filter((x) => x.teamId === tid).map((x) => (
                          <Group key={x.id} gap={2} wrap="nowrap">
                            {side === 1 && <IconBallFootball size={12} />}
                            <Text size="xs" c={x.kind === 'OWN_GOAL' ? 'red' : undefined}>{goalText(x, names)}</Text>
                            {side === 0 && <IconBallFootball size={12} />}
                            {editable && (
                              <ActionIcon size={16} variant="subtle" color="gray" onClick={() => void removeGoal(x)} aria-label={`골 기록 지우기 ${goalText(x, names)}`}><IconX size={10} /></ActionIcon>
                            )}
                          </Group>
                        ))}
                      </Stack>
                    ))}
                  </div>
                )}
                {editable && (
                  <Group grow gap={8} mt={6}>
                    {[g.homeTeamId, g.awayTeamId].map((tid) => (
                      <Button key={tid} size="compact-sm" variant="light" color={tColor(tid).mantine} onClick={() => setAdding({ game: g, teamId: tid })}>+ {tName(tid)} 골</Button>
                    ))}
                  </Group>
                )}
              </div>
            )
          })}
          {!games.length && <Text size="sm" c="dimmed" ta="center" py="xs">{shortDate(day)} 기록이 아직 없어요.</Text>}
          {canAdd && <Button variant="light" leftSection={<IconPlus size={16} />} onClick={newGame}>{games.length + 1}경기 추가</Button>}
        </Stack>

        {games.length > 0 && (
          <Group gap={8} align="flex-end" mt="md">
            <IconTrophy size={18} color="#f59f00" />
            {isAdmin ? (
              <Select size="xs" w={180} searchable clearable placeholder="MVP 고르기" label={`${shortDate(day)} MVP`}
                data={dayPlayers.map((id) => ({ value: id, label: names.get(id) ?? '' }))} value={mvp} onChange={(v) => void chooseMvp(v)} />
            ) : <Text size="sm" fw={700}>MVP {mvp ? names.get(mvp) : '미정'}</Text>}
          </Group>
        )}
        {dayScorers.length > 0 && (
          <Text size="xs" c="dimmed" mt="xs">
            오늘 득점 {dayScorers.filter((r) => r.goals).map((r) => `${r.name} ${r.goals}`).join(' · ') || '-'}
            {dayScorers.some((r) => r.assists) && ` / 도움 ${[...dayScorers].filter((r) => r.assists).sort((a, b) => b.assists - a.assists).map((r) => `${r.name} ${r.assists}`).join(' · ')}`}
          </Text>
        )}
      </Card>

      <Card padding={0}>
        <Accordion defaultValue="table">
          <Accordion.Item value="table">
            <Accordion.Control><Text fw={800}>시즌 순위</Text></Accordion.Control>
            <Accordion.Panel>
              <Table fz="sm" verticalSpacing={4}>
                <Table.Thead><Table.Tr><Table.Th>팀</Table.Th><Table.Th ta="right">경기</Table.Th><Table.Th ta="right">승</Table.Th><Table.Th ta="right">무</Table.Th><Table.Th ta="right">패</Table.Th><Table.Th ta="right">득실</Table.Th><Table.Th ta="right">승점</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {table.map((r) => (
                    <Table.Tr key={r.teamId}>
                      <Table.Td><Group gap={6} wrap="nowrap"><ColorSwatch size={10} color={tColor(r.teamId).hex} /><Text size="sm" fw={700}>{tName(r.teamId)}</Text></Group></Table.Td>
                      <Table.Td ta="right">{r.played}</Table.Td><Table.Td ta="right">{r.win}</Table.Td><Table.Td ta="right">{r.draw}</Table.Td><Table.Td ta="right">{r.loss}</Table.Td>
                      <Table.Td ta="right">{r.gf - r.ga >= 0 ? '+' : ''}{r.gf - r.ga}</Table.Td><Table.Td ta="right" fw={800}>{r.points}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Text size="xs" c="dimmed" mt={4}>승 3점 · 무 1점. 오늘 게임은 골이 기록되면 반영돼요.</Text>
            </Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="scorers">
            <Accordion.Control><Group gap={6}><Text fw={800}>득점·도움 순위</Text>{seasonScorers[0]?.goals ? <Badge variant="light" size="sm">득점 1위 {seasonScorers[0].name}</Badge> : null}</Group></Accordion.Control>
            <Accordion.Panel>
              {seasonScorers.length ? (
                <Table fz="sm" verticalSpacing={4} withRowBorders={false}>
                  <Table.Thead><Table.Tr><Table.Th>선수</Table.Th><Table.Th ta="right">골</Table.Th><Table.Th ta="right">도움</Table.Th><Table.Th ta="right">MVP</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {seasonScorers.slice(0, 15).map((r, i) => (
                      <Table.Tr key={r.id}>
                        <Table.Td>{i + 1}. {r.name}</Table.Td><Table.Td ta="right">{r.goals || ''}</Table.Td><Table.Td ta="right">{r.assists || ''}</Table.Td>
                        <Table.Td ta="right">{[...data.mvps.values()].filter((m) => m === r.id).length || ''}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : <Text size="sm" c="dimmed">아직 골 기록이 없어요.</Text>}
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Card>

      <GoalModal
        target={adding} teams={teamById} rosters={rosterById} names={names} onClose={() => setAdding(null)}
        onSave={async (g) => {
          try { const saved = await addGoal(g); setData((d) => d && { ...d, goals: [...d.goals, saved] }); setAdding(null) }
          catch (e) { notify.error((e as Error).message, '골을 기록하지 못했어요') }
        }}
      />
    </Stack>
  )
}

function rosterIds(r?: Roster): string[] {
  if (!r) return []
  return [r.captain?.id, r.vice?.id, ...r.picks.map((p) => p.player.id)].filter((x): x is string => Boolean(x))
}

function GoalModal({ target, teams, rosters: rs, names, onClose, onSave }: {
  target: { game: DayGame; teamId: string } | null
  teams: Map<string, SeasonTeam>
  rosters: Map<string, Roster>
  names: Map<string, string>
  onClose: () => void
  onSave: (g: NewGoal) => Promise<void>
}) {
  const [kind, setKind] = useState<'GOAL' | 'OWN_GOAL'>('GOAL')
  const [scorer, setScorer] = useState<string | null>(null)
  const [guest, setGuest] = useState('')
  const [assist, setAssist] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reset = () => { setKind('GOAL'); setScorer(null); setGuest(''); setAssist(null) }
  if (!target) return null

  const team = teams.get(target.teamId)
  const otherId = target.teamId === target.game.homeTeamId ? target.game.awayTeamId : target.game.homeTeamId
  const sorted = (ids: string[]) => ids.filter((id) => names.has(id)).sort((a, b) => (names.get(a) ?? '').localeCompare(names.get(b) ?? '', 'ko'))
  const pool = sorted(rosterIds(rs.get(kind === 'OWN_GOAL' ? otherId : target.teamId)))
  const opts = [
    ...pool.map((id) => ({ value: id, label: names.get(id) ?? '' })),
    ...(kind === 'GOAL' ? [{ value: GUEST, label: '용병 (이름 입력)' }] : []),
    { value: UNKNOWN, label: '모름' },
  ]
  const ready = scorer && (scorer !== GUEST || guest.trim())
  const color = TEAM_COLORS[team?.slot ?? 0]

  const save = async () => {
    if (!ready) return
    setBusy(true)
    await onSave({
      gameId: target.game.id, teamId: target.teamId, kind,
      scorerId: scorer && scorer !== GUEST && scorer !== UNKNOWN ? scorer : null,
      scorerName: scorer === GUEST ? guest.trim() : null,
      assistId: kind === 'GOAL' && assist ? assist : null,
    })
    setBusy(false); reset()
  }

  return (
    <Modal opened onClose={() => { reset(); onClose() }} size="sm" title={
      <Group gap={6}><ColorSwatch size={14} color={color.hex} /><Text fw={800}>{target.game.gameNo}경기 {team?.name} 골</Text></Group>
    }>
      <Stack gap="sm">
        <SegmentedControl fullWidth value={kind} onChange={(v) => { setKind(v as 'GOAL' | 'OWN_GOAL'); setScorer(null); setAssist(null) }}
          data={[{ value: 'GOAL', label: '골' }, { value: 'OWN_GOAL', label: `상대 자책골 (${teams.get(otherId)?.name ?? ''})` }]} />
        <Select label={kind === 'OWN_GOAL' ? '자책골 넣은 선수' : '득점'} placeholder="선수 고르기" searchable data={opts} value={scorer} onChange={setScorer} comboboxProps={{ withinPortal: true }} />
        {scorer === GUEST && <TextInput label="용병 이름" maxLength={30} value={guest} onChange={(e) => setGuest(e.currentTarget.value)} autoFocus />}
        {kind === 'GOAL' && (
          <Select label="도움 (선택)" placeholder="없음" searchable clearable
            data={sorted(rosterIds(rs.get(target.teamId))).filter((id) => id !== scorer).map((id) => ({ value: id, label: names.get(id) ?? '' }))}
            value={assist} onChange={setAssist} comboboxProps={{ withinPortal: true }} />
        )}
        <Button onClick={save} loading={busy} disabled={!ready} color={color.mantine}>기록</Button>
      </Stack>
    </Modal>
  )
}
