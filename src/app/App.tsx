import { useState } from 'react'
import { buildTeams } from '../features/build-teams'
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
  const [state, dispatch] = useAppStore()
  const [step, setStep] = useState<Step>(state.teams ? 'teams' : 'setup')
  const [error, setError] = useState<string | null>(null)

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
        {step === 'members' && <MemberManager members={state.members} dispatch={dispatch} />}
        {step === 'setup' && (
          <MatchSetup members={state.members} attendance={state.attendance} roles={state.roles} dispatch={dispatch} onBuild={build} />
        )}
        {step === 'teams' && state.teams && (
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
      <footer className="foot muted small">prototype · 데이터는 이 브라우저(localStorage)에만 저장됩니다</footer>
    </div>
  )
}
