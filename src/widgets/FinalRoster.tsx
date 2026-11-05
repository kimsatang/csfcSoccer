import { useMemo, useState } from 'react'
import {
  Alert, Badge, Button, Card, Group, Menu, Modal, SegmentedControl, SimpleGrid, Stack, Text, Title,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconCopy, IconDots, IconPhotoDown } from '@tabler/icons-react'
import type { Player } from '../entities/player'
import { AGE_GROUPS, POSITIONS, POSITION_LABEL, UNKNOWN_AGE, ageGroupOf, shortYear } from '../entities/player'
import type { Roster, SeasonBundle } from '../entities/season'
import { matchDates, rosters, shortDate } from '../entities/season'
import { exportCanvas } from '../entities/team/renderLineup'
import type { RosterImageMeta, RosterImagePlayer, RosterImageTeam } from '../entities/team/renderRoster'
import { renderAllRosters, renderTeamRoster } from '../entities/team/renderRoster'
import { TEAM_COLORS } from '../features/build-teams'
import { AttBadge, PosBadge, RoleBadge } from '../shared/ui/badges'
import { copyText, notify } from '../shared/ui/feedback'
import { draftText } from './DraftBoard'

type SortKey = 'pick' | 'age' | 'pos'
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'pick', label: '지명순' },
  { value: 'age', label: '나이순' },
  { value: 'pos', label: '포지션순' },
]
const POS_ORDER = Object.fromEntries(POSITIONS.map((p, i) => [p, i]))
const ALL_AGE_GROUPS = [...AGE_GROUPS, UNKNOWN_AGE]

interface Row { player: Player; role?: '팀장' | '부팀장'; pickNo?: number }

function rowsOf(r: Roster, sort: SortKey): Row[] {
  const leaders: Row[] = [
    ...(r.captain ? [{ player: r.captain, role: '팀장' as const }] : []),
    ...(r.vice ? [{ player: r.vice, role: '부팀장' as const }] : []),
  ]
  const picks: Row[] = r.picks.map(({ pickNo, player }) => ({ player, pickNo }))
  const byAge = (a: Row, b: Row) => (a.player.birthYear ?? 9999) - (b.player.birthYear ?? 9999) || a.player.name.localeCompare(b.player.name)
  if (sort === 'age') picks.sort(byAge)
  if (sort === 'pos') {
    const posKey = (x: Row) => (x.player.positionReview ? 99 : POS_ORDER[x.player.mainPosition] ?? 98)
    picks.sort((a, b) => posKey(a) - posKey(b) || byAge(a, b))
  }
  return [...leaders, ...picks]
}

function toImageTeam(r: Roster, sort: SortKey): RosterImageTeam {
  const players: RosterImagePlayer[] = rowsOf(r, sort).map(({ player, role, pickNo }) => ({
    name: player.name,
    year: shortYear(player.birthYear),
    pos: player.positionReview ? undefined : player.mainPosition,
    role,
    pickNo,
  }))
  return { name: r.team.name, color: TEAM_COLORS[r.team.slot].hex, players }
}

