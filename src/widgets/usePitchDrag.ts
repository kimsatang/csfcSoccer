import { useCallback, useEffect, useRef, useState } from 'react'

/** 드롭 대상: 경기장 자리 key, 또는 교체 영역('bench') */
export type DropTarget = string | 'bench'

export interface DragSource {
  memberId: string
  name: string
  /** 경기장에서 시작했으면 그 자리 key, 교체 명단에서 시작했으면 undefined */
  fromKey?: string
}

export interface DragView extends DragSource {
  x: number
  y: number
  over: DropTarget | null
}

const THRESHOLD = 6 // px: 이보다 적게 움직이면 탭(클릭)으로 처리
const EDGE = 90 // px: 화면 위·아래 가장자리에 가까우면 자동 스크롤

/**
 * 터치·마우스 공용 드래그 (Pointer Events).
 * - 드롭 대상 요소에는 `data-drop="<slotKey>"` 또는 `data-drop="bench"` 속성을 단다.
 * - 드래그가 끝난 직후의 click은 무시하도록 `consumeClick()`을 제공한다.
 */
export function usePitchDrag(onDrop: (src: DragSource, target: DropTarget) => void, enabled: boolean) {
  const [drag, setDrag] = useState<DragView | null>(null)
  const pending = useRef<{ src: DragSource; x0: number; y0: number; id: number; active: boolean } | null>(null)
  const justDragged = useRef(false)
  const dropRef = useRef(onDrop)
  dropRef.current = onDrop

  const targetAt = (x: number, y: number): DropTarget | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]')
    return (el?.dataset.drop as DropTarget | undefined) ?? null
  }

  useEffect(() => {
    if (!enabled) return
    let lastY = -1
    // 교체 명단(아래)에서 경기장(위)으로 끌 때 화면 밖이면 자동 스크롤
    const scroller = window.setInterval(() => {
      const p = pending.current
      if (!p?.active || lastY < 0) return
      const h = window.innerHeight
      const dy = lastY < EDGE ? -Math.ceil((EDGE - lastY) / 6) : lastY > h - EDGE ? Math.ceil((lastY - (h - EDGE)) / 6) : 0
      if (dy) window.scrollBy(0, dy)
    }, 16)
    const move = (e: PointerEvent) => {
      const p = pending.current
      if (!p || e.pointerId !== p.id) return
      if (!p.active) {
        if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < THRESHOLD) return
        p.active = true
      }
      e.preventDefault()
      lastY = e.clientY
      setDrag({ ...p.src, x: e.clientX, y: e.clientY, over: targetAt(e.clientX, e.clientY) })
    }
    const end = (e: PointerEvent) => {
      const p = pending.current
      if (!p || e.pointerId !== p.id) return
      pending.current = null
      lastY = -1
      if (p.active) {
        justDragged.current = true
        window.setTimeout(() => { justDragged.current = false }, 0)
        const target = e.type === 'pointerup' ? targetAt(e.clientX, e.clientY) : null
        if (target) dropRef.current(p.src, target)
      }
      setDrag(null)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.clearInterval(scroller)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [enabled])

  /** 드래그 가능한 요소의 onPointerDown에 연결 */
  const start = useCallback((src: DragSource) => (e: React.PointerEvent) => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return
    // 터치는 시작 요소가 포인터를 잡으므로 해제해야 elementFromPoint로 대상을 찾을 수 있음
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    pending.current = { src, x0: e.clientX, y0: e.clientY, id: e.pointerId, active: false }
  }, [enabled])

  /** 드래그 직후 발생하는 click이면 true (호출한 쪽에서 무시) */
  const consumeClick = useCallback(() => justDragged.current, [])

  return { drag, start, consumeClick }
}
