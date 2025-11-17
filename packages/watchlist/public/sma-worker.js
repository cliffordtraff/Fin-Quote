/**
 * Web Worker for calculating Simple Moving Averages
 * Runs in background thread to avoid blocking UI
 */

self.addEventListener('message', (event) => {
  const { data, periods } = event.data

  if (!data || !Array.isArray(data) || !periods || !Array.isArray(periods)) {
    self.postMessage({ error: 'Invalid input data' })
    return
  }

  try {
    const results = {}

    // Calculate SMA for each requested period
    periods.forEach(period => {
      if (data.length < period) {
        results[period] = []
        return
      }

      const smaData = []

      for (let i = period - 1; i < data.length; i++) {
        let sum = 0
        for (let j = 0; j < period; j++) {
          sum += data[i - j].close
        }
        const sma = sum / period

        smaData.push({
          time: data[i].time,
          value: sma
        })
      }

      results[period] = smaData
    })

    // Send results back to main thread
    self.postMessage({ results })
  } catch (error) {
    self.postMessage({ error: error.message })
  }
})
