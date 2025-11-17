/**
 * Macro Attribution Eval Test Suite
 *
 * Tests the accuracy of macro vs company attribution in "Why It Moved" summaries.
 * Covers diverse scenarios to prevent false positives and ensure correct attribution.
 */

export interface EvalTestCase {
  id: string
  name: string
  description: string

  // Input data
  input: {
    symbol: string
    priceData: {
      currentPrice: number
      change: number
      changePercent: number
      volume: number
      previousClose: number
    }
    benchmarkContext: {
      benchmark: 'SPY' | 'QQQ'
      benchmarkReturn: number  // Decimal (e.g., -0.0250 = -2.5%)
      aligned: boolean
    }
    macroEvents: Array<{
      type: 'trade_tariff' | 'fed_policy' | 'geopolitical' | 'economic_data' | 'financial_stress' | 'policy'
      headline: string
    }>
    companyHeadlines: string[]
  }

  // Expected output
  expected: {
    attributionType: 'macro' | 'company' | 'mixed' | 'no_clear_catalyst'
    primaryDriverMustInclude?: string[]  // Keywords that MUST appear in primaryDriver
    primaryDriverMustNotInclude?: string[]  // Keywords that MUST NOT appear
    narrativeMustInclude?: string[]
    sentimentRange: {
      min: 'bearish' | 'neutral' | 'bullish'
      max: 'bearish' | 'neutral' | 'bullish'
    }
    scoreRange: {
      min: number  // -1 to 1
      max: number
    }
    confidenceRange: {
      min: number  // 0 to 1
      max: number
    }
    reasoning: string  // Why this is the expected outcome
  }
}

/**
 * Eval Test Suite
 *
 * Covers:
 * - Clear macro attribution (stock moves with market on macro event)
 * - Clear company attribution (stock diverges from market with strong news)
 * - Ambiguous cases (aligned with market but strong company news)
 * - Edge cases (contradictions, no catalyst)
 */
