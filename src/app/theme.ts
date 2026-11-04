import { createTheme } from '@mantine/core'
import type { MantineColorsTuple } from '@mantine/core'

const brand: MantineColorsTuple = [
  '#e7f7ee', '#d2ecdf', '#a6d8bd', '#76c299', '#4fb07b', '#36a468', '#279e5e', '#178a4d', '#0f7a45', '#006a38',
]

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: 8,
  colors: { brand },
  fontFamily: `'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`,
  headings: { fontWeight: '800' },
  defaultRadius: 'md',
  cursorType: 'pointer',
  autoContrast: true,
  components: {
    Button: { defaultProps: { radius: 'md' } },
    Card: { defaultProps: { radius: 'lg', withBorder: true } },
    Paper: { defaultProps: { radius: 'lg' } },
    Drawer: { defaultProps: { radius: 'lg' } },
    Modal: { defaultProps: { radius: 'lg', centered: true } },
  },
})
