'use server'

export interface EarningsData {
  symbol: string
  name: string
  date: string
  time: 'bmo' | 'amc' | 'dmh' | null  // before market open, after market close, during market hours
  fiscalDateEnding: string
  eps: number | null
  epsEstimated: number | null
  revenue: number | null
  revenueEstimated: number | null
}

export interface EarningsCalendarResult {
  earnings: EarningsData[]
  totalCount: number  // Total companies reporting (before filtering)
}

export async function fetchEarningsCalendar(): Promise<EarningsCalendarResult> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) {
    console.error('FMP_API_KEY not set')
    return { earnings: [], totalCount: 0 }
  }

  try {
    // Get earnings for the upcoming week (Mon-Fri)
    // On weekends, show next week. On weekdays, show current week.
    const today = new Date()
    const dayOfWeek = today.getDay() // 0 = Sunday, 1 = Monday, etc.

    // Calculate Monday of the relevant week
    const monday = new Date(today)
    if (dayOfWeek === 0) {
      // Sunday: show upcoming week (tomorrow is Monday)
      monday.setDate(today.getDate() + 1)
    } else if (dayOfWeek === 6) {
      // Saturday: show upcoming week (Monday is 2 days away)
      monday.setDate(today.getDate() + 2)
    } else {
      // Weekday: show current week's Monday
      monday.setDate(today.getDate() - (dayOfWeek - 1))
    }

    // Calculate Friday of that week
    const friday = new Date(monday)
    friday.setDate(monday.getDate() + 4)

    const fromDate = monday.toISOString().split('T')[0]
    const toDate = friday.toISOString().split('T')[0]

    console.log(`[Earnings Calendar] Fetching for week: ${fromDate} to ${toDate}`)

    const response = await fetch(
      `https://financialmodelingprep.com/api/v3/earning_calendar?from=${fromDate}&to=${toDate}&apikey=${apiKey}`,
      { cache: 'no-store' } // Disable cache to get fresh data
    )

    if (!response.ok) {
      console.error('Failed to fetch earnings calendar:', response.status)
      return { earnings: [], totalCount: 0 }
    }

    const data = await response.json()

    // S&P 500 constituents (as of Jan 2026)
    const sp500Symbols = new Set([
      'AAPL', 'ABBV', 'ABT', 'ACN', 'ADBE', 'ADI', 'ADM', 'ADP', 'ADSK', 'AEE',
      'AEP', 'AES', 'AFL', 'AIG', 'AIZ', 'AJG', 'AKAM', 'ALB', 'ALGN', 'ALK',
      'ALL', 'ALLE', 'AMAT', 'AMCR', 'AMD', 'AME', 'AMGN', 'AMP', 'AMT', 'AMZN',
      'ANET', 'ANSS', 'AON', 'AOS', 'APA', 'APD', 'APH', 'APTV', 'ARE', 'ATO',
      'AVB', 'AVGO', 'AVY', 'AWK', 'AXON', 'AXP', 'AZO', 'BA', 'BAC', 'BALL',
      'BAX', 'BBWI', 'BBY', 'BDX', 'BEN', 'BF.B', 'BG', 'BIIB', 'BIO', 'BK',
      'BKNG', 'BKR', 'BLDR', 'BLK', 'BMY', 'BR', 'BRK.B', 'BRO', 'BSX', 'BWA',
      'BX', 'BXP', 'C', 'CAG', 'CAH', 'CARR', 'CAT', 'CB', 'CBOE', 'CBRE',
      'CCI', 'CCL', 'CDNS', 'CDW', 'CE', 'CEG', 'CF', 'CFG', 'CHD', 'CHRW',
      'CHTR', 'CI', 'CINF', 'CL', 'CLX', 'CMA', 'CMCSA', 'CME', 'CMG', 'CMI',
      'CMS', 'CNC', 'CNP', 'COF', 'COO', 'COP', 'COR', 'COST', 'CPAY', 'CPB',
      'CPRT', 'CPT', 'CRL', 'CRM', 'CSCO', 'CSGP', 'CSX', 'CTAS', 'CTLT', 'CTRA',
      'CTSH', 'CTVA', 'CVS', 'CVX', 'CZR', 'D', 'DAL', 'DD', 'DE', 'DECK',
      'DFS', 'DG', 'DGX', 'DHI', 'DHR', 'DIS', 'DLR', 'DLTR', 'DOC', 'DOV',
      'DOW', 'DPZ', 'DRI', 'DTE', 'DUK', 'DVA', 'DVN', 'DXCM', 'EA', 'EBAY',
      'ECL', 'ED', 'EFX', 'EG', 'EIX', 'EL', 'ELV', 'EMN', 'EMR', 'ENPH',
      'EOG', 'EPAM', 'EQIX', 'EQR', 'EQT', 'ES', 'ESS', 'ETN', 'ETR', 'ETSY',
      'EVRG', 'EW', 'EXC', 'EXPD', 'EXPE', 'EXR', 'F', 'FANG', 'FAST', 'FCX',
      'FDS', 'FDX', 'FE', 'FFIV', 'FI', 'FICO', 'FIS', 'FITB', 'FLT', 'FMC',
      'FOX', 'FOXA', 'FRT', 'FSLR', 'FTNT', 'FTV', 'GD', 'GDDY', 'GE', 'GEHC',
      'GEN', 'GEV', 'GILD', 'GIS', 'GL', 'GLW', 'GM', 'GNRC', 'GOOG', 'GOOGL',
      'GPC', 'GPN', 'GRMN', 'GS', 'GWW', 'HAL', 'HAS', 'HBAN', 'HCA', 'HD',
      'HES', 'HIG', 'HII', 'HLT', 'HOLX', 'HON', 'HPE', 'HPQ', 'HRL', 'HSIC',
      'HST', 'HSY', 'HUBB', 'HUM', 'HWM', 'IBM', 'ICE', 'IDXX', 'IEX', 'IFF',
      'ILMN', 'INCY', 'INTC', 'INTU', 'INVH', 'IP', 'IPG', 'IQV', 'IR', 'IRM',
      'ISRG', 'IT', 'ITW', 'IVZ', 'J', 'JBHT', 'JBL', 'JCI', 'JKHY', 'JNJ',
      'JNPR', 'JPM', 'K', 'KDP', 'KEY', 'KEYS', 'KHC', 'KIM', 'KLAC', 'KMB',
      'KMI', 'KMX', 'KO', 'KR', 'KVUE', 'L', 'LDOS', 'LEN', 'LH', 'LHX',
      'LIN', 'LKQ', 'LLY', 'LMT', 'LNT', 'LOW', 'LRCX', 'LULU', 'LUV', 'LVS',
      'LW', 'LYB', 'LYV', 'MA', 'MAA', 'MAR', 'MAS', 'MCD', 'MCHP', 'MCK',
      'MCO', 'MDLZ', 'MDT', 'MET', 'META', 'MGM', 'MHK', 'MKC', 'MKTX', 'MLM',
      'MMC', 'MMM', 'MNST', 'MO', 'MOH', 'MOS', 'MPC', 'MPWR', 'MRK', 'MRNA',
      'MRO', 'MS', 'MSCI', 'MSFT', 'MSI', 'MTB', 'MTCH', 'MTD', 'MU', 'NCLH',
      'NDAQ', 'NDSN', 'NEE', 'NEM', 'NFLX', 'NI', 'NKE', 'NOC', 'NOW', 'NRG',
      'NSC', 'NTAP', 'NTRS', 'NUE', 'NVDA', 'NVR', 'NWS', 'NWSA', 'NXPI', 'O',
      'ODFL', 'OKE', 'OMC', 'ON', 'ORCL', 'ORLY', 'OTIS', 'OXY', 'PANW', 'PARA',
      'PAYC', 'PAYX', 'PCAR', 'PCG', 'PEG', 'PEP', 'PFE', 'PFG', 'PG', 'PGR',
      'PH', 'PHM', 'PKG', 'PLD', 'PM', 'PNC', 'PNR', 'PNW', 'PODD', 'POOL',
      'PPG', 'PPL', 'PRU', 'PSA', 'PSX', 'PTC', 'PWR', 'PYPL', 'QCOM', 'QRVO',
      'RCL', 'REG', 'REGN', 'RF', 'RJF', 'RL', 'RMD', 'ROK', 'ROL', 'ROP',
      'ROST', 'RSG', 'RTX', 'RVTY', 'SBAC', 'SBUX', 'SCHW', 'SHW', 'SJM', 'SLB',
      'SMCI', 'SNA', 'SNPS', 'SO', 'SOLV', 'SPG', 'SPGI', 'SRE', 'STE', 'STLD',
      'STT', 'STX', 'STZ', 'SWK', 'SWKS', 'SYF', 'SYK', 'SYY', 'T', 'TAP',
      'TDG', 'TDY', 'TECH', 'TEL', 'TER', 'TFC', 'TFX', 'TGT', 'TJX', 'TMO',
      'TMUS', 'TPR', 'TRGP', 'TRMB', 'TROW', 'TRV', 'TSCO', 'TSLA', 'TSN', 'TT',
      'TTWO', 'TXN', 'TXT', 'TYL', 'UAL', 'UBER', 'UDR', 'UHS', 'ULTA', 'UNH',
      'UNP', 'UPS', 'URI', 'USB', 'V', 'VFC', 'VICI', 'VLO', 'VLTO', 'VMC',
      'VRSK', 'VRSN', 'VRTX', 'VST', 'VTR', 'VTRS', 'VZ', 'WAB', 'WAT', 'WBA',
      'WBD', 'WDC', 'WEC', 'WELL', 'WFC', 'WM', 'WMB', 'WMT', 'WRB', 'WRK',
      'WST', 'WTW', 'WY', 'WYNN', 'XEL', 'XOM', 'XYL', 'YUM', 'ZBH', 'ZBRA', 'ZTS'
    ])

    // Top 20 S&P 500 companies by market cap (these should always be shown if reporting)
    const megaCapSymbols = new Set([
      'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'AMZN', 'META', 'BRK.B', 'LLY', 'AVGO',
      'TSLA', 'WMT', 'JPM', 'V', 'UNH', 'XOM', 'MA', 'ORCL', 'COST', 'HD'
    ])

    // Filter to S&P 500 stocks only
    const sp500Earnings = Array.isArray(data)
      ? data.filter((item: any) => sp500Symbols.has(item.symbol))
      : []

    const totalCount = sp500Earnings.length
    console.log(`[Earnings Calendar] FMP returned ${data?.length || 0} total, ${totalCount} S&P 500 stocks reporting`)

    // Separate mega-cap and other S&P 500 earnings
    const megaCapEarnings = sp500Earnings.filter((item: any) => megaCapSymbols.has(item.symbol))
    const otherEarnings = sp500Earnings.filter((item: any) => !megaCapSymbols.has(item.symbol))

    // Prioritize mega-caps, then fill remaining slots with others (max 10 total)
    const maxDisplay = 10
    const combined = [
      ...megaCapEarnings.slice(0, maxDisplay),
      ...otherEarnings.slice(0, Math.max(0, maxDisplay - megaCapEarnings.length))
    ].slice(0, maxDisplay)

    // Sort by date
    combined.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const filtered = combined.map((item: any) => ({
      symbol: item.symbol,
      name: getCompanyName(item.symbol),
      date: item.date,
      time: item.time || null,
      fiscalDateEnding: item.fiscalDateEnding,
      eps: item.eps,
      epsEstimated: item.epsEstimated,
      revenue: item.revenue,
      revenueEstimated: item.revenueEstimated,
    }))

    console.log(`[Earnings Calendar] Showing ${megaCapEarnings.length} mega-cap + ${filtered.length - megaCapEarnings.length} other = ${filtered.length} total`)

    return { earnings: filtered, totalCount }
  } catch (error) {
    console.error('Error fetching earnings calendar:', error)
    return { earnings: [], totalCount: 0 }
  }
}

