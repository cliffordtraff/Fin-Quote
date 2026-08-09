'use server'

import { getProvider } from '@/lib/providers'
import type { ProviderQuote, QuoteRequestOptions } from '@/lib/providers/types'
import { safeErrorMessage } from '@/lib/safe-logging'

export interface SP500MoverData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

// S&P 500 constituent symbols (top ~500 companies)
const SP500_SYMBOLS = [
  'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'GOOG', 'BRK.B', 'TSLA', 'UNH',
  'XOM', 'JNJ', 'JPM', 'V', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV',
  'LLY', 'PEP', 'KO', 'COST', 'AVGO', 'WMT', 'MCD', 'CSCO', 'TMO', 'ACN',
  'ABT', 'DHR', 'NEE', 'LIN', 'ADBE', 'WFC', 'NKE', 'PM', 'TXN', 'CRM',
  'VZ', 'RTX', 'CMCSA', 'BMY', 'HON', 'ORCL', 'QCOM', 'COP', 'T', 'UPS',
  'MS', 'LOW', 'UNP', 'INTC', 'ELV', 'SPGI', 'IBM', 'CAT', 'PLD', 'BA',
  'AMD', 'GE', 'INTU', 'AMAT', 'DE', 'AMGN', 'GS', 'SBUX', 'ISRG', 'MDT',
  'AXP', 'BKNG', 'BLK', 'GILD', 'ADI', 'SYK', 'MDLZ', 'TJX', 'CVS', 'ADP',
  'REGN', 'LMT', 'CI', 'VRTX', 'PGR', 'MMC', 'SCHW', 'CB', 'ETN', 'ZTS',
  'MO', 'SO', 'DUK', 'BSX', 'BDX', 'TMUS', 'FI', 'CME', 'EOG', 'SLB',
  'NOC', 'PNC', 'MU', 'CL', 'ITW', 'AON', 'LRCX', 'CSX', 'EQIX', 'ICE',
  'WM', 'SHW', 'SNPS', 'CDNS', 'HUM', 'MCK', 'FCX', 'APD', 'KLAC', 'ORLY',
  'NSC', 'GD', 'EMR', 'MCO', 'PXD', 'PSA', 'NXPI', 'USB', 'MAR', 'ROP',
  'MNST', 'MSI', 'CTAS', 'AJG', 'ADSK', 'GM', 'F', 'AZO', 'HCA', 'PCAR',
  'OXY', 'TGT', 'MCHP', 'MSCI', 'TEL', 'TT', 'PAYX', 'AEP', 'KMB', 'TDG',
  'ANET', 'MET', 'SRE', 'PSX', 'CCI', 'D', 'O', 'KDP', 'APH', 'ECL',
  'PH', 'WELL', 'CMG', 'AIG', 'CARR', 'AFL', 'STZ', 'IDXX', 'COF', 'HLT',
  'DVN', 'DXCM', 'FTNT', 'ODFL', 'NEM', 'TRV', 'SPG', 'ALL', 'ROST', 'GWW',
  'WMB', 'BK', 'KMI', 'IQV', 'PRU', 'HSY', 'DLR', 'CTVA', 'YUM', 'A',
  'AME', 'KEYS', 'EXC', 'FAST', 'ON', 'EW', 'CPRT', 'DOW', 'DD', 'XEL',
  'PCG', 'VRSK', 'PPG', 'ED', 'EA', 'AWK', 'HPQ', 'ROK', 'KR', 'GIS',
  'VICI', 'CSGP', 'EXR', 'DHI', 'OKE', 'WEC', 'MLM', 'LEN', 'VMC', 'CTSH',
  'HAL', 'BIIB', 'BKR', 'ANSS', 'CDW', 'GLW', 'EBAY', 'RMD', 'CBRE', 'MTD',
  'ACGL', 'FTV', 'ZBH', 'HES', 'FANG', 'DAL', 'DLTR', 'DFS', 'TSCO', 'WTW',
  'HPE', 'EFX', 'ALGN', 'LH', 'AVB', 'GPN', 'TROW', 'WY', 'CAH', 'EIX',
  'STT', 'FE', 'ENPH', 'LYB', 'ES', 'MTB', 'WAB', 'HOLX', 'ILMN', 'RJF',
  'IR', 'DTE', 'ETR', 'DOV', 'FITB', 'NTRS', 'VTR', 'ARE', 'IFF', 'PPL',
  'CHD', 'BAX', 'CINF', 'SBAC', 'CLX', 'EXPD', 'PTC', 'TSN', 'AEE', 'LUV',
  'TDY', 'PKI', 'MKC', 'DRI', 'STLD', 'K', 'STE', 'RF', 'ESS', 'NVR',
  'HBAN', 'EQR', 'NDAQ', 'GRMN', 'COO', 'WAT', 'CNP', 'TRGP', 'ATO', 'MAA',
  'J', 'CFG', 'AMCR', 'JBHT', 'IP', 'FMC', 'SWK', 'WRB', 'SYY', 'EXPE',
  'SEDG', 'CE', 'LKQ', 'TXT', 'BBY', 'FDS', 'CMS', 'AES', 'KEY', 'NTAP',
  'URI', 'BALL', 'MOH', 'BR', 'DGX', 'SNA', 'IEX', 'L', 'TECH', 'OMC',
  'MAS', 'CF', 'POOL', 'AKAM', 'BRO', 'TER', 'LNT', 'CAG', 'GPC', 'AVY',
  'NI', 'UDR', 'SWKS', 'EVRG', 'VTRS', 'HST', 'KIM', 'WDC', 'CHRW', 'MGM',
  'HRL', 'PEAK', 'CPB', 'TPR', 'TFC', 'NRG', 'LDOS', 'GL', 'PNR', 'BXP',
  'JKHY', 'RCL', 'AAP', 'CZR', 'WYNN', 'PNW', 'NWS', 'NWSA', 'ROL', 'REG',
  'BEN', 'MOS', 'PHM', 'HSIC', 'FFIV', 'AAL', 'CCL', 'CPT', 'CRL', 'BWA',
  'CTLT', 'AIZ', 'WHR', 'DISH', 'IVZ', 'XRAY', 'SEE', 'ALK', 'NCLH', 'HII',
  'FRT', 'MKTX', 'EMN', 'PFG', 'APA', 'ALLE', 'HAS', 'TAP', 'QRVO', 'LW',
  'BBWI', 'DXC', 'ZION', 'WBA', 'VFC', 'PARA', 'LUMN', 'DVA', 'PAYC', 'CMA',
  'GNRC', 'BIO', 'INCY', 'UHS', 'ETSY', 'FOXA', 'FOX', 'NWL', 'MTCH', 'RL'
]

