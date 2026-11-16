import { useCallback, useEffect, useState } from 'react'
import { Accordion, ActionIcon, Badge, Button, Card, Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core'
import { IconChartRadar, IconPlus, IconShieldLock, IconTrash, IconUserPlus, IconX } from '@tabler/icons-react'
import type { GradeStep, RatingVisibility } from '../entities/rating'
import { DEFAULT_GRADES, VISIBILITY_LABEL, gradeRangesText, normalizeGrades, saveRatingSettings } from '../entities/rating'
import type { RatingState } from '../entities/rating/useRatings'
import type { AdminRow } from '../features/auth/adminsApi'
import { addAdmin, fetchAdmins, removeAdmin } from '../features/auth/adminsApi'
import { confirmAction, notify } from '../shared/ui/feedback'

/** 슈퍼 관리자 전용: 운영진(관리자) 추가·삭제, 선수 지표 공개 범위·등급 구간 */
export function AdminPanel({ rating }: { rating?: RatingState }) {
  const [rows, setRows] = useState<AdminRow[]>([])
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => { fetchAdmins().then(setRows).catch((e) => notify.error((e as Error).message)) }, [])
  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try { await addAdmin(email, name); setEmail(''); setName(''); notify.ok('운영진을 추가했습니다.'); load() }
    catch (err) { notify.error((err as Error).message) }
    finally { setBusy(false) }
  }
  const remove = async (r: AdminRow) => {
    if (!(await confirmAction({ title: `${r.name ?? r.email} 운영진을 삭제할까요?`, confirmLabel: '삭제', danger: true }))) return
    try { await removeAdmin(r.email); notify.ok('삭제했습니다.'); load() }
    catch (e) { notify.error((e as Error).message) }
  }

  return (
    <Card padding={0}>
      <Accordion variant="default" chevronPosition="right">
        <Accordion.Item value="admins" style={{ borderBottom: 0 }}>
          <Accordion.Control icon={<IconShieldLock size={20} color="var(--mantine-color-brand-8)" />}>
            <Group gap={8}><Text fw={800}>운영진 관리</Text><Badge variant="light" size="sm">{rows.length}명</Badge><Text size="xs" c="dimmed">슈퍼 관리자 전용</Text></Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <form onSubmit={add}>
                <Group gap="xs" align="flex-end" wrap="wrap">
                  <TextInput type="email" required label="이메일" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.currentTarget.value)} style={{ flex: 2, minWidth: 180 }} />
                  <TextInput label="이름" value={name} onChange={(e) => setName(e.currentTarget.value)} style={{ flex: 1, minWidth: 100 }} />
                  <Button type="submit" loading={busy} leftSection={<IconUserPlus size={16} />}>추가</Button>
                </Group>
              </form>
              <Stack gap={6}>
                {rows.map((r) => (
                  <Group key={r.email} justify="space-between" wrap="nowrap" p="xs" style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <Group gap={6}><Text fw={700} size="sm">{r.name ?? '-'}</Text>{r.role === 'SUPER' && <Badge size="xs">슈퍼 관리자</Badge>}</Group>
                      <Text size="xs" c="dimmed" truncate>{r.email}</Text>
                    </div>
                    {r.role !== 'SUPER' && <ActionIcon variant="subtle" color="red" onClick={() => remove(r)} aria-label="삭제"><IconTrash size={16} /></ActionIcon>}
                  </Group>
                ))}
              </Stack>
              <Text size="xs" c="dimmed">추가된 운영진은 이메일 인증번호로 로그인하면 바로 운영진 화면을 씁니다.</Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        {rating?.available && rating.settings && (
          <Accordion.Item value="ratings" style={{ borderBottom: 0, borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Accordion.Control icon={<IconChartRadar size={20} color="var(--mantine-color-brand-8)" />}>
              <Group gap={8}><Text fw={800}>선수 지표·등급</Text><Badge variant="light" size="sm">{VISIBILITY_LABEL[rating.settings.visibility]}</Badge></Group>
            </Accordion.Control>
            <Accordion.Panel><RatingSettingsForm key={JSON.stringify(rating.settings)} rating={rating} /></Accordion.Panel>
          </Accordion.Item>
        )}
      </Accordion>
    </Card>
  )
}

