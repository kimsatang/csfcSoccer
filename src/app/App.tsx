import { useCallback, useEffect, useState } from 'react'
import { fetchMembers } from '../entities/player/api'
import { LoginScreen } from '../features/auth/LoginScreen'
import { signOut, useAuth } from '../features/auth/useAuth'
import { buildTeams } from '../features/build-teams'
import { isSupabaseConfigured } from '../shared/api/supabase'
import { MatchSetup } from '../widgets/MatchSetup'
import { MemberManager } from '../widgets/MemberManager'
import { TeamBoard } from '../widgets/TeamBoard'
import { useAppStore } from './store'

type Step = 'members' | 'setup' | 'teams'

const STEPS: { key: Step; label: string }[] = [
  { key: 'members', label: '① 회원 관리' },
  { key: 'setup', label: '② 참석·역할' },
  { key: 'teams', label: '③ 팀 편성' },
]

export default function App() {
  const auth = useAuth()

  if (!isSupabaseConfigured) {
    return <p className="center warn">VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 환경변수가 없습니다. (.env.example 참고)</p>
  }
  if (auth.status === 'loading') return <p className="center muted">불러오는 중…</p>
  if (auth.status === 'signedOut') return <LoginScreen />
  if (auth.status === 'forbidden') return <LoginScreen forbiddenEmail={auth.email} />
  return <TeamMaker email={auth.email} />
}

function TeamMaker({ email }: { email: string }) {
  const [state, dispatch] = useAppStore()
  const [step, setStep] = useState<Step>(state.teams ? 'teams' : 'setup')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    try {
      const players = await fetchMembers()
      dispatch({ type: 'member/set', players })
      if (!players.length) setStep('members')
      setError(null)
    } catch (e) {
      setError(`회원 목록을 불러오지 못했습니다: ${(e as Error).message}`)
    } finally {
      setLoaded(true)
    }
  }, [dispatch])

  useEffect(() => { void reload() }, [reload])

  const build = () => {
    const attendees = state.members.filter((m) => m.status === 'ACTIVE' && state.attendance.includes(m.id))
    const captainIds = attendees.filter((m) => state.roles[m.id] === 'CAPTAIN').map((m) => m.id)
    const viceIds = attendees.filter((m) => state.roles[m.id] === 'VICE').map((m) => m.id)
    try {
      const { teams } = buildTeams({ attendees, captainIds, viceIds })
      dispatch({ type: 'teams/set', teams })
      setError(null)
      setStep('teams')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1><span className="logo">CSFC</span> 팀짜기</h1>
        <nav className="steps">
          {STEPS.map((s) => (
            <button
              key={s.key}
              className={`step ${step === s.key ? 'active' : ''}`}
              disabled={s.key === 'teams' && !state.teams}
              onClick={() => setStep(s.key)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {error && <p className="warn">{error}</p>}
        {!loaded && <p className="muted">회원 목록 불러오는 중…</p>}
        {loaded && step === 'members' && <MemberManager members={state.members} dispatch={dispatch} onReload={reload} />}
        {loaded && step === 'setup' && (
          <MatchSetup members={state.members} attendance={state.attendance} roles={state.roles} dispatch={dispatch} onBuild={build} />
        )}
        {loaded && step === 'teams' && state.teams && (
          <TeamBoard
            teams={state.teams}
            title={state.matchTitle}
            showSkill={state.showSkill}
            dispatch={dispatch}
            onReshuffle={build}
            onBack={() => setStep('setup')}
          />
        )}
      </main>
      <footer className="foot muted small userbar">
        <span>{email} (운영진)</span>
        <button className="link" onClick={() => signOut()}>로그아웃</button>
      </footer>
    </div>
  )
}
