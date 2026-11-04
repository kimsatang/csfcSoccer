import { Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import type { ReactNode } from 'react'

export const notify = {
  ok: (message: ReactNode, title?: string) => notifications.show({ message, title, color: 'brand', autoClose: 2500 }),
  error: (message: ReactNode, title = '문제가 생겼어요') => notifications.show({ message, title, color: 'red', autoClose: 5000 }),
  info: (message: ReactNode) => notifications.show({ message, color: 'gray', autoClose: 2500 }),
}

/** 확인 모달 (네이티브 confirm 대신 — 모바일·인앱 브라우저에서도 동작) */
export function confirmAction(opts: {
  title: string
  message?: ReactNode
  confirmLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return new Promise((resolve) => {
    modals.openConfirmModal({
      title: opts.title,
      children: opts.message ? <Text size="sm">{opts.message}</Text> : null,
      labels: { confirm: opts.confirmLabel ?? '확인', cancel: '취소' },
      confirmProps: { color: opts.danger ? 'red' : 'brand' },
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false),
    })
  })
}

export async function copyText(text: string, label = '복사했습니다.'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    notify.ok(label)
    return true
  } catch {
    window.prompt('아래 내용을 복사하세요', text)
    return false
  }
}
