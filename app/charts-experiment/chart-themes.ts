// ---------------------------------------------------------------------------
// Chart Experiment – Theme definitions
// ---------------------------------------------------------------------------
// Placed under app/ so Tailwind's content scanner picks up all class strings.
// To add a new theme, create a new object conforming to ChartTheme and add it
// to THEMES.
// ---------------------------------------------------------------------------

export type ChartThemeName = 'playful' | 'terminal'

// ---- Tailwind class strings keyed by UI element ----
export interface ChartThemeClasses {
  // Page-level
  pageBg: string
  font: string

  // Sidebar
  sidebarBg: string
  sidebarBorder: string
  sidebarToggleBg: string
  sidebarToggleHover: string
  sidebarToggleBorder: string
  sidebarLabel: string

  // Cards / main content area
  cardBg: string
  cardBorder: string
  cardRounding: string

  // Chips (stock / metric tags)
  chipBg: string
  chipBgMuted: string
  chipText: string
  chipTextMuted: string
  chipClose: string

  // Buttons (period toggle, presets, clear, etc.)
  buttonGroupBg: string
  buttonActive: string
  buttonInactive: string
  presetButton: string
  clearButton: string

  // Inputs / toggle backgrounds
  toggleBg: string
  checkboxClass: string

  // Stock & Metric selector overrides
  inputBg: string
  inputBorder: string
  inputText: string
  dropdownBg: string
  dropdownBorder: string
  dropdownItemHover: string
  dropdownSectionBg: string
  dropdownSectionHover: string
  dropdownItemText: string
  dropdownItemTextSelected: string
  dropdownFooterBorder: string
  dropdownFooterText: string

  // Tick / year scale labels on slider
  sliderTickColor: string
  sliderLabelText: string

  // Empty state
  emptyTitle: string
  emptySubtitle: string
  emptyDivider: string
}

export interface HighchartsThemeOverrides {
  backgroundColor: string
  textColor: string
  gridLineColor: string
  lineColor: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
  tooltipBorderRadius: number
  columnBorderRadius: number
  fontFamily: string
}

export interface ChartTheme {
  name: ChartThemeName
  label: string
  classes: ChartThemeClasses
  highcharts: HighchartsThemeOverrides
  colors: {
    accent: string
    sliderRange: string
    sliderTrack: string
    palette: string[]
  }
  font: string  // CSS font-family value for the root container
}

// ---------------------------------------------------------------------------
// PLAYFUL theme — the existing sage/cream aesthetic
// ---------------------------------------------------------------------------
export const PLAYFUL_THEME: ChartTheme = {
  name: 'playful',
  label: 'Playful',
  classes: {
    pageBg: 'bg-cream-100 dark:bg-gray-900',
    font: '',

    sidebarBg: 'bg-white dark:bg-gray-800 border-r border-cream-300 dark:border-gray-700',
    sidebarBorder: 'border-cream-300 dark:border-gray-700',
    sidebarToggleBg: 'bg-white dark:bg-gray-800',
    sidebarToggleHover: 'hover:bg-cream-100 dark:hover:bg-gray-700',
    sidebarToggleBorder: 'border-r border-cream-300 dark:border-gray-700',
    sidebarLabel: 'text-gray-500 dark:text-gray-400',

    cardBg: 'bg-white dark:bg-gray-800',
    cardBorder: 'border border-cream-300 dark:border-gray-700',
    cardRounding: 'rounded-2xl shadow-sm',

    chipBg: 'bg-cream-100 dark:bg-gray-700/60',
    chipBgMuted: 'bg-cream-100/50 dark:bg-gray-700/30',
    chipText: 'text-gray-500 dark:text-gray-400',
    chipTextMuted: 'text-gray-400 dark:text-gray-500',
    chipClose: 'text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors',

    buttonGroupBg: 'bg-cream-50 dark:bg-gray-700 rounded-lg',
    buttonActive: 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm rounded-md transition-colors',
    buttonInactive: 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md transition-colors',
    presetButton: 'bg-cream-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-sage-100 dark:hover:bg-sage-900/20 hover:text-sage-700 dark:hover:text-sage-300 transition-colors border border-gray-200 dark:border-gray-700',
    clearButton: 'text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors',

    toggleBg: 'bg-cream-50 dark:bg-gray-700 rounded-lg',
    checkboxClass: 'w-4 h-4 text-sage-600 bg-cream-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-0',

    inputBg: 'bg-cream-50 dark:bg-gray-800',
    inputBorder: 'border border-gray-300 dark:border-gray-600',
    inputText: 'text-gray-900 dark:text-white',
    dropdownBg: 'bg-white dark:bg-gray-800',
    dropdownBorder: 'border border-gray-200 dark:border-gray-700',
    dropdownItemHover: 'hover:bg-cream-50 dark:hover:bg-gray-700',
    dropdownSectionBg: 'bg-cream-50 dark:bg-gray-700',
    dropdownSectionHover: 'hover:bg-gray-150 dark:hover:bg-gray-600',
    dropdownItemText: 'text-gray-700 dark:text-gray-200',
    dropdownItemTextSelected: 'text-gray-400 dark:text-gray-500',
    dropdownFooterBorder: 'border-t border-gray-200 dark:border-gray-700',
    dropdownFooterText: 'text-gray-500 dark:text-gray-400',

    sliderTickColor: 'bg-gray-400/70 dark:bg-gray-500/70',
    sliderLabelText: 'text-gray-500 dark:text-gray-400',

    emptyTitle: 'text-gray-900 dark:text-white',
    emptySubtitle: 'text-gray-500 dark:text-gray-400',
    emptyDivider: 'bg-gray-200 dark:bg-gray-700',
  },
  highcharts: {
    backgroundColor: 'transparent',
    textColor: '#6b7280',
    gridLineColor: '#d1d5db',
    lineColor: '#374151',
    tooltipBg: '#ffffff',
    tooltipBorder: '#e5e7eb',
    tooltipText: '#1f2937',
    tooltipBorderRadius: 8,
    columnBorderRadius: 4,
    fontFamily: 'inherit',
  },
  colors: {
    accent: '#5a6b4a',
    sliderRange: '#5a6b4a',
    sliderTrack: '#e5e5e0',
    palette: [
      '#1a1a2e', '#2d4a3e', '#4a2c2c', '#3d3520',
      '#1a3a3a', '#2e2640', '#2a3540', '#3a3028',
      '#1a3a2a', '#3a2a30', '#3a3a20', '#2a2a3a',
    ],
  },
  font: '',
}

