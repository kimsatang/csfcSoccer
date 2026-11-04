import type { ReactNode } from 'react'
import { Badge, Box, Center, Group, Paper, Stack, Text } from '@mantine/core'

/** 로그인·초대 확인 공용 레이아웃 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Box mih="100dvh" className="auth-bg">
      <Center mih="100dvh" p="md">
        <Paper w="100%" maw={400} p="xl" shadow="md" withBorder>
          <Stack gap="lg">
            <Group gap={8}>
              <Badge size="lg" radius="sm" fw={900}>CSFC</Badge>
              <Text fw={800} size="lg">팀짜기</Text>
            </Group>
            {children}
          </Stack>
        </Paper>
      </Center>
    </Box>
  )
}
