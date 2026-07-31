export type MorningBriefTone = 'positive' | 'negative' | 'neutral' | 'warning'

export interface MorningBriefTakeaway {
  label: string
  text: string
  tone: MorningBriefTone
}

export interface MorningBriefInsightInput {
  summaryDate: string
  futures: Array<{
    name: string
    changePercent: number | null
  }>
  semiconductorRead: {
    tone: 'risk-on' | 'mixed' | 'pullback'
    summary: string
  }
  economicEvents: Array<{
    date: string
    event: string
    impact: string
  }>
  earnings: Array<{
    symbol: string
    date: string
    time: 'bmo' | 'amc' | 'dmh' | null
  }>
  topWiimCandidate: {
    ticker: string
    headline: string
    movePercent: number | null
  } | null
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function buildMorningBriefTakeaways(input: MorningBriefInsightInput): MorningBriefTakeaway[] {
  const takeaways: MorningBriefTakeaway[] = []
  const futures = input.futures.filter(
    (item): item is { name: string; changePercent: number } =>
      typeof item.changePercent === 'number' && Number.isFinite(item.changePercent),
  )
  const averageFuturesMove = average(futures.map((item) => item.changePercent))

  if (averageFuturesMove !== null) {
    const strongest = futures.reduce((best, item) =>
      item.changePercent > best.changePercent ? item : best,
    )
    const weakest = futures.reduce((worst, item) =>
      item.changePercent < worst.changePercent ? item : worst,
    )
    const tone: MorningBriefTone =
      averageFuturesMove > 0.15 ? 'positive' : averageFuturesMove < -0.15 ? 'negative' : 'neutral'

    takeaways.push({
      label: 'Index setup',
      text:
        strongest.name === weakest.name
          ? `${strongest.name} is ${formatSignedPercent(strongest.changePercent)} before the open.`
          : `${strongest.name} leads at ${formatSignedPercent(strongest.changePercent)}; ${weakest.name} trails at ${formatSignedPercent(weakest.changePercent)}.`,
      tone,
    })
  }

  takeaways.push({
    label: 'Semiconductors',
    text: input.semiconductorRead.summary,
    tone:
      input.semiconductorRead.tone === 'risk-on'
        ? 'positive'
        : input.semiconductorRead.tone === 'pullback'
          ? 'negative'
          : 'neutral',
  })

  const nextHighImpactEvent = input.economicEvents.find(
    (event) => event.date.startsWith(input.summaryDate) && event.impact === 'High',
  )
  if (nextHighImpactEvent) {
    takeaways.push({
      label: 'Macro risk',
      text: `${nextHighImpactEvent.event} is today’s next high-impact scheduled catalyst.`,
      tone: 'warning',
    })
  }

  const todayEarnings = input.earnings.filter((earning) => earning.date === input.summaryDate)
  if (todayEarnings.length > 0) {
    const beforeOpen = todayEarnings.filter((earning) => earning.time === 'bmo')
    const afterClose = todayEarnings.filter((earning) => earning.time === 'amc')
    const named = todayEarnings.slice(0, 4).map((earning) => earning.symbol).join(', ')
    const timing = [
      beforeOpen.length > 0 ? `${beforeOpen.length} before the open` : '',
      afterClose.length > 0 ? `${afterClose.length} after the close` : '',
    ].filter(Boolean).join(' and ')

    takeaways.push({
      label: 'Earnings',
      text: `${named}${todayEarnings.length > 4 ? ` and ${todayEarnings.length - 4} more` : ''} report today${timing ? `, with ${timing}` : ''}.`,
      tone: 'warning',
    })
  }

  if (input.topWiimCandidate) {
    const move =
      input.topWiimCandidate.movePercent === null
        ? ''
        : ` (${formatSignedPercent(input.topWiimCandidate.movePercent)})`

    takeaways.push({
      label: 'Top WIIM',
      text: `${input.topWiimCandidate.ticker}${move}: ${input.topWiimCandidate.headline}`,
      tone:
        input.topWiimCandidate.movePercent === null
          ? 'neutral'
          : input.topWiimCandidate.movePercent >= 0
            ? 'positive'
            : 'negative',
    })
  }

  return takeaways.slice(0, 5)
}