function isUsableMoverQuote(quote: ProviderQuote): boolean {
  return Boolean(quote.symbol) &&
    Number.isFinite(quote.price) &&
    quote.price > 0 &&
    Number.isFinite(quote.change) &&
    Number.isFinite(quote.changesPercentage)
}

async function loadSP500Gainers(
  quoteOptions: QuoteRequestOptions = {},
): Promise<{ gainers?: SP500MoverData[]; error?: string }> {
  try {
    const provider = getProvider()
    const allQuotes = quoteOptions.failureMode || quoteOptions.freshness || quoteOptions.signal
      ? await provider.getQuotes(SP500_SYMBOLS, quoteOptions)
      : await provider.getQuotes(SP500_SYMBOLS)
    const usableQuotes = allQuotes.filter(isUsableMoverQuote)
    if (quoteOptions.failureMode === 'throw' && usableQuotes.length === 0) {
      throw new Error('Provider returned no usable S&P 500 quotes')
    }

    // Sort by percentage change (descending) and take top 15
    const gainers = usableQuotes
      .filter((q) => q.changesPercentage > 0)
      .sort((a, b) => b.changesPercentage - a.changesPercentage)
      .slice(0, 15)
      .map((q) => ({
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        change: q.change,
        changesPercentage: q.changesPercentage
      }))

    return { gainers }
  } catch (error) {
    console.error('Error fetching S&P 500 gainers:', safeErrorMessage(error))
    return { error: 'Failed to load S&P 500 gainers' }
  }
}

/** Fetch S&P 500 gainers with the provider's legacy empty fallback. */
export async function getSP500Gainers(): Promise<{ gainers?: SP500MoverData[]; error?: string }> {
  return loadSP500Gainers()
}

/** Fetch S&P 500 gainers while preserving transient provider failures. */
export async function getSP500GainersWithStatus(): Promise<{ gainers?: SP500MoverData[]; error?: string }> {
  return loadSP500Gainers({ failureMode: 'throw' })
}

/**
 * Fetch S&P 500 losers - worst performers by percentage change
 */
async function loadSP500Losers(
  quoteOptions: QuoteRequestOptions = {},
): Promise<{ losers?: SP500MoverData[]; error?: string }> {
  try {
    const provider = getProvider()
    const allQuotes = quoteOptions.failureMode || quoteOptions.freshness || quoteOptions.signal
      ? await provider.getQuotes(SP500_SYMBOLS, quoteOptions)
      : await provider.getQuotes(SP500_SYMBOLS)
    const usableQuotes = allQuotes.filter(isUsableMoverQuote)
    if (quoteOptions.failureMode === 'throw' && usableQuotes.length === 0) {
      throw new Error('Provider returned no usable S&P 500 quotes')
    }

    // Sort by percentage change (ascending) and take bottom 15
    const losers = usableQuotes
      .filter((q) => q.changesPercentage < 0)
      .sort((a, b) => a.changesPercentage - b.changesPercentage)
      .slice(0, 15)
      .map((q) => ({
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        change: q.change,
        changesPercentage: q.changesPercentage
      }))

    return { losers }
  } catch (error) {
    console.error('Error fetching S&P 500 losers:', safeErrorMessage(error))
    return { error: 'Failed to load S&P 500 losers' }
  }
}

/** Fetch S&P 500 losers with the provider's legacy empty fallback. */
export async function getSP500Losers(): Promise<{ losers?: SP500MoverData[]; error?: string }> {
  return loadSP500Losers()
}

/** Fetch S&P 500 losers while preserving transient provider failures. */
export async function getSP500LosersWithStatus(): Promise<{ losers?: SP500MoverData[]; error?: string }> {
  return loadSP500Losers({ failureMode: 'throw' })
}
