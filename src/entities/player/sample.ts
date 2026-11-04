import type { Player, Position } from './model'

// 프로토타입용 가상 회원 24명 (실제 회원 아님)
const RAW: [string, Position, Position | undefined, number][] = [
  ['김민준', 'GK', undefined, 7],
  ['이서준', 'GK', 'DF', 5],
  ['박도윤', 'DF', 'GK', 6],
  ['최예준', 'FW', 'MF', 9],
  ['정시우', 'MF', 'FW', 8],
  ['강하준', 'DF', 'MF', 7],
  ['조주원', 'MF', 'DF', 6],
  ['윤지호', 'FW', undefined, 7],
  ['장지후', 'DF', undefined, 5],
  ['임준우', 'MF', 'FW', 9],
  ['한현우', 'DF', 'MF', 4],
  ['오준서', 'FW', 'MF', 6],
  ['서건우', 'MF', undefined, 5],
  ['신도현', 'DF', 'FW', 8],
  ['권우진', 'FW', undefined, 4],
  ['황선우', 'MF', 'DF', 7],
  ['안연우', 'DF', undefined, 3],
  ['송유준', 'FW', 'MF', 8],
  ['전정우', 'MF', 'FW', 4],
  ['홍승우', 'DF', 'MF', 6],
  ['유승현', 'GK', 'MF', 4],
  ['고시윤', 'MF', undefined, 3],
  ['문준혁', 'FW', 'DF', 5],
  ['양은우', 'DF', undefined, 6],
]

export const SAMPLE_MEMBERS: Player[] = RAW.map(([name, mainPosition, subPosition, skill], i) => ({
  id: `sample_${i + 1}`,
  name,
  mainPosition,
  subPosition,
  skill,
  backNumber: i + 1,
  status: 'ACTIVE',
}))

export const CSV_TEMPLATE = `이름,등번호,주포지션,부포지션,실력,상태,메모
홍길동,7,FW,MF,8,활동,
김철수,1,GK,,6,활동,주말만 가능`
