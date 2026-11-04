import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchMembers } from '../entities/player/api'
import type { SeasonBundle } from '../entities/season'
import { fetchCurrentSeason } from '../entities/season/api'
import { LoginScreen } from '../features/auth/LoginScreen'
import type { Viewer } from '../features/auth/useAuth'
import { signOut, useAuth } from '../features/auth/useAuth'
import { InviteConfirm } from '../features/invite/InviteConfirm'
import { LEADER_ROLE_LABEL } from '../features/invite/api'
import { isSupabaseConfigured } from '../shared/api/supabase'
import { DraftBoard } from '../widgets/DraftBoard'
import { MatchDay } from '../widgets/MatchDay'
import { AdminPanel } from '../widgets/AdminPanel'
import { MemberManager } from '../widgets/MemberManager'
import { TeamManager } from '../widgets/TeamManager'
import { useAppStore } from './store'

type Step = 'members' | 'draft' | 'match' | 'team'

const STEP_LABEL: Record<Step, string> = {
  members: '회원',
  draft: '드래프트',
  match: '경기 당일',
  team: '팀 관리',
}

export default function App() {
  const [auth, refresh] = useAuth()

  if (!isSupabaseConfigured) {
    return <p className="center warn">VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 환경변수가 없습니다. (.env.example 참고)</p>
  }
  if (auth.status === 'loading') return <p className="center muted">불러오는 중…</p>
  if (auth.status === 'signedOut') return <LoginScreen />
  if (auth.status === 'invite') return <InviteConfirm email={auth.email} token={auth.token} info={auth.info} onDone={refresh} />
  if (auth.status === 'forbidden') return <LoginScreen forbiddenEmail={auth.email} />
  return <TeamMaker viewer={auth.viewer} />
}

function TeamMaker({ viewer }: { viewer: Viewer }) {
  const [state, dispatch] = useAppStore()
  const [bundle, setBundle] = useState<SeasonBundle | null>(null)
  const steps: Step[] = viewer.isAdmin ? ['members', 'draft', 'team', 'match'] : ['draft', 'team']
  const [step, setStep] = useState<Step>('draft')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const myTeamIds = useMemo(() => viewer.leaderTeams.map((l) => l.teamId), [viewer])

  const reloadSeason = useCallback(async () => {
    setBundle(await fetchCurrentSeason())
  }, [])

  const reload = useCallback(async () => {
    try {
      const [players, season] = await Promise.all([fetchMembers(), fetchCurrentSeason()])
      dispatch({ type: 'member/set', players })
      setBundle(season)
      // 드래프트가 끝났으면 바로 팀 관리 화면으로
      if (season?.season.status === 'ACTIVE') setStep('team')
      setError(null)
    } catch (e) {
      setError(`데이터를 불러오지 못했습니다: ${(e as Error).message}`)
    } finally {
      setLoaded(true)
    }
  }, [dispatch])

  useEffect(() => { void reload() }, [reload])

  const myRoles = viewer.leaderTeams
    .map((l) => {
      const t = bundle?.teams.find((x) => x.id === l.teamId)
      return t ? `${t.name} ${LEADER_ROLE_LABEL[l.role]}` : null
    })
    .filter(Boolean)
    .join(', ')

  const noSeason = <p className="panel muted">진행 중인 시즌이 없습니다. (Supabase seasons 테이블에 시즌을 추가하세요)</p>

  return (
    <div className="app">
      <header className="topbar">
        <h1><span className="logo">CSFC</span> 팀짜기</h1>
        <nav className="steps">
          {steps.map((s) => (
            <button key={s} className={`step ${step === s ? 'active' : ''}`} onClick={() => setStep(s)}>
              {STEP_LABEL[s]}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {error && <p className="warn">{error}</p>}
        {!loaded && <p className="muted">불러오는 중…</p>}
        {loaded && step === 'members' && viewer.isAdmin && (
          <>
            {viewer.isSuper && <AdminPanel />}
            <MemberManager members={state.members} dispatch={dispatch} onReload={reload} />
          </>
        )}
        {loaded && step === 'draft' && (bundle
          ? <DraftBoard members={state.members} bundle={bundle} showSkill={state.showSkill} onChanged={reloadSeason} isAdmin={viewer.isAdmin} myTeamIds={myTeamIds} />
          : noSeason)}
        {loaded && step === 'team' && (bundle ? <TeamManager members={state.members} bundle={bundle} viewer={viewer} /> : noSeason)}
        {loaded && step === 'match' && viewer.isAdmin && (bundle
          ? <MatchDay members={state.members} bundle={bundle} days={state.days} showSkill={state.showSkill} dispatch={dispatch} />
          : noSeason)}
      </main>
      <footer className="foot muted small userbar">
        <span>{viewer.email} ({[viewer.isSuper ? '슈퍼 관리자' : viewer.isAdmin && '운영진', myRoles].filter(Boolean).join(' · ')})</span>
        <button className="link" onClick={() => signOut()}>로그아웃</button>
      </footer>
    </div>
  )
}
