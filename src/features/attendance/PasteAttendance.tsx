import { useEffect, useMemo, useState } from 'react'
import {
  Accordion, Alert, Badge, Button, Chip, CloseButton, FileButton, Group, Modal, NumberInput, Progress, SegmentedControl,
  Select, Stack, Text, Textarea,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconAlertTriangle, IconCircleCheck, IconPhoto, IconPlus } from '@tabler/icons-react'
import type { Player } from '../../entities/player'
import { shortYear } from '../../entities/player'
import { confirmAction, notify } from '../../shared/ui/feedback'
import type { OcrOutput } from './ocr'
import type { ParseResult } from './parseNames'
import { mergeResults, parseNames } from './parseNames'

type Source = 'text' | 'image'
type Mode = 'replace' | 'add'

interface Props {
  opened: boolean
  onClose: () => void
  /** 전체 회원 (휴면 포함 — 휴면 회원 이름을 따로 알려 주기 위해) */
  members: Player[]
  /** 현재 체크된 참석자 */
  current: string[]
  /** 회원 id → 팀 색 (mantine color) */
  teamColor: (id: string) => string | undefined
  onApply: (ids: string[]) => void
}

const label = (m: Player) => `${m.name} ${shortYear(m.birthYear)}`.trim()

/** 카톡 투표 결과를 붙여넣기·스크린샷으로 가져와 참석 체크 (인원수 검증, 동명이인·오타 확인) */
export function PasteAttendance({ opened, onClose, members, current, teamColor, onApply }: Props) {
  const isMobile = useMediaQuery('(max-width: 48em)', true)
  const [source, setSource] = useState<Source>('image')
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [ocr, setOcr] = useState<OcrOutput | null>(null)
  const [ocrProgress, setOcrProgress] = useState<number | null>(null)
  const [sectionIdx, setSectionIdx] = useState(0)
  const [declared, setDeclared] = useState<number | ''>('')
  const [mode, setMode] = useState<Mode>('replace')
  // 사람이 확인한 것들
  const [picked, setPicked] = useState<Record<string, string>>({}) // 동명이인 token → id
  const [accepted, setAccepted] = useState<string[]>([]) // 오타 제안 수락 (회원 id)
  const [manual, setManual] = useState<string[]>([]) // 직접 추가
  const [excluded, setExcluded] = useState<string[]>([]) // 자동 체크에서 뺀 사람

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const nameMembers = useMemo(() => members.map((m) => ({ id: m.id, name: m.name, birthYear: m.birthYear })), [members])

  const result: ParseResult | null = useMemo(() => {
    if (source === 'text') return text.trim() ? parseNames(text, nameMembers) : null
    if (!ocr) return null
    return mergeResults([parseNames(ocr.raw, nameMembers), parseNames(ocr.prep, nameMembers)])
  }, [source, text, ocr, nameMembers])

  const sections = result?.sections ?? []
  const section = sections[Math.min(sectionIdx, Math.max(0, sections.length - 1))]

  // 결과·항목이 바뀌면 확인 상태 초기화, 투표 인원은 제목의 숫자로
  useEffect(() => {
    setPicked({}); setAccepted([]); setManual([]); setExcluded([])
    setDeclared(section?.declared ?? '')
  }, [result, sectionIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setText(''); setFiles([]); setOcr(null); setOcrProgress(null); setSectionIdx(0)
  }
  const close = () => { reset(); onClose() }

  const runOcr = async (fs: File[]) => {
    if (!fs.length) return
    setFiles(fs); setOcr(null); setSectionIdx(0); setOcrProgress(0)
    try {
      const { recognizeScreenshots } = await import('./ocr')
      setOcr(await recognizeScreenshots(fs, (d, t) => setOcrProgress(Math.round((d / t) * 100))))
    } catch (e) {
      notify.error(`스크린샷 인식 실패: ${(e as Error).message}`)
    } finally {
      setOcrProgress(null)
    }
  }

  // ── 최종 체크 명단
  const autoIds = (section?.ids ?? []).filter((id) => !excluded.includes(id))
  const chosen = [...new Set([...autoIds, ...Object.values(picked), ...accepted, ...manual])]
  const activeChosen = chosen.filter((id) => byId.get(id)?.status === 'ACTIVE')
  const inactiveChosen = chosen.filter((id) => byId.get(id) && byId.get(id)!.status !== 'ACTIVE')
  const pendingAmbiguous = (section?.ambiguous ?? []).filter((a) => !picked[a.token])
  const pendingSuggestions = (section?.suggestions ?? []).filter((s) => !accepted.includes(s.memberId) && !chosen.includes(s.memberId))
  const absent = (result?.absentIds ?? []).map((id) => byId.get(id)).filter((m): m is Player => !!m)

  const next = mode === 'replace' ? activeChosen : [...current, ...activeChosen.filter((id) => !current.includes(id))]
  const added = next.filter((id) => !current.includes(id)).length
  const removed = current.filter((id) => !next.includes(id)).length

  // ── 인원수 검증 (투표 인원 = 체크 + 휴면 + 확인 필요 + 못 찾음)
  const target = typeof declared === 'number' ? declared : undefined
  const counted = activeChosen.length + inactiveChosen.length
  const missing = target !== undefined ? target - counted : 0
  const matches = target !== undefined && missing === 0

  const apply = async () => {
    if (target !== undefined && !matches) {
      const ok = await confirmAction({
        title: '투표 인원과 맞지 않아요',
        message: `투표 ${target}명인데 ${counted}명만 확인됐어요 (${missing > 0 ? `${missing}명 누락 가능` : `${-missing}명 초과`}). 그래도 적용할까요?`,
        confirmLabel: '그래도 적용', danger: true,
      })
      if (!ok) return
    }
    onApply(next)
    close()
  }

  const addable = members
    .filter((m) => m.status === 'ACTIVE' && !chosen.includes(m.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => ({ value: m.id, label: label(m) }))

  return (
    <Modal opened={opened} onClose={close} title={<Text fw={800}>카톡 투표로 참석 체크</Text>} size="lg" fullScreen={isMobile}>
      <Stack gap="sm">
        <SegmentedControl
          fullWidth value={source} onChange={(v) => { setSource(v as Source); setSectionIdx(0) }}
          data={[{ value: 'image', label: '스크린샷' }, { value: 'text', label: '글 붙여넣기' }]}
        />

        {source === 'image' ? (
          <Stack gap={6}>
            <FileButton multiple accept="image/*" onChange={(fs) => void runOcr(fs)}>
              {(props) => (
                <Button {...props} variant="light" leftSection={<IconPhoto size={18} />} loading={ocrProgress !== null}>
                  {files.length ? `스크린샷 다시 고르기 (${files.length}장)` : '투표 결과 스크린샷 고르기'}
                </Button>
              )}
            </FileButton>
            {ocrProgress !== null && (
              <>
                <Progress value={ocrProgress} animated />
                <Text size="xs" c="dimmed" ta="center">글자 인식 중… 처음 한 번은 한국어 인식 데이터를 내려받아 조금 걸려요.</Text>
              </>
            )}
            <Text size="xs" c="dimmed">
              카톡 투표 → 항목의 투표자 목록 화면을 캡처하세요. 길면 여러 장 함께 골라도 돼요(순서대로). 이미지는 이 기기 안에서만 처리하고 저장하지 않아요.
              익명 투표는 투표자가 안 보여 인식할 수 없어요.
            </Text>
          </Stack>
        ) : (
          <>
            <Textarea
              autosize minRows={4} maxRows={10}
              placeholder={'카톡 투표 결과나 이름 목록을 붙여넣으세요\n예) 김동인, 조인규\n1. 남상혁님\n77 이성흠 하남'}
              value={text} onChange={(e) => setText(e.currentTarget.value)}
            />
            <Text size="xs" c="dimmed">번호·호칭·괄호·지역은 무시하고, 이름 앞 두 자리 숫자는 년생으로 써서 동명이인을 구분해요. "불참" 줄은 빼요.</Text>
          </>
        )}

        {result && section && (
          <>
            {sections.length > 1 && (
              <Select
                label="투표 항목" allowDeselect={false}
                value={String(sectionIdx)} onChange={(v) => setSectionIdx(Number(v))}
                data={sections.map((s, i) => ({ value: String(i), label: `${s.title || `항목 ${i + 1}`}${s.declared !== undefined ? ` · ${s.declared}명` : ''}` }))}
              />
            )}

            <NumberInput
              label="투표 인원 (검증용, 선택)" description={section.declared !== undefined ? '투표 제목의 숫자를 읽었어요. 다르면 고쳐 주세요.' : '카톡 투표에 표시된 인원수를 넣으면 누락을 확인해요.'}
              placeholder="예: 15" min={0} max={200} value={declared} onChange={(v) => setDeclared(typeof v === 'number' ? v : '')}
            />

            {target !== undefined && (
              matches
                ? <Alert color="teal" variant="light" p="xs" icon={<IconCircleCheck size={18} />}>투표 {target}명 = 확인 {counted}명, 모두 찾았어요.</Alert>
                : (
                  <Alert color="red" variant="light" p="xs" icon={<IconAlertTriangle size={18} />} title={missing > 0 ? `${missing}명 누락 가능` : `${-missing}명 많음`}>
                    <Text size="sm">투표 {target}명 · 확인 {counted}명{pendingAmbiguous.length + pendingSuggestions.length > 0 ? ` · 확인 필요 ${pendingAmbiguous.length + pendingSuggestions.length}명` : ''}{section.unknown.length ? ` · 못 찾은 이름 ${section.unknown.length}개` : ''}</Text>
                    <Text size="xs" c="dimmed" mt={2}>아래 확인 필요 항목을 고르거나 "직접 추가"로 채워 주세요. {source === 'image' ? '스크린샷이 잘렸다면 나머지 화면도 함께 골라 주세요.' : ''}</Text>
                  </Alert>
                )
            )}

            {/* 동명이인 */}
            {section.ambiguous.length > 0 && (
              <div>
                <Text size="sm" fw={800} mb={4}>동명이인 — 누구인지 골라 주세요</Text>
                <Stack gap={6}>
                  {section.ambiguous.map((a) => (
                    <Group key={a.token} gap={6}>
                      <Text size="sm" fw={700} w={64}>{a.token}</Text>
                      <Chip.Group value={picked[a.token] ?? ''} onChange={(v) => setPicked((p) => ({ ...p, [a.token]: v as string }))}>
                        <Group gap={4}>
                          {a.candidates.map((id) => byId.get(id)).filter((m): m is Player => !!m).map((m) => (
                            <Chip key={m.id} value={m.id} size="xs">{label(m)}{m.mainPosition && !m.positionReview ? ` · ${m.mainPosition}` : ''}</Chip>
                          ))}
                        </Group>
                      </Chip.Group>
                    </Group>
                  ))}
                </Stack>
              </div>
            )}

            {/* 오타 제안 */}
            {section.suggestions.length > 0 && (
              <div>
                <Text size="sm" fw={800} mb={4}>혹시 이 사람인가요? (눌러서 체크)</Text>
                <Group gap={4}>
                  {section.suggestions.map((s) => {
                    const m = byId.get(s.memberId)
                    if (!m) return null
                    const on = accepted.includes(s.memberId) || chosen.includes(s.memberId)
                    return (
                      <Chip key={s.memberId} size="xs" checked={on} color="orange"
                        onChange={() => setAccepted((xs) => (xs.includes(s.memberId) ? xs.filter((x) => x !== s.memberId) : [...xs, s.memberId]))}>
                        {s.token} → {label(m)}
                      </Chip>
                    )
                  })}
                </Group>
              </div>
            )}

            {/* 확정 */}
            <div>
              <Text size="sm" fw={800} mb={4}>체크할 회원 <Text span c="brand" fw={800}>{activeChosen.length}명</Text></Text>
              {activeChosen.length === 0
                ? <Text size="sm" c="dimmed">아직 없어요.</Text>
                : (
                  <Group gap={4}>
                    {activeChosen.map((id) => {
                      const m = byId.get(id)!
                      const fixed = section.corrected.find((c) => c.memberId === id)
                      return (
                        <Badge key={id} variant="light" color={teamColor(id) ?? 'gray'} tt="none" size="md"
                          title={fixed ? `인식된 글자 "${fixed.token}"를 년생으로 확인해 고쳤어요` : undefined}
                          rightSection={<CloseButton size="xs" aria-label={`${m.name} 빼기`} onClick={() => {
                            setExcluded((x) => [...x, id]); setManual((x) => x.filter((y) => y !== id)); setAccepted((x) => x.filter((y) => y !== id))
                            setPicked((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== id)))
                          }} />}>
                          {m.name}{fixed ? ' ✎' : ''}
                        </Badge>
                      )
                    })}
                  </Group>
                )}
              <Select
                mt={8} searchable clearable placeholder="직접 추가 (이름 검색)" leftSection={<IconPlus size={14} />}
                data={addable} value={null}
                onChange={(v) => { if (v) { setManual((x) => [...x, v]); setExcluded((x) => x.filter((y) => y !== v)) } }}
                nothingFoundMessage="일치하는 회원이 없어요"
              />
            </div>

            {section.unknown.length > 0 && (
              <Alert color="orange" variant="light" p="xs" title={`회원 목록에 없는 이름 ${section.unknown.length}개`}>
                <Text size="sm">{section.unknown.join(', ')}</Text>
                <Text size="xs" c="dimmed" mt={4}>오타·용병일 수 있어요. 회원이면 위 "직접 추가"로 넣어 주세요.</Text>
              </Alert>
            )}
            {inactiveChosen.length > 0 && (
              <Alert color="gray" variant="light" p="xs" title="휴면 회원 (체크하지 않음)">
                <Text size="sm">{inactiveChosen.map((id) => byId.get(id)!.name).join(', ')}</Text>
              </Alert>
            )}
            {absent.length > 0 && <Text size="xs" c="dimmed">불참으로 보고 뺀 이름: {absent.map((m) => m.name).join(', ')}</Text>}

            {source === 'image' && ocr && (
              <Accordion variant="contained" chevronPosition="right">
                <Accordion.Item value="raw">
                  <Accordion.Control><Text size="xs" c="dimmed">인식된 글자 보기</Text></Accordion.Control>
                  <Accordion.Panel>
                    <Text size="xs" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{ocr.raw}</Text>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            )}

            <SegmentedControl
              fullWidth value={mode} onChange={(v) => setMode(v as Mode)}
              data={[{ value: 'replace', label: '이 명단으로 바꾸기' }, { value: 'add', label: '기존 체크에 추가' }]}
            />
            <Text size="xs" c="dimmed" ta="center">
              적용하면 참석 {next.length}명 (추가 {added}{mode === 'replace' ? ` · 해제 ${removed}` : ''})
            </Text>
          </>
        )}

        {result && !section && <Text size="sm" c="dimmed">이름을 찾지 못했어요.</Text>}

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={close}>취소</Button>
          <Button
            color={target !== undefined && !matches ? 'orange' : undefined}
            disabled={!result || !section || (activeChosen.length === 0 && mode === 'add')}
            onClick={() => void apply()}
          >
            {target !== undefined && !matches ? '인원 불일치 — 적용' : '참석 체크 적용'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