export function FinalRoster({ members, bundle }: { members: Player[]; bundle: SeasonBundle }) {
  const { season } = bundle
  const isMobile = useMediaQuery('(max-width: 48em)', true)
  const [sort, setSort] = useState<SortKey>('pick')
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const teamRosters = useMemo(() => rosters(members, bundle), [members, bundle])
  const drafting = season.status === 'DRAFTING'
  const dates = matchDates(season)
  const meta: RosterImageMeta = {
    seasonName: season.name,
    dates: dates.map(shortDate).join(' · '),
    status: drafting ? `드래프트 진행 중 (${bundle.picks.length}명 지명)` : '최종 확정',
  }
  const total = teamRosters.reduce((s, r) => s + 2 + r.picks.length, 0)

  const save = async (key: string, title: string, canvas: HTMLCanvasElement, filename: string) => {
    setSaving(key)
    try {
      await document.fonts?.ready
      setPreview({ url: canvas.toDataURL('image/png'), title })
      await exportCanvas(canvas, filename)
    } catch (e) {
      notify.error((e as Error).message)
    } finally {
      setSaving(null)
    }
  }
  const saveAll = () => save('all', '3팀 최종 명단', renderAllRosters(teamRosters.map((r) => toImageTeam(r, sort)), meta), `${season.name}_최종명단.png`)
  const saveTeam = (r: Roster) => save(r.team.id, `${r.team.name} 명단`, renderTeamRoster(toImageTeam(r, sort), meta), `${season.name}_${r.team.name}.png`)

  return (
    <Stack gap="sm">
      <Card padding="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <Group gap={8}>
              <Title order={3}>최종 명단</Title>
              <Badge color={drafting ? 'orange' : 'brand'} variant="light">{drafting ? '드래프트 진행 중' : '팀 확정'}</Badge>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>{season.name} · 총 {total}명</Text>
            <Text size="xs" c="dimmed">{meta.dates} 경기</Text>
          </div>
          <Menu position="bottom-end" shadow="md">
            <Menu.Target><Button variant="default" px={10} aria-label="더보기"><IconDots size={18} /></Button></Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconCopy size={16} />} onClick={() => copyText(draftText(season.name, dates, teamRosters), '팀 명단을 복사했습니다.')}>
                텍스트로 복사 (단톡방용)
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        {drafting && (
          <Alert mt="sm" color="orange" variant="light" p="xs">
            아직 드래프트가 끝나지 않았습니다. 지금까지 지명된 명단 기준으로 보여 줍니다.
          </Alert>
        )}

        <Stack gap={8} mt="md">
          <SegmentedControl fullWidth value={sort} onChange={(v) => setSort(v as SortKey)} data={SORTS} />
          <Button size="md" leftSection={<IconPhotoDown size={18} />} loading={saving === 'all'} onClick={() => void saveAll()}>
            3팀 한 장으로 이미지 저장
          </Button>
        </Stack>
      </Card>

      <SimpleGrid cols={isMobile ? 1 : 3} spacing="sm">
        {teamRosters.map((r) => (
          <TeamRosterCard key={r.team.id} roster={r} rows={rowsOf(r, sort)} saving={saving === r.team.id} onSave={() => void saveTeam(r)} />
        ))}
      </SimpleGrid>

      <Modal opened={!!preview} onClose={() => setPreview(null)} title={<Text fw={800}>{preview?.title}</Text>} size="lg">
        {preview && (
          <Stack gap="xs">
            <img src={preview.url} alt={preview.title} className="preview-img" />
            <Text size="xs" c="dimmed" ta="center">저장이 안 되면 이미지를 길게 눌러 저장하세요.</Text>
          </Stack>
        )}
      </Modal>
    </Stack>
  )
}

function TeamRosterCard({ roster, rows, saving, onSave }: { roster: Roster; rows: Row[]; saving: boolean; onSave: () => void }) {
  const color = TEAM_COLORS[roster.team.slot]
  const players = rows.map((r) => r.player)
  const positioned = players.filter((p) => !p.positionReview)
  return (
    <Card padding="sm" className="team-card" style={{ ['--team' as string]: color.hex }}>
      <Group justify="space-between" mb={6} wrap="nowrap">
        <div>
          <Text fw={900} size="lg" c={`${color.mantine}.8`} lh={1.2}>{roster.team.name}</Text>
          <Text size="xs" c="dimmed" fw={700}>{players.length}명</Text>
        </div>
        <Button size="xs" variant="light" color={color.mantine} leftSection={<IconPhotoDown size={14} />} loading={saving} onClick={onSave}>
          이미지 저장
        </Button>
      </Group>
      <Group gap={4} mb={6}>
        {ALL_AGE_GROUPS.map((g) => {
          const n = players.filter((p) => ageGroupOf(p).key === g.key).length
          return n > 0 ? <Badge key={g.key} size="xs" variant="default" radius="sm">{g.label.replace('년생', '').replace(' 이후', '+')} {n}</Badge> : null
        })}
      </Group>
      {positioned.length > 0 && (
        <Group gap={4} mb={8}>
          {POSITIONS.map((p) => {
            const n = positioned.filter((x) => x.mainPosition === p).length
            return n > 0 ? <Badge key={p} size="xs" variant="outline" radius="sm">{POSITION_LABEL[p]} {n}</Badge> : null
          })}
          {players.length - positioned.length > 0 && <Badge size="xs" variant="outline" color="gray" radius="sm">미입력 {players.length - positioned.length}</Badge>}
        </Group>
      )}
      <Stack gap={4}>
        {rows.map(({ player: p, role }) => (
          <Group key={p.id} gap={6} wrap="nowrap" px={8} py={5}
            style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 8, background: role ? `var(--mantine-color-${color.mantine}-0)` : 'white' }}>
            {role && <RoleBadge role={role} color={color.mantine} />}
            <Text fw={role ? 800 : 700} size="sm" style={{ flex: 1 }} truncate>{p.name} <span className="year">{shortYear(p.birthYear)}</span></Text>
            <AttBadge level={p.attendanceLevel} compact />
            {!p.positionReview && <PosBadge pos={p.mainPosition} size="xs" />}
          </Group>
        ))}
      </Stack>
    </Card>
  )
}
