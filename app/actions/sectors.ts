'use server'

export interface SectorData {
  sector: string
  changesPercentage: string
  ytdReturn?: number
}

// Map from historical API field names to sector display names
const historicalFieldToSector: Record<string, string> = {
  'basicMaterialsChangesPercentage': 'Basic Materials',
  'communicationServicesChangesPercentage': 'Communication Services',
  'consumerCyclicalChangesPercentage': 'Consumer Cyclical',
  'consumerDefensiveChangesPercentage': 'Consumer Defensive',
  'energyChangesPercentage': 'Energy',
  'financialServicesChangesPercentage': 'Financial Services',
  'healthcareChangesPercentage': 'Healthcare',
  'industrialsChangesPercentage': 'Industrials',
  'realEstateChangesPercentage': 'Real Estate',
  'technologyChangesPercentage': 'Technology',
  'utilitiesChangesPercentage': 'Utilities'
}

export async function getSectorPerformance() {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    // Get the start of the current year
    const now = new Date()
    const yearStart = `${now.getFullYear()}-01-01`
    const today = now.toISOString().split('T')[0]

    // Fetch both daily and historical sector performance for YTD calculation
    const [dailyResponse, historicalResponse] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v3/sectors-performance?apikey=${apiKey}`, {
        next: { revalidate: 60 }
      }),
      fetch(`https://financialmodelingprep.com/api/v3/historical-sectors-performance?from=${yearStart}&to=${today}&apikey=${apiKey}`, {
        next: { revalidate: 3600 } // Cache YTD for 1 hour
      })
    ])

    if (!dailyResponse.ok) {
      throw new Error('Failed to fetch sector performance data')
    }

    const dailyData = await dailyResponse.json()

    // Calculate YTD by summing daily changes from start of year
    let ytdMap: Record<string, number> = {}
    if (historicalResponse.ok) {
      const historicalData = await historicalResponse.json()
      if (Array.isArray(historicalData) && historicalData.length > 0) {
        // Initialize YTD map with zeros
        for (const sectorName of Object.values(historicalFieldToSector)) {
          ytdMap[sectorName] = 0
        }

        // Sum up all daily changes for each sector
        for (const day of historicalData) {
          for (const [field, sectorName] of Object.entries(historicalFieldToSector)) {
            if (day[field] !== undefined) {
              ytdMap[sectorName] += day[field]
            }
          }
        }
      }
    }

    if (Array.isArray(dailyData) && dailyData.length > 0) {
      const sectors: SectorData[] = dailyData.map((item: any) => ({
        sector: item.sector,
        changesPercentage: item.changesPercentage,
        ytdReturn: ytdMap[item.sector]
      }))

      return { sectors }
    }

    return { sectors: [] }
  } catch (error) {
    console.error('Error fetching sector performance:', error)
    return { error: 'Failed to load sector performance data' }
  }
}