export const macroAttributionEvals: EvalTestCase[] = [
  // ========================================
  // MACRO ATTRIBUTION TESTS
  // ========================================

  {
    id: 'macro-01-tariff-aligned',
    name: 'Tariff Impact - Stock Aligned with Market Decline',
    description: 'Stock down 2.1% when market down 1.8% on China tariff news. Should attribute to macro.',
    input: {
      symbol: 'TSLA',
      priceData: {
        currentPrice: 182.45,
        change: -3.95,
        changePercent: -2.12,
        volume: 125000000,
        previousClose: 186.40
      },
      benchmarkContext: {
        benchmark: 'QQQ',
        benchmarkReturn: -0.0180,  // -1.8%
        aligned: true
      },
      macroEvents: [
        {
          type: 'trade_tariff',
          headline: 'China Announces Retaliatory Shipping Sanctions on U.S. Exports'
        }
      ],
      companyHeadlines: [
        'Tesla production update shows steady output',
        'Analyst maintains hold rating on Tesla'
      ]
    },
    expected: {
      attributionType: 'macro',
      primaryDriverMustInclude: ['tariff', 'China', 'market'],
      primaryDriverMustNotInclude: ['production', 'analyst', 'rating'],
      narrativeMustInclude: ['line with', 'market', 'tariff'],
      sentimentRange: { min: 'bearish', max: 'bearish' },
      scoreRange: { min: -0.7, max: -0.3 },
      confidenceRange: { min: 0.5, max: 0.75 },
      reasoning: 'Stock moved in line with market (-2.1% vs -1.8%). Macro event explains market-wide decline. Company news is weak/neutral.'
    }
  },

  {
    id: 'macro-02-fed-policy-aligned',
    name: 'Fed Policy - Market Rally, Stock Participates',
    description: 'Stock up 2.8% when market up 2.5% on Fed rate hold. Should attribute to macro.',
    input: {
      symbol: 'AAPL',
      priceData: {
        currentPrice: 178.50,
        change: 4.85,
        changePercent: 2.79,
        volume: 68000000,
        previousClose: 173.65
      },
      benchmarkContext: {
        benchmark: 'QQQ',
        benchmarkReturn: 0.0245,  // +2.45%
        aligned: true
      },
      macroEvents: [
        {
          type: 'fed_policy',
          headline: 'Fed Holds Rates Steady, Signals Dovish Stance'
        }
      ],
      companyHeadlines: [
        'Apple announces minor App Store policy update',
        'iPhone sales tracking in line with expectations'
      ]
    },
    expected: {
      attributionType: 'macro',
      primaryDriverMustInclude: ['Fed', 'rate', 'market'],
      primaryDriverMustNotInclude: ['App Store', 'iPhone', 'sales'],
      narrativeMustInclude: ['line with', 'market', 'Fed'],
      sentimentRange: { min: 'bullish', max: 'bullish' },
      scoreRange: { min: 0.3, max: 0.7 },
      confidenceRange: { min: 0.5, max: 0.75 },
      reasoning: 'Stock moved with tech rally (+2.8% vs +2.45%). Fed policy explains broad market strength. Company news is routine/weak.'
    }
  },

  {
    id: 'macro-03-geopolitical-sector-down',
    name: 'Geopolitical Risk - Oil Stocks Decline',
    description: 'Energy stock down with market on geopolitical tensions. Should attribute to macro.',
    input: {
      symbol: 'XOM',
      priceData: {
        currentPrice: 102.30,
        change: -2.45,
        changePercent: -2.34,
        volume: 22000000,
        previousClose: 104.75
      },
      benchmarkContext: {
        benchmark: 'SPY',
        benchmarkReturn: -0.0215,  // -2.15%
        aligned: true
      },
      macroEvents: [
        {
          type: 'geopolitical',
          headline: 'Russia-Ukraine Conflict Escalates, Oil Prices Surge'
        }
      ],
      companyHeadlines: [
        'Exxon Mobil quarterly production steady',
        'Energy sector faces regulatory scrutiny'
      ]
    },
    expected: {
      attributionType: 'macro',
      primaryDriverMustInclude: ['geopolitical', 'market', 'Russia', 'Ukraine'],
      narrativeMustInclude: ['line with', 'market'],
      sentimentRange: { min: 'bearish', max: 'bearish' },
      scoreRange: { min: -0.7, max: -0.3 },
      confidenceRange: { min: 0.5, max: 0.7 },
      reasoning: 'Stock moved with market decline despite geopolitical event affecting oil. Broad market risk-off sentiment explains move.'
    }
  },

  // ========================================
  // COMPANY ATTRIBUTION TESTS
  // ========================================

  {
    id: 'company-01-earnings-beat-diverge',
    name: 'Earnings Beat - Stock Up, Market Down',
    description: 'Stock up 4.2% on strong earnings while market down 1.5%. Should attribute to company.',
    input: {
      symbol: 'NVDA',
      priceData: {
        currentPrice: 495.80,
        change: 20.05,
        changePercent: 4.21,
        volume: 85000000,
        previousClose: 475.75
      },
      benchmarkContext: {
        benchmark: 'QQQ',
        benchmarkReturn: -0.0152,  // -1.52%
        aligned: false
      },
      macroEvents: [
        {
          type: 'economic_data',
          headline: 'CPI Rises 3.5% in October, Exceeding Expectations'
        }
      ],
      companyHeadlines: [
        'Nvidia Q4 Earnings Beat Estimates by 15%, Data Center Revenue Surges',
        'Strong AI chip demand drives record quarter for Nvidia',
        'Nvidia raises full-year guidance on robust demand'
      ]
    },
    expected: {
      attributionType: 'company',
      primaryDriverMustInclude: ['earnings', 'beat', 'Q4'],
      primaryDriverMustNotInclude: ['CPI', 'inflation', 'market'],
      narrativeMustInclude: ['earnings', 'beat'],
      sentimentRange: { min: 'bullish', max: 'bullish' },
      scoreRange: { min: 0.6, max: 1.0 },
      confidenceRange: { min: 0.75, max: 0.95 },
      reasoning: 'Stock DIVERGED from market (up 4.2% vs down 1.5%). Strong earnings news from multiple tier-1 sources explains move.'
    }
  },

  {
    id: 'company-02-product-recall-diverge',
    name: 'Product Recall - Stock Down, Market Up',
    description: 'Stock down 3.5% on recall while market up 1.2%. Should attribute to company.',
    input: {
      symbol: 'TSLA',
      priceData: {
        currentPrice: 178.20,
        change: -6.45,
        changePercent: -3.49,
        volume: 142000000,
        previousClose: 184.65
      },
      benchmarkContext: {
        benchmark: 'QQQ',
        benchmarkReturn: 0.0118,  // +1.18%
        aligned: false
      },
      macroEvents: [],
      companyHeadlines: [
        'Tesla Recalls 2 Million Vehicles Over Autopilot Safety Concerns',
        'NHTSA Issues Safety Warning for Tesla Autopilot Feature',
        'Tesla faces regulatory scrutiny over self-driving claims'
      ]
    },
    expected: {
      attributionType: 'company',
      primaryDriverMustInclude: ['recall', 'Autopilot', 'safety'],
      primaryDriverMustNotInclude: ['market', 'sector'],
      narrativeMustInclude: ['recall', 'Autopilot'],
      sentimentRange: { min: 'bearish', max: 'bearish' },
      scoreRange: { min: -1.0, max: -0.5 },
      confidenceRange: { min: 0.7, max: 0.9 },
      reasoning: 'Stock DIVERGED from market (down 3.5% vs up 1.2%). Multiple tier-1 sources covering significant recall explains decline.'
    }
  },

  {
    id: 'company-03-ma-announcement',
    name: 'M&A Announcement - Stock Surges',
    description: 'Stock up 8.5% on acquisition news. Market flat. Should attribute to company.',
    input: {
      symbol: 'AMD',
      priceData: {
        currentPrice: 157.40,
        change: 12.30,
        changePercent: 8.48,
        volume: 95000000,
        previousClose: 145.10
      },
      benchmarkContext: {
        benchmark: 'QQQ',
        benchmarkReturn: 0.0025,  // +0.25%
        aligned: false
      },
      macroEvents: [],
      companyHeadlines: [
        'AMD to Acquire AI Chip Startup for $4.9 Billion',
        'AMD acquisition strengthens AI portfolio',
        'Wall Street cheers AMD\'s strategic AI move'
      ]
    },
    expected: {
      attributionType: 'company',
      primaryDriverMustInclude: ['acquisition', 'acquire', 'AI'],
      primaryDriverMustNotInclude: ['market', 'sector'],
      narrativeMustInclude: ['acquisition', 'AI'],
      sentimentRange: { min: 'bullish', max: 'bullish' },
      scoreRange: { min: 0.7, max: 1.0 },
      confidenceRange: { min: 0.8, max: 0.95 },
      reasoning: 'Stock DIVERGED massively (up 8.5% vs market +0.25%). Major M&A news from multiple sources explains surge.'
    }
  },

  // ========================================
  // AMBIGUOUS / MIXED CASES
  // ========================================

  {
    id: 'mixed-01-aligned-strong-company',
    name: 'Strong Earnings + Market Rally',
    description: 'Stock up 3.8% on strong earnings, market also up 2.5%. Could be both, but earnings is stronger driver.',
    input: {
      symbol: 'AAPL',
      priceData: {
        currentPrice: 182.50,
        change: 6.70,
        changePercent: 3.81,
        volume: 95000000,
        previousClose: 175.80
      },
      benchmarkContext: {
        benchmark: 'QQQ',
        benchmarkReturn: 0.0248,  // +2.48%
        aligned: true
      },
      macroEvents: [
        {
          type: 'fed_policy',
          headline: 'Fed Signals Dovish Stance, Tech Stocks Rally'
        }
      ],
      companyHeadlines: [
        'Apple Q4 Earnings Beat Estimates by 10%, iPhone Revenue Strong',
        'Apple services revenue hits record high',
        'Apple raises dividend by 4%'
      ]
    },
    expected: {
      attributionType: 'company',
      primaryDriverMustInclude: ['earnings', 'beat'],
      narrativeMustInclude: ['earnings'],
      sentimentRange: { min: 'bullish', max: 'bullish' },
      scoreRange: { min: 0.6, max: 1.0 },
      confidenceRange: { min: 0.7, max: 0.9 },
      reasoning: 'Stock outperformed market (3.8% vs 2.5%). Strong company-specific earnings catalyst justifies attribution to company despite market also being up.'
    }
  },

  {
    id: 'mixed-02-aligned-weak-company',
    name: 'Weak Company News + Market Decline',
    description: 'Stock down 2.0% on minor downgrade, market down 1.8%. Should attribute to macro since company news is weak.',
    input: {
      symbol: 'GOOGL',
      priceData: {
        currentPrice: 138.40,
        change: -2.82,
        changePercent: -2.00,
        volume: 32000000,
        previousClose: 141.22
      },
      benchmarkContext: {
        benchmark: 'QQQ',
        benchmarkReturn: -0.0182,  // -1.82%
        aligned: true
      },
      macroEvents: [
        {
          type: 'trade_tariff',
          headline: 'China Tariff Retaliation Spooks Tech Stocks'
        }
      ],
      companyHeadlines: [
        'Analyst downgrades Google from Buy to Hold, cites valuation',
        'Google advertising growth slowing slightly'
      ]
    },
    expected: {
      attributionType: 'macro',
      primaryDriverMustInclude: ['market', 'tariff', 'tech'],
      primaryDriverMustNotInclude: ['downgrade', 'analyst'],
      narrativeMustInclude: ['line with', 'market'],
      sentimentRange: { min: 'bearish', max: 'neutral' },
      scoreRange: { min: -0.7, max: -0.3 },
      confidenceRange: { min: 0.5, max: 0.7 },
      reasoning: 'Stock moved with market (-2.0% vs -1.8%). Company news is weak (tier-2/3 sources, minor downgrade). Macro event explains broad decline.'
    }
  },

  // ========================================
  // EDGE CASES
  // ========================================

  {
    id: 'edge-01-no-catalyst',
    name: 'Small Move, No Clear Catalyst',
    description: 'Stock up 0.6%, market up 0.4%. No significant news. Should acknowledge no clear catalyst.',
    input: {
      symbol: 'MSFT',
      priceData: {
        currentPrice: 375.80,
        change: 2.25,
        changePercent: 0.60,
        volume: 18000000,
        previousClose: 373.55
      },
      benchmarkContext: {
        benchmark: 'QQQ',
        benchmarkReturn: 0.0042,  // +0.42%
        aligned: true
      },
      macroEvents: [],
      companyHeadlines: [
        'Microsoft cloud services see steady adoption',
        'Tech sector trades mixed in quiet session'
      ]
    },
    expected: {
      attributionType: 'no_clear_catalyst',
      primaryDriverMustInclude: ['no clear', 'catalyst'],
      narrativeMustInclude: ['without clear catalyst'],
      sentimentRange: { min: 'neutral', max: 'neutral' },
      scoreRange: { min: -0.2, max: 0.2 },
      confidenceRange: { min: 0.2, max: 0.4 },
      reasoning: 'Minimal move (<1%), aligned with market. No significant company or macro news. Should acknowledge lack of catalyst.'
    }
  },

  {
    id: 'edge-02-contradiction-up-negative-news',
    name: 'Stock Up Despite Negative News',
    description: 'Stock up 2.5% despite lawsuit news. Should acknowledge contradiction, use neutral sentiment.',
    input: {
      symbol: 'GOOGL',
      priceData: {
        currentPrice: 145.30,
        change: 3.55,
        changePercent: 2.50,
        volume: 45000000,
        previousClose: 141.75
      },
      benchmarkContext: {
        benchmark: 'QQQ',
        benchmarkReturn: 0.0015,  // +0.15%
        aligned: false
      },
      macroEvents: [],
      companyHeadlines: [
        'DOJ Files Major Antitrust Lawsuit Against Google',
        'Google faces regulatory headwinds in Europe',
        'Investors shrug off Google antitrust concerns'
      ]
    },
    expected: {
      attributionType: 'company',
      primaryDriverMustInclude: ['despite', 'lawsuit', 'antitrust'],
      narrativeMustInclude: ['despite', 'antitrust'],
      sentimentRange: { min: 'neutral', max: 'neutral' },
      scoreRange: { min: -0.1, max: 0.3 },
      confidenceRange: { min: 0.3, max: 0.6 },
      reasoning: 'Stock UP despite negative news = contradiction. Must use neutral sentiment. Acknowledge contradiction in narrative. Lower confidence.'
    }
  }
]

/**
 * Get eval test case by ID
 */
export function getEvalById(id: string): EvalTestCase | undefined {
  return macroAttributionEvals.find(e => e.id === id)
}

/**
 * Get all eval test cases by category
 */
export function getEvalsByCategory(category: 'macro' | 'company' | 'mixed' | 'edge'): EvalTestCase[] {
  return macroAttributionEvals.filter(e => e.id.startsWith(category))
}
