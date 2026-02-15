'use client'

import { useState } from 'react'
import Link from 'next/link'

type HoverState = 'none' | 'revenue' | 'netIncome'

export default function HeroSection() {
  const [hovered, setHovered] = useState<HoverState>('none')

  const getRevenueOpacity = () => (hovered === 'none' || hovered === 'revenue' ? 1 : 0.3)
  const getNetIncomeOpacity = () => (hovered === 'none' || hovered === 'netIncome' ? 1 : 0.3)

  return (
    <section className="bg-cream-100 dark:bg-[rgb(25,25,25)] py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-6">
        {/* Hero Content */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-gray-900 dark:text-white mb-6 leading-tight">
            Stop making investing decisions alone.
          </h1>
          <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
            Explore the next frontier of tools to kickstart
            <br className="hidden md:block" />
            your trading journey to success.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth?signup=true"
              className="w-full sm:w-auto bg-white dark:bg-[rgb(45,45,45)] border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-8 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-[rgb(55,55,55)] transition-colors font-medium"
            >
              Get Started
            </Link>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-3">Try for free.</p>
        </div>

        {/* Hero Dashboard Mockup - Charting Interface */}
        <div className="relative max-w-5xl mx-auto">
          {/* Green Frame Container */}
          <div className="bg-sage-500 rounded-3xl p-0 shadow-2xl overflow-hidden">
            {/* Dashboard Mockup */}
            <div className="bg-white dark:bg-[rgb(35,35,35)] rounded-2xl overflow-hidden shadow-inner">
              {/* Stock Tags - Simplified Header */}
              <div className="px-4 pt-[15px] pb-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                <div className="flex items-center justify-center gap-1.5 px-3 py-1 bg-sage-50 dark:bg-sage-900/30 border border-sage-200 dark:border-sage-700 rounded text-xs">
                  <span className="font-medium text-gray-900 dark:text-white">MSFT</span>
                  <span className="text-gray-500 dark:text-gray-400">Microsoft</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded text-xs cursor-pointer transition-opacity ${hovered === 'netIncome' ? 'opacity-30' : ''}`}
                  onMouseEnter={() => setHovered('revenue')}
                  onMouseLeave={() => setHovered('none')}
                >
                  <div className="w-3 h-3 bg-[#1e3a5f] dark:bg-[#6b8cce] rounded-sm"></div>
                  <span className="text-gray-600 dark:text-gray-400">Revenue</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded text-xs cursor-pointer transition-opacity ${hovered === 'revenue' ? 'opacity-30' : ''}`}
                  onMouseEnter={() => setHovered('netIncome')}
                  onMouseLeave={() => setHovered('none')}
                >
                  <div className="w-3 h-3 bg-[#5a6b4a] dark:bg-[#7ab08a] rounded-sm"></div>
                  <span className="text-gray-600 dark:text-gray-400">Net Income</span>
                </div>
              </div>

              {/* Chart Area */}
              <div className="p-4 pb-4">
                <div className="h-72 md:h-96 relative">
                  <svg className="w-full h-full" viewBox="0 0 820 230" preserveAspectRatio="xMidYMid meet">
                    {/* Y-axis labels */}
                    <text x="800" y="20" className="text-[10px] fill-gray-400" textAnchor="end">$300B</text>
                    <text x="800" y="70" className="text-[10px] fill-gray-400" textAnchor="end">$225B</text>
                    <text x="800" y="120" className="text-[10px] fill-gray-400" textAnchor="end">$150B</text>
                    <text x="800" y="170" className="text-[10px] fill-gray-400" textAnchor="end">$75B</text>
                    <text x="800" y="220" className="text-[10px] fill-gray-400" textAnchor="end">$0B</text>

                    {/* Grid lines */}
                    <line x1="40" y1="20" x2="770" y2="20" className="stroke-gray-100 dark:stroke-gray-700" strokeWidth="1" />
                    <line x1="40" y1="70" x2="770" y2="70" className="stroke-gray-100 dark:stroke-gray-700" strokeWidth="1" />
                    <line x1="40" y1="120" x2="770" y2="120" className="stroke-gray-100 dark:stroke-gray-700" strokeWidth="1" />
                    <line x1="40" y1="170" x2="770" y2="170" className="stroke-gray-100 dark:stroke-gray-700" strokeWidth="1" />
                    <line x1="40" y1="220" x2="770" y2="220" className="stroke-gray-200 dark:stroke-gray-600" strokeWidth="1" />

                    {/* Net Income bars (sage green) - first bar in each group */}
                    <g
                      style={{ opacity: getNetIncomeOpacity(), transition: 'opacity 0.2s' }}
                      onMouseEnter={() => setHovered('netIncome')}
                      onMouseLeave={() => setHovered('none')}
                      className="cursor-pointer"
                    >
                      <rect x="60" y="200" width="28" height="20" className="fill-[#5a6b4a] dark:fill-[#7ab08a]" rx="2" />
                      <rect x="148" y="185" width="28" height="35" className="fill-[#5a6b4a] dark:fill-[#7ab08a]" rx="2" />
                      <rect x="236" y="175" width="28" height="45" className="fill-[#5a6b4a] dark:fill-[#7ab08a]" rx="2" />
                      <rect x="324" y="160" width="28" height="60" className="fill-[#5a6b4a] dark:fill-[#7ab08a]" rx="2" />
                      <rect x="412" y="145" width="28" height="75" className="fill-[#5a6b4a] dark:fill-[#7ab08a]" rx="2" />
                      <rect x="500" y="145" width="28" height="75" className="fill-[#5a6b4a] dark:fill-[#7ab08a]" rx="2" />
                      <rect x="588" y="125" width="28" height="95" className="fill-[#5a6b4a] dark:fill-[#7ab08a]" rx="2" />
                      <rect x="676" y="105" width="28" height="115" className="fill-[#5a6b4a] dark:fill-[#7ab08a]" rx="2" />
                    </g>

                    {/* Revenue bars (dark blue) - second bar in each group */}
                    <g
                      style={{ opacity: getRevenueOpacity(), transition: 'opacity 0.2s' }}
                      onMouseEnter={() => setHovered('revenue')}
                      onMouseLeave={() => setHovered('none')}
                      className="cursor-pointer"
                    >
                      <rect x="92" y="145" width="28" height="75" className="fill-[#1e3a5f] dark:fill-[#6b8cce]" rx="2" />
                      <rect x="180" y="130" width="28" height="90" className="fill-[#1e3a5f] dark:fill-[#6b8cce]" rx="2" />
                      <rect x="268" y="115" width="28" height="105" className="fill-[#1e3a5f] dark:fill-[#6b8cce]" rx="2" />
                      <rect x="356" y="95" width="28" height="125" className="fill-[#1e3a5f] dark:fill-[#6b8cce]" rx="2" />
                      <rect x="444" y="70" width="28" height="150" className="fill-[#1e3a5f] dark:fill-[#6b8cce]" rx="2" />
                      <rect x="532" y="55" width="28" height="165" className="fill-[#1e3a5f] dark:fill-[#6b8cce]" rx="2" />
                      <rect x="620" y="40" width="28" height="180" className="fill-[#1e3a5f] dark:fill-[#6b8cce]" rx="2" />
                      <rect x="708" y="20" width="28" height="200" className="fill-[#1e3a5f] dark:fill-[#6b8cce]" rx="2" />
                    </g>

                    {/* Value labels on Net Income bars */}
                    <g style={{ opacity: getNetIncomeOpacity(), transition: 'opacity 0.2s' }}>
                      <text x="74" y="195" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$17B</text>
                      <text x="162" y="180" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$39B</text>
                      <text x="250" y="170" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$44B</text>
                      <text x="338" y="155" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$61B</text>
                      <text x="426" y="140" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$73B</text>
                      <text x="514" y="140" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$72B</text>
                      <text x="602" y="120" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$88B</text>
                      <text x="690" y="100" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$102B</text>
                    </g>

                    {/* Value labels on Revenue bars */}
                    <g style={{ opacity: getRevenueOpacity(), transition: 'opacity 0.2s' }}>
                      <text x="106" y="140" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$110B</text>
                      <text x="194" y="125" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$126B</text>
                      <text x="282" y="110" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$143B</text>
                      <text x="370" y="90" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$168B</text>
                      <text x="458" y="65" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$198B</text>
                      <text x="546" y="50" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$212B</text>
                      <text x="634" y="35" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$245B</text>
                      <text x="722" y="15" className="text-[8px] fill-gray-600 dark:fill-gray-400 font-medium" textAnchor="middle">$282B</text>
                    </g>

                    {/* X-axis labels */}
                    <text x="90" y="245" className="text-[10px] fill-gray-500" textAnchor="middle">2018</text>
                    <text x="178" y="245" className="text-[10px] fill-gray-500" textAnchor="middle">2019</text>
                    <text x="266" y="245" className="text-[10px] fill-gray-500" textAnchor="middle">2020</text>
                    <text x="354" y="245" className="text-[10px] fill-gray-500" textAnchor="middle">2021</text>
                    <text x="442" y="245" className="text-[10px] fill-gray-500" textAnchor="middle">2022</text>
                    <text x="530" y="245" className="text-[10px] fill-gray-500" textAnchor="middle">2023</text>
                    <text x="618" y="245" className="text-[10px] fill-gray-500" textAnchor="middle">2024</text>
                    <text x="706" y="245" className="text-[10px] fill-gray-500" textAnchor="middle">2025</text>
                  </svg>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
