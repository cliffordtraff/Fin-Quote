const MIN_PULSE_TODAY_MINUTE_BARS = 5
const MIN_PULSE_TODAY_STREAM_BARS = 12

export function isPulseTodayChartableCandidate(params: {
  quoteExists: boolean
  minuteBars: number
  streamBars: number
  supportsSecondLevel: boolean
}): boolean {
  if (!params.quoteExists) return false
  if (params.minuteBars >= MIN_PULSE_TODAY_MINUTE_BARS) return true
  if (params.supportsSecondLevel && params.streamBars >= MIN_PULSE_TODAY_STREAM_BARS) return true
  return false
}
