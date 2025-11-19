/**
 * Golden Set of Test Cases for "Why It Moved" AI Summaries
 *
 * These are real historical events with known outcomes,
 * used to measure quality of AI summaries through evals.
 */
export const goldenSet = [
    {
        id: 'tsla_earnings_beat_2024',
        name: 'TSLA Q4 2023 Earnings Beat',
        ticker: 'TSLA',
        quote: {
            price: 248.50,
            change: 12.10,
            changePercent: 5.11,
            volume: 145000000,
            avgVolume: 110000000,
            dayLow: 238.45,
            dayHigh: 251.20,
            previousClose: 236.40
        },
        headlines: [
            {
                title: 'Tesla Q4 Earnings Beat Estimates with $1.19 EPS',
                source: 'Bloomberg',
                date: new Date('2024-01-25T21:15:00Z')
            },
            {
                title: 'Tesla Reports Record Q4 Revenue of $25.2B',
                source: 'Reuters',
                date: new Date('2024-01-25T21:20:00Z')
            },
            {
                title: 'Musk Raises 2024 Production Guidance on Strong Q4',
                source: 'WSJ',
                date: new Date('2024-01-25T21:30:00Z')
            }
        ],
        expected: {
            sentiment: 'bullish',
            scoreRange: [0.6, 0.9],
            confidenceRange: [0.7, 1.0],
            primaryDriverContains: 'earnings',
            narrativeMustInclude: ['TSLA', 'up', '5.11%', '$248.50']
        },
        description: 'Clear positive catalyst with multiple tier-1 sources'
    },
    {
        id: 'nvda_export_restrictions_2024',
        name: 'NVDA China Export Restrictions',
        ticker: 'NVDA',
        quote: {
            price: 475.20,
            change: -17.80,
            changePercent: -3.61,
            volume: 58000000,
            avgVolume: 45000000,
            dayLow: 472.10,
            dayHigh: 495.50,
            previousClose: 493.00
        },
        headlines: [
            {
                title: 'U.S. Tightens Export Controls on Advanced AI Chips to China',
                source: 'Reuters',
                date: new Date('2024-10-17T14:30:00Z')
            },
            {
                title: 'Nvidia Faces New Restrictions on China Sales',
                source: 'Bloomberg',
                date: new Date('2024-10-17T14:45:00Z')
            }
        ],
        expected: {
            sentiment: 'bearish',
            scoreRange: [-0.8, -0.4],
            confidenceRange: [0.6, 0.9],
            primaryDriverContains: 'export',
            narrativeMustInclude: ['NVDA', 'down', '3.61%']
        },
        description: 'Clear negative regulatory news with high-quality sources'
    },
    {
        id: 'aapl_minimal_movement',
        name: 'AAPL Minimal Movement, No Catalyst',
        ticker: 'AAPL',
        quote: {
            price: 175.43,
            change: 0.35,
            changePercent: 0.20,
            volume: 48000000,
            avgVolume: 52000000,
            dayLow: 174.80,
            dayHigh: 176.10,
            previousClose: 175.08
        },
        headlines: [
            {
                title: 'Apple Continues Store Expansion Plans',
                source: 'Motley Fool',
                date: new Date('2024-03-15T10:00:00Z')
            },
            {
                title: 'Analyst: Tech Sector Looks Stable',
                source: 'Seeking Alpha',
                date: new Date('2024-03-14T16:30:00Z')
            }
        ],
        expected: {
            sentiment: 'neutral',
            scoreRange: [-0.2, 0.2],
            confidenceRange: [0.2, 0.5],
            primaryDriverContains: 'no clear catalyst',
            narrativeMustInclude: ['AAPL', '0.20%']
        },
        description: 'Small movement with no clear catalyst, low-quality sources'
    },
    {
        id: 'amd_upgrade_bullish',
        name: 'AMD Analyst Upgrade',
        ticker: 'AMD',
        quote: {
            price: 148.90,
            change: 5.60,
            changePercent: 3.91,
            volume: 72000000,
            avgVolume: 55000000,
            dayLow: 144.20,
            dayHigh: 149.50,
            previousClose: 143.30
        },
        headlines: [
            {
                title: 'JP Morgan Upgrades AMD to Overweight, $170 Target',
                source: 'MarketWatch',
                date: new Date('2024-02-20T13:00:00Z')
            },
            {
                title: 'AMD Gains on AI Chip Optimism',
                source: "Barron's",
                date: new Date('2024-02-20T14:15:00Z')
            }
        ],
        expected: {
            sentiment: 'bullish',
            scoreRange: [0.5, 0.8],
            confidenceRange: [0.5, 0.75],
            primaryDriverContains: 'upgrade',
            narrativeMustInclude: ['AMD', 'up', '3.91%']
        },
        description: 'Positive analyst action with decent sources'
    },
    {
        id: 'googl_mixed_signals',
        name: 'GOOGL Mixed Signals - Up Despite Negative News',
        ticker: 'GOOGL',
        quote: {
            price: 142.80,
            change: 3.50,
            changePercent: 2.51,
            volume: 28000000,
            avgVolume: 26000000,
            dayLow: 140.10,
            dayHigh: 143.20,
            previousClose: 139.30
        },
        headlines: [
            {
                title: 'Google Faces Antitrust Lawsuit Over Ad Business',
                source: 'Bloomberg',
                date: new Date('2024-09-12T15:00:00Z')
            },
            {
                title: 'Tech Sector Rallies on Interest Rate Optimism',
                source: 'CNBC',
                date: new Date('2024-09-12T15:30:00Z')
            }
        ],
        expected: {
            sentiment: 'neutral',
            scoreRange: [-0.1, 0.3],
            confidenceRange: [0.3, 0.6],
            narrativeMustInclude: ['GOOGL', 'up', '2.51%']
        },
        description: 'Contradictory signals: negative specific news, positive sector trend'
    },
    {
        id: 'amzn_product_launch',
        name: 'AMZN New Product Launch',
        ticker: 'AMZN',
        quote: {
            price: 178.25,
            change: 4.15,
            changePercent: 2.38,
            volume: 62000000,
            avgVolume: 58000000,
            dayLow: 175.30,
            dayHigh: 179.10,
            previousClose: 174.10
        },
        headlines: [
            {
                title: 'Amazon Unveils New AI-Powered Echo Devices',
                source: 'WSJ',
                date: new Date('2024-09-20T17:00:00Z')
            },
            {
                title: 'Amazon Echo Update Includes Advanced AI Features',
                source: 'Reuters',
                date: new Date('2024-09-20T17:15:00Z')
            }
        ],
        expected: {
            sentiment: 'bullish',
            scoreRange: [0.4, 0.7],
            confidenceRange: [0.6, 0.85],
            primaryDriverContains: 'AI',
            narrativeMustInclude: ['AMZN', 'up', '2.38%']
        },
        description: 'Product launch with tier-1 coverage'
    },
    {
        id: 'avgo_sector_decline',
        name: 'AVGO Sector-Wide Decline',
        ticker: 'AVGO',
        quote: {
            price: 1285.50,
            change: -38.20,
            changePercent: -2.89,
            volume: 2800000,
            avgVolume: 2500000,
            dayLow: 1280.30,
            dayHigh: 1328.70,
            previousClose: 1323.70
        },
        headlines: [
            {
                title: 'Semiconductor Stocks Slide on Demand Concerns',
                source: 'Bloomberg',
                date: new Date('2024-08-08T18:00:00Z')
            },
            {
                title: 'Chip Stocks Fall as Industry Outlook Dims',
                source: 'CNBC',
                date: new Date('2024-08-08T18:15:00Z')
            }
        ],
        expected: {
            sentiment: 'bearish',
            scoreRange: [-0.6, -0.3],
            confidenceRange: [0.4, 0.7],
            primaryDriverContains: 'semiconductor',
            narrativeMustInclude: ['AVGO', 'down', '2.89%']
        },
        description: 'Sector-wide move, no company-specific catalyst'
    }
];
/**
 * Get test case by ID
 */
export function getTestCase(id) {
    return goldenSet.find(tc => tc.id === id);
}
/**
 * Get test cases by ticker
 */
export function getTestCasesByTicker(ticker) {
    return goldenSet.filter(tc => tc.ticker === ticker);
}
