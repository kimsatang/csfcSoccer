import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './app/styles.css'
import App from './app/App'
import { theme } from './app/theme'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <ModalsProvider labels={{ confirm: '확인', cancel: '취소' }}>
        <Notifications position="top-center" limit={3} zIndex={4000} />
        <App />
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
)
