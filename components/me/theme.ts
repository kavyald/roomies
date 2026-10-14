import type { Theme } from '@/lib/domain/house'

export const THEMES: readonly Theme[] = ['auto', 'light', 'dark']

export const THEME_LABEL: Record<Theme, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' }
