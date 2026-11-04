import { POSITION_LABEL } from '../../entities/player'
import type { Team } from './buildTeams'
import { TEAM_COLORS, teamStats } from './buildTeams'

/** 단톡방 공유용 텍스트 */
export function teamsToText(teams: Team[], title: string, showSkill = false): string {
  const blocks = teams.map((t) => {
    const color = TEAM_COLORS[t.index]
    const st = teamStats(t)
    const lines = [
      `[${color.label}팀] ${st.size}명${showSkill ? ` · 평균 ${st.avgSkill.toFixed(1)}` : ''}`,
      `팀장 ${t.captain.name} / 부주장 ${t.vice.name}`,
      ...t.members.map((m) => `- ${m.name} (${POSITION_LABEL[m.mainPosition]})`),
    ]
    return lines.join('\n')
  })
  return [`⚽ ${title}`, ...blocks].join('\n\n')
}
