/** 전술판 좌표: x 0(왼쪽)~100(오른쪽), y 0(상대 골문)~100(우리 골문) */
export interface Slot {
  key: string
  label: string
  x: number
  y: number
}

const GK: Slot = { key: 'GK', label: 'GK', x: 50, y: 91 }
const BACK4: Slot[] = [
  { key: 'LB', label: 'LB', x: 13, y: 72 },
  { key: 'LCB', label: 'CB', x: 37, y: 77 },
  { key: 'RCB', label: 'CB', x: 63, y: 77 },
  { key: 'RB', label: 'RB', x: 87, y: 72 },
]
const BACK3: Slot[] = [
  { key: 'LCB', label: 'CB', x: 25, y: 76 },
  { key: 'CB', label: 'CB', x: 50, y: 78 },
  { key: 'RCB', label: 'CB', x: 75, y: 76 },
]
const TWO_UP: Slot[] = [
  { key: 'LS', label: 'ST', x: 36, y: 20 },
  { key: 'RS', label: 'ST', x: 64, y: 20 },
]
const FRONT3: Slot[] = [
  { key: 'LW', label: 'LW', x: 16, y: 25 },
  { key: 'ST', label: 'ST', x: 50, y: 17 },
  { key: 'RW', label: 'RW', x: 84, y: 25 },
]

export const FORMATIONS: Record<string, Slot[]> = {
  '4-4-2': [GK, ...BACK4,
    { key: 'LM', label: 'LM', x: 13, y: 47 }, { key: 'LCM', label: 'CM', x: 37, y: 52 },
    { key: 'RCM', label: 'CM', x: 63, y: 52 }, { key: 'RM', label: 'RM', x: 87, y: 47 }, ...TWO_UP],
  '4-3-3': [GK, ...BACK4,
    { key: 'LCM', label: 'CM', x: 27, y: 50 }, { key: 'CM', label: 'CM', x: 50, y: 56 },
    { key: 'RCM', label: 'CM', x: 73, y: 50 }, ...FRONT3],
  '4-2-3-1': [GK, ...BACK4,
    { key: 'LDM', label: 'DM', x: 36, y: 59 }, { key: 'RDM', label: 'DM', x: 64, y: 59 },
    { key: 'LAM', label: 'LW', x: 16, y: 37 }, { key: 'CAM', label: 'AM', x: 50, y: 39 },
    { key: 'RAM', label: 'RW', x: 84, y: 37 }, { key: 'ST', label: 'ST', x: 50, y: 17 }],
  '4-1-4-1': [GK, ...BACK4, { key: 'CDM', label: 'DM', x: 50, y: 62 },
    { key: 'LM', label: 'LM', x: 13, y: 44 }, { key: 'LCM', label: 'CM', x: 37, y: 47 },
    { key: 'RCM', label: 'CM', x: 63, y: 47 }, { key: 'RM', label: 'RM', x: 87, y: 44 },
    { key: 'ST', label: 'ST', x: 50, y: 17 }],
  '3-5-2': [GK, ...BACK3,
    { key: 'LWB', label: 'LWB', x: 10, y: 49 }, { key: 'LCM', label: 'CM', x: 31, y: 54 },
    { key: 'CM', label: 'CM', x: 50, y: 47 }, { key: 'RCM', label: 'CM', x: 69, y: 54 },
    { key: 'RWB', label: 'RWB', x: 90, y: 49 }, ...TWO_UP],
  '3-4-3': [GK, ...BACK3,
    { key: 'LM', label: 'LM', x: 13, y: 49 }, { key: 'LCM', label: 'CM', x: 37, y: 53 },
    { key: 'RCM', label: 'CM', x: 63, y: 53 }, { key: 'RM', label: 'RM', x: 87, y: 49 }, ...FRONT3],
  '5-3-2': [GK,
    { key: 'LWB', label: 'LWB', x: 8, y: 66 }, { key: 'LCB', label: 'CB', x: 29, y: 77 },
    { key: 'CB', label: 'CB', x: 50, y: 79 }, { key: 'RCB', label: 'CB', x: 71, y: 77 },
    { key: 'RWB', label: 'RWB', x: 92, y: 66 },
    { key: 'LCM', label: 'CM', x: 28, y: 50 }, { key: 'CM', label: 'CM', x: 50, y: 54 },
    { key: 'RCM', label: 'CM', x: 72, y: 50 }, ...TWO_UP],
}

export const FORMATION_NAMES = Object.keys(FORMATIONS)
export const DEFAULT_FORMATION = '4-4-2'

export type SlotMap = Record<string, string> // slotKey → memberId

/**
 * 포메이션 변경 시 배정 유지: 같은 키는 그대로, 남은 선수는 새 포메이션의 빈 자리에 순서대로
 */
export function remapSlots(slots: SlotMap, from: string, to: string): SlotMap {
  const fromSlots = FORMATIONS[from] ?? []
  const toSlots = FORMATIONS[to] ?? []
  const out: SlotMap = {}
  const leftovers: string[] = []
  for (const s of fromSlots) {
    const id = slots[s.key]
    if (!id) continue
    if (toSlots.some((t) => t.key === s.key)) out[s.key] = id
    else leftovers.push(id)
  }
  for (const t of toSlots) {
    if (!out[t.key] && leftovers.length) out[t.key] = leftovers.shift()!
  }
  return out
}

/** 선수를 자리에 넣기. 다른 자리에 있던 선수면 자리를 맞바꿈 */
export function assignSlot(slots: SlotMap, slotKey: string, memberId: string | null): SlotMap {
  const next = { ...slots }
  const prevAtSlot = next[slotKey]
  const fromKey = memberId ? Object.keys(next).find((k) => next[k] === memberId) : undefined
  if (memberId) next[slotKey] = memberId
  else delete next[slotKey]
  if (fromKey && fromKey !== slotKey) {
    if (prevAtSlot) next[fromKey] = prevAtSlot
    else delete next[fromKey]
  }
  return next
}
