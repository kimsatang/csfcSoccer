import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActionIcon, Alert, AppShell, Avatar, Badge, Box, Center, Container, Group, Loader, Menu, SegmentedControl, Stack, Text, UnstyledButton,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconCalendarEvent, IconListDetails, IconLogout, IconShirtSport, IconTournament, IconUsers } from '@tabler/icons-react'
import { fetchMembers, fetchMembersForLeader } from '../entities/player/api'
import type { SeasonBundle } from '../entities/season'
import { fetchCurrentSeason } from '../entities/season/api'
import { LoginScreen } from '../features/auth/LoginScreen'
import type { Viewer } from '../features/auth/useAuth'
import { signOut, useAuth } from '../features/auth/useAuth'
import { InviteConfirm } from '../features/invite/InviteConfirm'
import { LEADER_ROLE_LABEL } from '../features/invite/api'
import { isSupabaseConfigured } from '../shared/api/supabase'
import { AdminPanel } from '../widgets/AdminPanel'
import { FinalRoster } from '../widgets/FinalRoster'
import { DraftBoard } from '../widgets/DraftBoard'
import { MatchDay } from '../widgets/MatchDay'
import { MemberManager } from '../widgets/MemberManager'
import { TeamManager } from '../widgets/TeamManager'
import { useAppStore } from './store'

type Step = 'members' | 'draft' | 'roster' | 'team' | 'match'

const STEP_META: Record<Step, { label: string; icon: typeof IconUsers }> = {
  members: { label: '회원', icon: IconUsers },
  draft: { label: '드래프트', icon: IconTournament },
  roster: { label: '명단', icon: IconListDetails },
  team: { label: '팀 관리', icon: IconShirtSport },
  match: { label: '경기 당일', icon: IconCalendarEvent },
}

export default function App() {
  const [auth, refresh] = useAuth()

  if (!isSupabaseConfigured) {
    return (
      <Center h="100dvh" p="md">
        <Alert color="red" title="환경변수 없음">VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 를 설정하세요. (.env.example 참고)</Alert>
      </Center>
    )
  }
  if (auth.status === 'loading') return <Center h="100dvh"><Loader /></Center>
  if (auth.status === 'signedOut') return <LoginScreen />
  if (auth.status === 'invite') return <InviteConfirm email={auth.email} token={auth.token} info={auth.info} onDone={refresh} />
  if (auth.status === 'forbidden') return <LoginScreen forbiddenEmail={auth.email} />
  return <TeamMaker viewer={auth.viewer} />
}

