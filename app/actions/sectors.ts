'use server'

export interface SectorData {
  sector: string
  changesPercentage: string
}

export async function getSectorPerformance() {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    const url = `https://financialmodelingprep.com/api/v3/sectors-performance?apikey=${apiKey}`
    const response = await fetch(url, {
      next: { revalidate: 60 } // Cache for 1 minute
    })

    if (!response.ok) {
      throw new Error('Failed to fetch sector performance data')
    }

    const data = await response.json()

    if (Array.isArray(data) && data.length > 0) {
      const sectors: SectorData[] = data.map((item: any) => ({
        sector: item.sector,
        changesPercentage: item.changesPercentage
      }))

      return { sectors }
    }

    return { sectors: [] }
  } catch (error) {
    console.error('Error fetching sector performance:', error)
    return { error: 'Failed to load sector performance data' }
  }
}
