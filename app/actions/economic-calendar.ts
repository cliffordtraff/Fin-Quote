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
      // Filter for high impact US events only
      const highImpactUSEvents = data
        .filter((event: any) =>
          event.country === 'US' &&
          (event.impact === 'High' || event.impact === 'Medium')
        )
        .slice(0, 5) // Get top 5 events
        .map((event: any) => ({
          date: event.date,
          country: event.country,
          event: event.event,
          currency: event.currency,
          previous: event.previous,
          estimate: event.estimate,
          actual: event.actual,
          impact: event.impact,
          unit: event.unit
        }))

      return { events: highImpactUSEvents }
    }

    return { events: [] }
  } catch (error) {
    console.error('Error fetching economic calendar:', error)
    return { error: 'Failed to load economic calendar data' }
  }
}
