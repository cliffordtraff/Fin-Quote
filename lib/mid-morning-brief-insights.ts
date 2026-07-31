export type MidMorningTone = 'positive' | 'negative' | 'warning' | 'neutral'
export type MorningFollowThroughStatus = 'confirmed' | 'reversed' | 'fading' | 'developing'

export interface MidMorningTakeaway {
  label: string
  text: string
  tone: MidMorningTone
}

export function parsePercentValue(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace('%', '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

export function classifyMorningFollowThrough(
  morningMovePercent: number | null,
  currentMovePercent: number | null,
): MorningFollowThroughStatus {
  if (morningMovePercent == null || currentMovePercent == null) return 'developing'

  const morningDirection = Math.sign(morningMovePercent)
  const currentDirection = Math.sign(currentMovePercent)

  if (Math.abs(currentMovePercent) < 0.5 && Math.abs(morningMovePercent) >= 0.75) {
    return 'fading'
  }
  if (
    morningDirection !== 0
    && currentDirection !== 0
    && morningDirection !== currentDirection
    && Math.abs(currentMovePercent) >= 0.5
  ) {
    return 'reversed'
  }
  if (
    morningDirection !== 0
    && morningDirection === currentDirection
    && Math.abs(morningMovePercent) >= 2
    && Math.abs(currentMovePercent) <= Math.abs(morningMovePercent) * 0.4
  ) {
    return 'fading'
  }
  if (
    morningDirection !== 0
    && morningDirection === currentDirection
    && Math.abs(currentMovePercent) >= 0.5
  ) {
    return 'confirmed'
  }

  return 'developing'
}

export function buildMidMorningTakeaways(input: {
  sp500ChangePercent: number | null
  vixChangePercent: number | null
  advancers: number
  decliners: number
  leadingSector: { name: string; changePercent: number } | null
  laggingSector: { name: string; changePercent: number } | null
  previousTopCandidate: string | null
  currentTopCandidate: string | null
  newlyEntered: string[]
  nextMacroEvent: { name: string; timeLabel: string } | null
  afterCloseEarnings: string[]
}): MidMorningTakeaway[] {
  const breadthTotal = input.advancers + input.decliners
  const riskTone: MidMorningTone =
    input.sp500ChangePercent != null && input.sp500ChangePercent < -0.35
      ? 'negative'
      : input.sp500ChangePercent != null && input.sp500ChangePercent > 0.35
        ? 'positive'
        : 'neutral'
  const tapeText = input.sp500ChangePercent == null
    ? 'The S&P 500 quote is unavailable; use breadth and sector leadership as the primary tape read.'
    : `The S&P 500 is ${input.sp500ChangePercent >= 0 ? 'up' : 'down'} ${Math.abs(input.sp500ChangePercent).toFixed(2)}% with ${input.advancers} advancers and ${input.decliners} decliners${breadthTotal > 0 ? ` across ${breadthTotal} moving constituents` : ''}.`

  const volatilityText = input.vixChangePercent == null
    ? 'Volatility data is unavailable.'
    : `VIX is ${input.vixChangePercent >= 0 ? 'higher' : 'lower'} by ${Math.abs(input.vixChangePercent).toFixed(2)}%, ${input.vixChangePercent > 2 ? 'confirming a more defensive opening tone' : 'without a large volatility break so far'}.`

  const rotationText =
    input.leadingSector && input.laggingSector
      ? `${input.leadingSector.name} leads at ${input.leadingSector.changePercent >= 0 ? '+' : ''}${input.leadingSector.changePercent.toFixed(2)}%, while ${input.laggingSector.name} trails at ${input.laggingSector.changePercent >= 0 ? '+' : ''}${input.laggingSector.changePercent.toFixed(2)}%. The spread is ${(input.leadingSector.changePercent - input.laggingSector.changePercent).toFixed(2)} points.`
      : 'Sector rotation data is not available.'

  const wiimText = input.previousTopCandidate && input.currentTopCandidate
    ? input.previousTopCandidate === input.currentTopCandidate
      ? `${input.currentTopCandidate} remains the top WIIM story from the morning report.`
      : `${input.currentTopCandidate} has replaced ${input.previousTopCandidate} as the top WIIM story${input.newlyEntered.length > 0 ? `; new top-five names are ${input.newlyEntered.join(', ')}` : ''}.`
    : 'A complete morning-to-mid-morning WIIM comparison is unavailable.'

  const macroText = input.nextMacroEvent
    ? `${input.nextMacroEvent.name} is the next scheduled macro risk at ${input.nextMacroEvent.timeLabel}.`
    : 'No additional high-impact US macro event is listed for today.'
  const earningsText = input.afterCloseEarnings.length > 0
    ? ` After the close, focus shifts to ${input.afterCloseEarnings.join(' and ')}.`
    : ''

  return [
    { label: 'Opening tape', text: `${tapeText} ${volatilityText}`, tone: riskTone },
    {
      label: 'Rotation',
      text: rotationText,
      tone:
        input.laggingSector && input.laggingSector.changePercent <= -1.5
          ? 'warning'
          : 'neutral',
    },
    {
      label: 'Morning update',
      text: wiimText,
      tone:
        input.previousTopCandidate && input.currentTopCandidate !== input.previousTopCandidate
          ? 'warning'
          : 'neutral',
    },
    { label: 'Still ahead', text: `${macroText}${earningsText}`, tone: 'warning' },
  ]
}
