'use server'

export interface EconomicEvent {
  date: string
  country: string
  event: string
  currency: string
  previous: number | null
  estimate: number | null
  actual: number | null
  impact: string
  unit: string
}

export async function getEconomicEvents() {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    // Get events for the next 7 days
    const today = new Date()
    const nextWeek = new Date(today)
    nextWeek.setDate(today.getDate() + 7)

    const formatDate = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    const from = formatDate(today)
    const to = formatDate(nextWeek)

    const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${apiKey}`
    const response = await fetch(url, {
      next: { revalidate: 900 } // Cache for 15 minutes (calendar updates every 15 min)
    })

    if (!response.ok) {
      throw new Error('Failed to fetch economic calendar data')
    }

    const data = await response.json()

    if (Array.isArray(data) && data.length > 0) {
      const mapEvent = (event: any) => ({
        date: event.date,
        country: event.country,
        event: event.event,
        currency: event.currency,
        previous: event.previous,
        estimate: event.estimate,
        actual: event.actual,
        impact: event.impact,
        unit: event.unit || ''
      })

      // Get all High impact US events (these are critical - FOMC, GDP, etc.)
      const highImpactEvents = data
        .filter((event: any) => event.country === 'US' && event.impact === 'High')
        .map(mapEvent)
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())

      // Get Medium impact US events to fill remaining slots
      const mediumImpactEvents = data
        .filter((event: any) => event.country === 'US' && event.impact === 'Medium')
        .map(mapEvent)
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())

      // Take all High impact events (up to 10), then fill with Medium
      const maxEvents = 12
      const selectedHigh = highImpactEvents.slice(0, maxEvents)
      const remainingSlots = maxEvents - selectedHigh.length
      const selectedMedium = mediumImpactEvents.slice(0, remainingSlots)

      // Combine and sort chronologically
      const combinedEvents = [...selectedHigh, ...selectedMedium]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      return { events: combinedEvents }
    }

    return { events: [] }
  } catch (error) {
    console.error('Error fetching economic calendar:', error)
    return { error: 'Failed to load economic calendar data' }
  }
}
