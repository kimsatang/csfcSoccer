import { useCallback, useEffect, useState } from 'react'
import { fetchMembers } from '../entities/player/api'
import type { SeasonBundle } from '../entities/season'
import { fetchCurrentSeason } from '../entities/season/api'
import { LoginScreen } from '../features/auth/LoginScreen'
import { signOut, useAuth } from '../features/auth/useAuth'
import { isSupabaseConfigured } from '../shared/api/supabase'
import { DraftBoard } from '../widgets/DraftBoard'
import { MatchDay } from '../widgets/MatchDay'
import { MemberManager } from '../widgets/MemberManager'
import { useAppStore } from './store'

type Step = 'members' | 'draft' | 'match'

const STEPS: { key: Step; label: string }[] = [
  { key: 'members', label: '① 회원 관리' },
  { key: 'draft', label: '② 드래프트' },
  { key: 'match', label: '③ 경기 당일' },
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
  const [bundle, setBundle] = useState<SeasonBundle | null>(null)
  const [step, setStep] = useState<Step>('draft')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const reloadSeason = useCallback(async () => {
    setBundle(await fetchCurrentSeason())
  }, [])

  const reload = useCallback(async () => {
    try {
      const [players, season] = await Promise.all([fetchMembers(), fetchCurrentSeason()])
      dispatch({ type: 'member/set', players })
      setBundle(season)
      if (season?.season.status === 'ACTIVE') setStep('match')
      setError(null)
    } catch (e) {
      setError(`데이터를 불러오지 못했습니다: ${(e as Error).message}`)
    } finally {
      setLoaded(true)
    }
  }, [dispatch])

  useEffect(() => { void reload() }, [reload])

  const noSeason = <p className="panel muted">진행 중인 시즌이 없습니다. (Supabase seasons 테이블에 시즌을 추가하세요)</p>

  return (
    <div className="app">
      <header className="topbar">
        <h1><span className="logo">CSFC</span> 팀짜기</h1>
        <nav className="steps">
          {STEPS.map((s) => (
            <button key={s.key} className={`step ${step === s.key ? 'active' : ''}`} onClick={() => setStep(s.key)}>
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {error && <p className="warn">{error}</p>}
        {!loaded && <p className="muted">불러오는 중…</p>}
        {loaded && step === 'members' && <MemberManager members={state.members} dispatch={dispatch} onReload={reload} />}
        {loaded && step === 'draft' && (bundle
          ? <DraftBoard members={state.members} bundle={bundle} showSkill={state.showSkill} onChanged={reloadSeason} />
          : noSeason)}
        {loaded && step === 'match' && (bundle
          ? <MatchDay members={state.members} bundle={bundle} days={state.days} showSkill={state.showSkill} dispatch={dispatch} />
          : noSeason)}
      </main>
      <footer className="foot muted small userbar">
        <span>{email} (운영진)</span>
        <button className="link" onClick={() => signOut()}>로그아웃</button>
      </footer>
    </div>
  )
}