// ---------------------------------------------------------------------------
// TERMINAL theme — monospace, sharp corners, green-on-dark
// ---------------------------------------------------------------------------
export const TERMINAL_THEME: ChartTheme = {
  name: 'terminal',
  label: 'Terminal',
  classes: {
    pageBg: 'bg-gray-950',
    font: 'font-mono',

    sidebarBg: 'bg-gray-900 border-r border-green-800/50',
    sidebarBorder: 'border-green-800/50',
    sidebarToggleBg: 'bg-gray-900',
    sidebarToggleHover: 'hover:bg-gray-800',
    sidebarToggleBorder: 'border-r border-green-800/50',
    sidebarLabel: 'text-green-500/70',

    cardBg: 'bg-gray-900',
    cardBorder: 'border border-green-800/50',
    cardRounding: 'rounded-none',

    chipBg: 'bg-gray-800 border border-green-800/40',
    chipBgMuted: 'bg-gray-800/50 border border-green-800/20',
    chipText: 'text-green-400',
    chipTextMuted: 'text-green-600',
    chipClose: 'text-green-600 hover:text-red-400',

    buttonGroupBg: 'bg-gray-800 rounded-none border border-green-800/40',
    buttonActive: 'bg-green-500 text-gray-950 font-bold rounded-none',
    buttonInactive: 'text-green-500/70 hover:text-green-400 rounded-none',
    presetButton: 'bg-gray-900 text-green-400 rounded-none hover:bg-green-900/30 hover:text-green-300 border border-green-800/50',
    clearButton: 'text-green-600 hover:text-red-400 hover:bg-red-900/20 rounded-none',

    toggleBg: 'bg-gray-800 rounded-none border border-green-800/40',
    checkboxClass: 'w-4 h-4 text-green-500 bg-gray-800 border-green-700 rounded-none focus:ring-0',

    inputBg: 'bg-gray-900',
    inputBorder: 'border border-green-800/50',
    inputText: 'text-green-400',
    dropdownBg: 'bg-gray-900',
    dropdownBorder: 'border border-green-800/50',
    dropdownItemHover: 'hover:bg-green-900/30',
    dropdownSectionBg: 'bg-gray-800',
    dropdownSectionHover: 'hover:bg-green-900/30',
    dropdownItemText: 'text-green-400',
    dropdownItemTextSelected: 'text-green-700',
    dropdownFooterBorder: 'border-t border-green-800/40',
    dropdownFooterText: 'text-green-600',

    sliderTickColor: 'bg-green-700/50',
    sliderLabelText: 'text-green-600',

    emptyTitle: 'text-green-400',
    emptySubtitle: 'text-green-600',
    emptyDivider: 'bg-green-800/40',
  },
  highcharts: {
    backgroundColor: 'transparent',
    textColor: '#22c55e',
    gridLineColor: 'rgba(34, 197, 94, 0.15)',
    lineColor: 'rgba(34, 197, 94, 0.4)',
    tooltipBg: '#111827',
    tooltipBorder: '#166534',
    tooltipText: '#4ade80',
    tooltipBorderRadius: 0,
    columnBorderRadius: 0,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  },
  colors: {
    accent: '#22c55e',
    sliderRange: '#22c55e',
    sliderTrack: '#1f2937',
    palette: [
      '#22c55e', '#f59e0b', '#06b6d4', '#a78bfa',
      '#4ade80', '#fbbf24', '#22d3ee', '#c4b5fd',
      '#86efac', '#fcd34d', '#67e8f9', '#ddd6fe',
    ],
  },
  font: '"JetBrains Mono", ui-monospace, monospace',
}

// ---------------------------------------------------------------------------
// Theme registry and helpers
// ---------------------------------------------------------------------------
export const THEMES: Record<ChartThemeName, ChartTheme> = {
  playful: PLAYFUL_THEME,
  terminal: TERMINAL_THEME,
}

/** Shorthand to pull a class string from a theme. */
export function cx(theme: ChartTheme, key: keyof ChartThemeClasses): string {
  return theme.classes[key]
}
