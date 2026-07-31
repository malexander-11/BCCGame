/**
 * Palette. Swap these hex values for the real Bagshot CC colours and the whole
 * game re-skins — nothing else hardcodes a colour.
 */
export const theme = {
  bg: '#0B1612',
  surface: '#13211A',
  surface2: '#182B21',
  border: '#23402F',

  cream: '#EFE9D6',
  muted: '#86A18E',
  faint: '#5A7263',

  gold: '#E9B949',
  goldDim: '#9C7B2C',
  red: '#E04A40',
  redDeep: '#B03028',
  green: '#3FAE6A',
  pitch: '#C9A86B',
  sky: '#5AA9E6',
} as const

/** Raised-panel styling used for the big header cards. */
export const panel = {
  background: 'rgba(12,18,32,0.92)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 14px 46px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)',
} as const

/** Flat inset card — lists, rows, stat blocks. */
export const card = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
} as const

/** Colour a 0-100 rating: gold elite, purple very good, green good, white ok. */
export function ratingColour(v: number): string {
  if (v >= 90) return '#F4C430'
  if (v >= 80) return '#9B5FD0'
  if (v >= 70) return '#4FBE81'
  if (v >= 55) return theme.cream
  return '#9C9684'
}