const VIS_HELP: Record<RatingVisibility, string> = {
  super: '슈퍼 관리자만 지표를 보고 입력해요.',
  admin: '운영진이 지표를 보고 입력해요. 팀장·부팀장에게는 보이지 않아요.',
  leader_grade: '운영진은 지표를, 팀장·부팀장은 숫자 없이 등급만 봐요(드래프트·명단에 등급 배지).',
  leader_all: '팀장·부팀장도 지표 그래프까지 봐요. 입력은 운영진만.',
}

function RatingSettingsForm({ rating }: { rating: RatingState }) {
  const s = rating.settings!
  const [steps, setSteps] = useState<GradeStep[]>(s.grades)
  const [busy, setBusy] = useState(false)
  const save = async (patch: { visibility?: RatingVisibility; grades?: GradeStep[] }) => {
    setBusy(true)
    try { await saveRatingSettings(patch); notify.ok('저장했습니다.'); await rating.reload() }
    catch (e) { notify.error((e as Error).message) }
    finally { setBusy(false) }
  }
  const setStep = (i: number, patch: Partial<GradeStep>) => setSteps((x) => x.map((st, j) => (j === i ? { ...st, ...patch } : st)))
  const preview = normalizeGrades(steps)
  const dirty = JSON.stringify(preview) !== JSON.stringify(s.grades)
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">공격·테크닉·패스·수비·피지컬·스피드(1~10) 평균으로 등급을 매겨요. 회원 화면에서 회원을 눌러 입력합니다.</Text>
      <Select
        label="지표 공개 범위" allowDeselect={false} disabled={busy} maw={340}
        data={(Object.keys(VISIBILITY_LABEL) as RatingVisibility[]).map((v) => ({ value: v, label: VISIBILITY_LABEL[v] }))}
        value={s.visibility} onChange={(v) => v && void save({ visibility: v as RatingVisibility })}
        description={VIS_HELP[s.visibility]}
      />
      <Text size="sm" fw={500}>등급 구간 (지표 평균이 이 값 이상)</Text>
      <Stack gap={6} maw={340}>
        {steps.map((st, i) => (
          <Group key={i} gap={6} wrap="nowrap">
            <TextInput size="xs" w={80} value={st.grade} maxLength={4} aria-label={`${i + 1}번째 등급 이름`} onChange={(e) => setStep(i, { grade: e.currentTarget.value })} />
            <NumberInput size="xs" w={100} min={0} max={10} step={0.5} decimalScale={1} value={st.min} aria-label={`${st.grade} 최소 평균`} onChange={(v) => setStep(i, { min: Number(v) || 0 })} />
            <Text size="xs" c="dimmed">이상</Text>
            {steps.length > 2 && <ActionIcon size="sm" variant="subtle" color="gray" aria-label={`${st.grade} 등급 빼기`} onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}><IconX size={14} /></ActionIcon>}
          </Group>
        ))}
      </Stack>
      <Text size="xs" c="dimmed">미리보기: {gradeRangesText(preview)}</Text>
      <Group gap={6}>
        {steps.length < 8 && <Button size="xs" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => setSteps((x) => [...x, { grade: '', min: 0 }])}>등급 추가</Button>}
        <Button size="xs" variant="subtle" color="gray" onClick={() => setSteps(DEFAULT_GRADES)}>기본값(S~D)</Button>
        <Button size="xs" disabled={!dirty} loading={busy} onClick={() => void save({ grades: preview })}>등급 구간 저장</Button>
      </Group>
    </Stack>
  )
}