function TeamMaker({ viewer }: { viewer: Viewer }) {
  const [state, dispatch] = useAppStore()
  const [bundle, setBundle] = useState<SeasonBundle | null>(null)
  const steps: Step[] = viewer.isAdmin ? ['members', 'draft', 'roster', 'team', 'match'] : ['draft', 'roster', 'team']
  const [step, setStep] = useState<Step>('draft')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const isMobile = useMediaQuery('(max-width: 48em)', true)
  const myTeamIds = useMemo(() => viewer.leaderTeams.map((l) => l.teamId), [viewer])

  const reloadSeason = useCallback(async () => {
    setBundle(await fetchCurrentSeason())
  }, [])

  const reload = useCallback(async () => {
    try {
      const [players, season] = await Promise.all([viewer.isAdmin ? fetchMembers() : fetchMembersForLeader(), fetchCurrentSeason()])
      dispatch({ type: 'member/set', players })
      setBundle(season)
      if (season?.season.status === 'ACTIVE') setStep('team')
      setError(null)
    } catch (e) {
      setError(`데이터를 불러오지 못했습니다: ${(e as Error).message}`)
    } finally {
      setLoaded(true)
    }
  }, [dispatch, viewer.isAdmin])

  useEffect(() => { void reload() }, [reload])
  // 실력 점수는 운영진만
  const showSkill = viewer.isAdmin && state.showSkill
  useEffect(() => { window.scrollTo({ top: 0 }) }, [step])

  const myRoles = viewer.leaderTeams
    .map((l) => {
      const t = bundle?.teams.find((x) => x.id === l.teamId)
      return t ? `${t.name} ${LEADER_ROLE_LABEL[l.role]}` : null
    })
    .filter(Boolean) as string[]
  const roleText = [viewer.isSuper ? '슈퍼 관리자' : viewer.isAdmin ? '운영진' : null, ...myRoles].filter(Boolean).join(' · ')

  const noSeason = <Alert color="gray" title="진행 중인 시즌이 없습니다">Supabase seasons 테이블에 시즌을 추가하세요.</Alert>

  return (
    <AppShell
      header={{ height: 56 }}
      footer={isMobile ? { height: 64 } : undefined}
      padding={isMobile ? 'xs' : 'md'}
    >
      <AppShell.Header className="app-header">
        <Container size="lg" h="100%" px={isMobile ? 'sm' : 'md'}>
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Group gap={8} wrap="nowrap" miw={0}>
              <Badge size="lg" radius="sm" variant="filled" fw={900}>CSFC</Badge>
              <Box miw={0}>
                <Text fw={800} size="sm" lh={1.1}>팀짜기</Text>
                {bundle && <Text size="xs" c="dimmed" truncate>{bundle.season.name}</Text>}
              </Box>
            </Group>

            {!isMobile && (
              <SegmentedControl
                value={step}
                onChange={(v) => setStep(v as Step)}
                data={steps.map((s) => ({ value: s, label: STEP_META[s].label }))}
                radius="xl"
              />
            )}

            <Menu position="bottom-end" width={240} shadow="md">
              <Menu.Target>
                <ActionIcon variant="subtle" size="lg" radius="xl" aria-label="내 계정">
                  <Avatar size={32} radius="xl" color="brand">{viewer.email[0]?.toUpperCase()}</Avatar>
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{viewer.email}</Menu.Label>
                <Box px="sm" pb="xs"><Text size="xs" fw={700} c="brand">{roleText}</Text></Box>
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={() => signOut()}>로그아웃</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main className="app-main">
        <Container size="lg" px={0}>
          <Stack gap="md">
            {error && <Alert color="red">{error}</Alert>}
            {!loaded && <Center py="xl"><Loader /></Center>}
            {loaded && step === 'members' && viewer.isAdmin && (
              <>
                {viewer.isSuper && <AdminPanel />}
                <MemberManager members={state.members} dispatch={dispatch} onReload={reload} canDelete={viewer.isSuper} />
              </>
            )}
            {loaded && step === 'draft' && (bundle
              ? <DraftBoard members={state.members} bundle={bundle} showSkill={showSkill} onChanged={reloadSeason} isAdmin={viewer.isAdmin} isSuper={viewer.isSuper} myTeamIds={myTeamIds} />
              : noSeason)}
            {loaded && step === 'roster' && (bundle ? <FinalRoster members={state.members} bundle={bundle} /> : noSeason)}
            {loaded && step === 'team' && (bundle ? <TeamManager members={state.members} bundle={bundle} viewer={viewer} /> : noSeason)}
            {loaded && step === 'match' && viewer.isAdmin && (bundle
              ? <MatchDay members={state.members} bundle={bundle} days={state.days} showSkill={showSkill} dispatch={dispatch} />
              : noSeason)}
          </Stack>
        </Container>
      </AppShell.Main>

      {isMobile && <AppShell.Footer className="bottom-nav">
        <Group h="100%" grow gap={0}>
          {steps.map((s) => {
            const Icon = STEP_META[s].icon
            const active = s === step
            return (
              <UnstyledButton key={s} className={`bottom-nav-item ${active ? 'active' : ''}`} onClick={() => setStep(s)} aria-current={active ? 'page' : undefined}>
                <Stack gap={2} align="center">
                  <Icon size={22} stroke={active ? 2.2 : 1.6} />
                  <Text size="xs" fw={active ? 800 : 500}>{STEP_META[s].label}</Text>
                </Stack>
              </UnstyledButton>
            )
          })}
        </Group>
      </AppShell.Footer>}
    </AppShell>
  )
}