// Simple mapping for S&P 500 company names
function getCompanyName(symbol: string): string {
  const names: Record<string, string> = {
    'AAPL': 'Apple', 'ABBV': 'AbbVie', 'ABT': 'Abbott', 'ACN': 'Accenture', 'ADBE': 'Adobe',
    'ADI': 'Analog Devices', 'ADM': 'ADM', 'ADP': 'ADP', 'ADSK': 'Autodesk', 'AEE': 'Ameren',
    'AEP': 'AEP', 'AES': 'AES', 'AFL': 'Aflac', 'AIG': 'AIG', 'AIZ': 'Assurant',
    'AJG': 'Arthur J Gallagher', 'AKAM': 'Akamai', 'ALB': 'Albemarle', 'ALGN': 'Align Tech', 'ALK': 'Alaska Air',
    'ALL': 'Allstate', 'ALLE': 'Allegion', 'AMAT': 'Applied Materials', 'AMCR': 'Amcor', 'AMD': 'AMD',
    'AME': 'Ametek', 'AMGN': 'Amgen', 'AMP': 'Ameriprise', 'AMT': 'American Tower', 'AMZN': 'Amazon',
    'ANET': 'Arista Networks', 'ANSS': 'Ansys', 'AON': 'Aon', 'AOS': 'A.O. Smith', 'APA': 'APA Corp',
    'APD': 'Air Products', 'APH': 'Amphenol', 'APTV': 'Aptiv', 'ARE': 'Alexandria RE', 'ATO': 'Atmos Energy',
    'AVB': 'AvalonBay', 'AVGO': 'Broadcom', 'AVY': 'Avery Dennison', 'AWK': 'American Water', 'AXON': 'Axon',
    'AXP': 'American Express', 'AZO': 'AutoZone', 'BA': 'Boeing', 'BAC': 'Bank of America', 'BALL': 'Ball Corp',
    'BAX': 'Baxter', 'BBWI': 'Bath & Body Works', 'BBY': 'Best Buy', 'BDX': 'Becton Dickinson', 'BEN': 'Franklin Resources',
    'BG': 'Bunge', 'BIIB': 'Biogen', 'BIO': 'Bio-Rad', 'BK': 'BNY Mellon', 'BKNG': 'Booking Holdings',
    'BKR': 'Baker Hughes', 'BLDR': 'Builders FirstSource', 'BLK': 'BlackRock', 'BMY': 'Bristol-Myers', 'BR': 'Broadridge',
    'BRK.B': 'Berkshire Hathaway', 'BRO': 'Brown & Brown', 'BSX': 'Boston Scientific', 'BWA': 'BorgWarner', 'BX': 'Blackstone',
    'BXP': 'BXP', 'C': 'Citigroup', 'CAG': 'Conagra', 'CAH': 'Cardinal Health', 'CARR': 'Carrier',
    'CAT': 'Caterpillar', 'CB': 'Chubb', 'CBOE': 'Cboe', 'CBRE': 'CBRE', 'CCI': 'Crown Castle',
    'CCL': 'Carnival', 'CDNS': 'Cadence', 'CDW': 'CDW', 'CE': 'Celanese', 'CEG': 'Constellation Energy',
    'CF': 'CF Industries', 'CFG': 'Citizens Financial', 'CHD': 'Church & Dwight', 'CHRW': 'C.H. Robinson', 'CHTR': 'Charter',
    'CI': 'Cigna', 'CINF': 'Cincinnati Financial', 'CL': 'Colgate-Palmolive', 'CLX': 'Clorox', 'CMA': 'Comerica',
    'CMCSA': 'Comcast', 'CME': 'CME Group', 'CMG': 'Chipotle', 'CMI': 'Cummins', 'CMS': 'CMS Energy',
    'CNC': 'Centene', 'CNP': 'CenterPoint', 'COF': 'Capital One', 'COO': 'Cooper Companies', 'COP': 'ConocoPhillips',
    'COR': 'Cencora', 'COST': 'Costco', 'CPAY': 'Corpay', 'CPB': "Campbell's", 'CPRT': 'Copart',
    'CPT': 'Camden Property', 'CRL': 'Charles River', 'CRM': 'Salesforce', 'CSCO': 'Cisco', 'CSGP': 'CoStar',
    'CSX': 'CSX', 'CTAS': 'Cintas', 'CTLT': 'Catalent', 'CTRA': 'Coterra', 'CTSH': 'Cognizant',
    'CTVA': 'Corteva', 'CVS': 'CVS Health', 'CVX': 'Chevron', 'CZR': 'Caesars', 'D': 'Dominion',
    'DAL': 'Delta Air Lines', 'DD': 'DuPont', 'DE': 'Deere', 'DECK': 'Deckers', 'DFS': 'Discover',
    'DG': 'Dollar General', 'DGX': 'Quest Diagnostics', 'DHI': 'D.R. Horton', 'DHR': 'Danaher', 'DIS': 'Disney',
    'DLR': 'Digital Realty', 'DLTR': 'Dollar Tree', 'DOC': 'Healthpeak', 'DOV': 'Dover', 'DOW': 'Dow',
    'DPZ': "Domino's", 'DRI': "Darden", 'DTE': 'DTE Energy', 'DUK': 'Duke Energy', 'DVA': 'DaVita',
    'DVN': 'Devon Energy', 'DXCM': 'DexCom', 'EA': 'Electronic Arts', 'EBAY': 'eBay', 'ECL': 'Ecolab',
    'ED': 'Con Edison', 'EFX': 'Equifax', 'EG': 'Everest Group', 'EIX': 'Edison Intl', 'EL': 'Estée Lauder',
    'ELV': 'Elevance Health', 'EMN': 'Eastman Chemical', 'EMR': 'Emerson', 'ENPH': 'Enphase', 'EOG': 'EOG Resources',
    'EPAM': 'EPAM', 'EQIX': 'Equinix', 'EQR': 'Equity Residential', 'EQT': 'EQT', 'ES': 'Eversource',
    'ESS': 'Essex Property', 'ETN': 'Eaton', 'ETR': 'Entergy', 'ETSY': 'Etsy', 'EVRG': 'Evergy',
    'EW': 'Edwards Lifesciences', 'EXC': 'Exelon', 'EXPD': 'Expeditors', 'EXPE': 'Expedia', 'EXR': 'Extra Space',
    'F': 'Ford', 'FANG': 'Diamondback', 'FAST': 'Fastenal', 'FCX': 'Freeport-McMoRan', 'FDS': 'FactSet',
    'FDX': 'FedEx', 'FE': 'FirstEnergy', 'FFIV': 'F5', 'FI': 'Fiserv', 'FICO': 'FICO',
    'FIS': 'FIS', 'FITB': 'Fifth Third', 'FLT': 'FleetCor', 'FMC': 'FMC', 'FOX': 'Fox Corp',
    'FOXA': 'Fox Corp', 'FRT': 'Federal Realty', 'FSLR': 'First Solar', 'FTNT': 'Fortinet', 'FTV': 'Fortive',
    'GD': 'General Dynamics', 'GDDY': 'GoDaddy', 'GE': 'GE Aerospace', 'GEHC': 'GE HealthCare', 'GEN': 'Gen Digital',
    'GEV': 'GE Vernova', 'GILD': 'Gilead', 'GIS': 'General Mills', 'GL': 'Globe Life', 'GLW': 'Corning',
    'GM': 'General Motors', 'GNRC': 'Generac', 'GOOG': 'Alphabet', 'GOOGL': 'Alphabet', 'GPC': 'Genuine Parts',
    'GPN': 'Global Payments', 'GRMN': 'Garmin', 'GS': 'Goldman Sachs', 'GWW': 'Grainger', 'HAL': 'Halliburton',
    'HAS': 'Hasbro', 'HBAN': 'Huntington', 'HCA': 'HCA Healthcare', 'HD': 'Home Depot', 'HES': 'Hess',
    'HIG': 'Hartford', 'HII': 'Huntington Ingalls', 'HLT': 'Hilton', 'HOLX': 'Hologic', 'HON': 'Honeywell',
    'HPE': 'HPE', 'HPQ': 'HP', 'HRL': 'Hormel', 'HSIC': 'Henry Schein', 'HST': 'Host Hotels',
    'HSY': "Hershey's", 'HUBB': 'Hubbell', 'HUM': 'Humana', 'HWM': 'Howmet', 'IBM': 'IBM',
    'ICE': 'ICE', 'IDXX': 'Idexx', 'IEX': 'IDEX', 'IFF': 'IFF', 'ILMN': 'Illumina',
    'INCY': 'Incyte', 'INTC': 'Intel', 'INTU': 'Intuit', 'INVH': 'Invitation Homes', 'IP': 'Intl Paper',
    'IPG': 'IPG', 'IQV': 'IQVIA', 'IR': 'Ingersoll Rand', 'IRM': 'Iron Mountain', 'ISRG': 'Intuitive Surgical',
    'IT': 'Gartner', 'ITW': 'Illinois Tool Works', 'IVZ': 'Invesco', 'J': 'Jacobs', 'JBHT': 'J.B. Hunt',
    'JBL': 'Jabil', 'JCI': 'Johnson Controls', 'JKHY': 'Jack Henry', 'JNJ': 'Johnson & Johnson', 'JNPR': 'Juniper',
    'JPM': 'JPMorgan Chase', 'K': "Kellanova", 'KDP': 'Keurig Dr Pepper', 'KEY': 'KeyCorp', 'KEYS': 'Keysight',
    'KHC': 'Kraft Heinz', 'KIM': 'Kimco Realty', 'KLAC': 'KLA', 'KMB': 'Kimberly-Clark', 'KMI': 'Kinder Morgan',
    'KMX': 'CarMax', 'KO': 'Coca-Cola', 'KR': 'Kroger', 'KVUE': 'Kenvue', 'L': 'Loews',
    'LDOS': 'Leidos', 'LEN': 'Lennar', 'LH': 'LabCorp', 'LHX': 'L3Harris', 'LIN': 'Linde',
    'LKQ': 'LKQ', 'LLY': 'Eli Lilly', 'LMT': 'Lockheed Martin', 'LNT': 'Alliant Energy', 'LOW': "Lowe's",
    'LRCX': 'Lam Research', 'LULU': 'Lululemon', 'LUV': 'Southwest', 'LVS': 'Las Vegas Sands', 'LW': 'Lamb Weston',
    'LYB': 'LyondellBasell', 'LYV': 'Live Nation', 'MA': 'Mastercard', 'MAA': 'Mid-America Apt', 'MAR': 'Marriott',
    'MAS': 'Masco', 'MCD': "McDonald's", 'MCHP': 'Microchip', 'MCK': 'McKesson', 'MCO': "Moody's",
    'MDLZ': 'Mondelez', 'MDT': 'Medtronic', 'MET': 'MetLife', 'META': 'Meta', 'MGM': 'MGM Resorts',
    'MHK': 'Mohawk', 'MKC': 'McCormick', 'MKTX': 'MarketAxess', 'MLM': 'Martin Marietta', 'MMC': 'Marsh McLennan',
    'MMM': '3M', 'MNST': 'Monster Beverage', 'MO': 'Altria', 'MOH': 'Molina', 'MOS': 'Mosaic',
    'MPC': 'Marathon Petroleum', 'MPWR': 'Monolithic Power', 'MRK': 'Merck', 'MRNA': 'Moderna', 'MRO': 'Marathon Oil',
    'MS': 'Morgan Stanley', 'MSCI': 'MSCI', 'MSFT': 'Microsoft', 'MSI': 'Motorola', 'MTB': 'M&T Bank',
    'MTCH': 'Match Group', 'MTD': 'Mettler-Toledo', 'MU': 'Micron', 'NCLH': 'Norwegian Cruise', 'NDAQ': 'Nasdaq',
    'NDSN': 'Nordson', 'NEE': 'NextEra', 'NEM': 'Newmont', 'NFLX': 'Netflix', 'NI': 'NiSource',
    'NKE': 'Nike', 'NOC': 'Northrop Grumman', 'NOW': 'ServiceNow', 'NRG': 'NRG Energy', 'NSC': 'Norfolk Southern',
    'NTAP': 'NetApp', 'NTRS': 'Northern Trust', 'NUE': 'Nucor', 'NVDA': 'NVIDIA', 'NVR': 'NVR',
    'NWS': 'News Corp', 'NWSA': 'News Corp', 'NXPI': 'NXP', 'O': 'Realty Income', 'ODFL': 'Old Dominion',
    'OKE': 'Oneok', 'OMC': 'Omnicom', 'ON': 'ON Semi', 'ORCL': 'Oracle', 'ORLY': "O'Reilly Auto",
    'OTIS': 'Otis', 'OXY': 'Occidental', 'PANW': 'Palo Alto Networks', 'PARA': 'Paramount', 'PAYC': 'Paycom',
    'PAYX': 'Paychex', 'PCAR': 'Paccar', 'PCG': 'PG&E', 'PEG': 'PSEG', 'PEP': 'PepsiCo',
    'PFE': 'Pfizer', 'PFG': 'Principal', 'PG': 'Procter & Gamble', 'PGR': 'Progressive', 'PH': 'Parker Hannifin',
    'PHM': 'PulteGroup', 'PKG': 'Packaging Corp', 'PLD': 'Prologis', 'PM': 'Philip Morris', 'PNC': 'PNC',
    'PNR': 'Pentair', 'PNW': 'Pinnacle West', 'PODD': 'Insulet', 'POOL': 'Pool Corp', 'PPG': 'PPG',
    'PPL': 'PPL', 'PRU': 'Prudential', 'PSA': 'Public Storage', 'PSX': 'Phillips 66', 'PTC': 'PTC',
    'PWR': 'Quanta', 'PYPL': 'PayPal', 'QCOM': 'Qualcomm', 'QRVO': 'Qorvo', 'RCL': 'Royal Caribbean',
    'REG': 'Regency Centers', 'REGN': 'Regeneron', 'RF': 'Regions', 'RJF': 'Raymond James', 'RL': 'Ralph Lauren',
    'RMD': 'ResMed', 'ROK': 'Rockwell', 'ROL': 'Rollins', 'ROP': 'Roper', 'ROST': "Ross Stores",
    'RSG': 'Republic Services', 'RTX': 'RTX', 'RVTY': 'Revvity', 'SBAC': 'SBA Communications', 'SBUX': 'Starbucks',
    'SCHW': 'Schwab', 'SHW': 'Sherwin-Williams', 'SJM': 'J.M. Smucker', 'SLB': 'SLB', 'SMCI': 'Super Micro',
    'SNA': 'Snap-on', 'SNPS': 'Synopsys', 'SO': 'Southern Co', 'SOLV': 'Solventum', 'SPG': 'Simon Property',
    'SPGI': 'S&P Global', 'SRE': 'Sempra', 'STE': 'Steris', 'STLD': 'Steel Dynamics', 'STT': 'State Street',
    'STX': 'Seagate', 'STZ': 'Constellation Brands', 'SWK': 'Stanley Black & Decker', 'SWKS': 'Skyworks', 'SYF': 'Synchrony',
    'SYK': 'Stryker', 'SYY': 'Sysco', 'T': 'AT&T', 'TAP': 'Molson Coors', 'TDG': 'TransDigm',
    'TDY': 'Teledyne', 'TECH': 'Bio-Techne', 'TEL': 'TE Connectivity', 'TER': 'Teradyne', 'TFC': 'Truist',
    'TFX': 'Teleflex', 'TGT': 'Target', 'TJX': 'TJX', 'TMO': 'Thermo Fisher', 'TMUS': 'T-Mobile',
    'TPR': 'Tapestry', 'TRGP': 'Targa Resources', 'TRMB': 'Trimble', 'TROW': 'T. Rowe Price', 'TRV': 'Travelers',
    'TSCO': 'Tractor Supply', 'TSLA': 'Tesla', 'TSN': 'Tyson Foods', 'TT': 'Trane', 'TTWO': 'Take-Two',
    'TXN': 'Texas Instruments', 'TXT': 'Textron', 'TYL': 'Tyler Tech', 'UAL': 'United Airlines', 'UBER': 'Uber',
    'UDR': 'UDR', 'UHS': 'Universal Health', 'ULTA': 'Ulta Beauty', 'UNH': 'UnitedHealth', 'UNP': 'Union Pacific',
    'UPS': 'UPS', 'URI': 'United Rentals', 'USB': 'US Bancorp', 'V': 'Visa', 'VFC': 'VF Corp',
    'VICI': 'Vici Properties', 'VLO': 'Valero', 'VLTO': 'Veralto', 'VMC': 'Vulcan Materials', 'VRSK': 'Verisk',
    'VRSN': 'VeriSign', 'VRTX': 'Vertex', 'VST': 'Vistra', 'VTR': 'Ventas', 'VTRS': 'Viatris',
    'VZ': 'Verizon', 'WAB': 'Wabtec', 'WAT': 'Waters', 'WBA': 'Walgreens', 'WBD': 'Warner Bros',
    'WDC': 'Western Digital', 'WEC': 'WEC Energy', 'WELL': 'Welltower', 'WFC': 'Wells Fargo', 'WM': 'Waste Management',
    'WMB': 'Williams', 'WMT': 'Walmart', 'WRB': 'W.R. Berkley', 'WRK': 'WestRock', 'WST': 'West Pharma',
    'WTW': 'WTW', 'WY': 'Weyerhaeuser', 'WYNN': 'Wynn Resorts', 'XEL': 'Xcel Energy', 'XOM': 'Exxon Mobil',
    'XYL': 'Xylem', 'YUM': 'Yum! Brands', 'ZBH': 'Zimmer Biomet', 'ZBRA': 'Zebra', 'ZTS': 'Zoetis'
  }
  return names[symbol] || symbol
}
