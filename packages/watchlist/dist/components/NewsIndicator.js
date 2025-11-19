'use client';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { EarningsBadge } from './NewsIndicator/EarningsBadge';
import { EarningsContextCard } from './NewsIndicator/EarningsContextCard';
import { ImpactMeter } from './NewsIndicator/ImpactMeter';
import { useAiSummaryCache } from '@watchlist/contexts/AiSummaryContext';
export default function NewsIndicator({ news, newsCount = 0, onNewsClick, prefetchArticles, symbol = '', allArticles = [], fetchFMPArticles, fmpNewsCount = 0 }) {
    const summaryCache = useAiSummaryCache();
    const [showTooltip, setShowTooltip] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('rss');
    const [fmpArticles, setFmpArticles] = useState([]);
    const [aiSummary, setAiSummary] = useState('');
    const [aiSummaryData, setAiSummaryData] = useState(null);
    const [aiSummarySources, setAiSummarySources] = useState([]);
    const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
    const [thinkingSteps, setThinkingSteps] = useState([]);
    const [showAiSummary, setShowAiSummary] = useState(false);
    const [showSources, setShowSources] = useState(false);
    const [analystChanges, setAnalystChanges] = useState([]);
    const [analystLoading, setAnalystLoading] = useState(false);
    const [earningsContext, setEarningsContext] = useState(null);
    const dropdownRef = useRef(null);
    const indicatorRef = useRef(null);
    const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const dropdownColors = isDarkMode
        ? {
            containerBg: 'rgb(var(--watchlist-surface))',
            border: '1px solid rgb(var(--watchlist-border))',
            headerBg: 'rgb(var(--watchlist-surface-elevated))',
            headerBorder: '1px solid rgba(148, 163, 184, 0.2)',
            headerText: '#e5e7eb',
            closeDefault: '#9ca3af',
            closeHover: '#f9fafb',
            titleColor: '#e5e7eb',
            tabActive: '#60a5fa',
            tabInactive: '#cbd5f5',
            tabBorderActive: '#60a5fa'
        }
        : {
            containerBg: 'rgb(var(--watchlist-surface))',
            border: '1px solid rgb(var(--watchlist-border))',
            headerBg: '#f8f9fa',
            headerBorder: '1px solid #e0e0e0',
            headerText: '#333',
            closeDefault: '#666',
            closeHover: '#000',
            titleColor: '#333',
            tabActive: '#1a73e8',
            tabInactive: '#666',
            tabBorderActive: '#1a73e8'
        };
    const summaryColors = isDarkMode
        ? {
            heading: '#e5e7eb',
            sentimentPositive: '#4ade80',
            sentimentNegative: '#f87171',
            sentimentNeutral: '#cbd5f5',
            sentimentPositiveBg: 'rgba(34, 197, 94, 0.2)',
            sentimentNegativeBg: 'rgba(239, 68, 68, 0.2)',
            sentimentNeutralBg: 'rgba(148, 163, 184, 0.25)',
            confidenceText: '#93c5fd',
            confidenceBg: 'rgba(59, 130, 246, 0.25)',
            scoreText: '#c4b5fd',
            scoreBg: 'rgba(168, 85, 247, 0.25)',
            driverBg: 'rgba(30, 41, 59, 0.85)',
            driverText: '#e5e7eb',
            driverLabel: '#94a3b8',
            narrativeText: '#d1d5db',
            mutedText: '#9ca3af'
        }
        : {
            heading: '#333',
            sentimentPositive: '#15803d',
            sentimentNegative: '#b91c1c',
            sentimentNeutral: '#6b7280',
            sentimentPositiveBg: 'rgba(34, 197, 94, 0.15)',
            sentimentNegativeBg: 'rgba(239, 68, 68, 0.15)',
            sentimentNeutralBg: 'rgba(156, 163, 175, 0.15)',
            confidenceText: '#1e40af',
            confidenceBg: 'rgba(59, 130, 246, 0.15)',
            scoreText: '#7e22ce',
            scoreBg: 'rgba(168, 85, 247, 0.15)',
            driverBg: 'rgba(249, 250, 251, 0.8)',
            driverText: '#555',
            driverLabel: '#888',
            narrativeText: '#555',
            mutedText: '#888'
        };
    // Component mount check
    useEffect(() => {
        // Component mounted
    }, [symbol, newsCount, news, allArticles.length]);
    // Close dropdown when clicking outside or pressing Escape
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current &&
                !dropdownRef.current.contains(event.target) &&
                indicatorRef.current &&
                !indicatorRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        };
        const handleEscapeKey = (event) => {
            if (event.key === 'Escape') {
                setShowDropdown(false);
            }
        };
        if (showDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscapeKey);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
                document.removeEventListener('keydown', handleEscapeKey);
            };
        }
    }, [showDropdown]);
    // Early return after all hooks - commented for debugging
    // if (!news && newsCount === 0 && allArticles.length === 0) {
    //   return null
    // }
    // Always show the indicator for now to debug
    const hasData = news || newsCount > 0 || allArticles.length > 0;
    // Use consistent gray color for all news icons
    const getIndicatorColor = () => {
        return '#666'; // Gray for all sources
    };
    // Format time ago
    const formatTimeAgo = (date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0)
            return `${days}d ago`;
        if (hours > 0)
            return `${hours}h ago`;
        if (minutes > 0)
            return `${minutes}m ago`;
        return 'just now';
    };
    const handleClick = (e) => __awaiter(this, void 0, void 0, function* () {
        e.stopPropagation();
        if (!showDropdown) {
            // Show dropdown immediately
            setShowDropdown(true);
            // Check if we need to fetch articles
            const needsRSSFetch = allArticles.length === 0 && onNewsClick;
            const needsFMPFetch = fmpArticles.length === 0 && fetchFMPArticles && symbol;
            const needsAISummary = symbol && !aiSummary; // Auto-fetch AI summary for all symbols
            if (needsRSSFetch || needsFMPFetch || needsAISummary) {
                setLoading(true);
                // PHASE 1 OPTIMIZATION: Fire all requests in parallel
                const startTime = performance.now();
                const fetchPromises = [];
                // Fetch RSS articles in parallel
                if (needsRSSFetch) {
                    fetchPromises.push(Promise.resolve(onNewsClick()).catch(error => {
                        console.error('Failed to fetch RSS articles:', error);
                    }));
                }
                // Fetch FMP articles in parallel
                if (needsFMPFetch) {
                    fetchPromises.push(fetchFMPArticles(symbol)
                        .then(articles => {
                        setFmpArticles(articles || []);
                    })
                        .catch(error => {
                        console.error('Failed to fetch FMP articles:', error);
                    }));
                }
                // Fire AI summary immediately (doesn't block on RSS/FMP)
                if (needsAISummary) {
                    generateAISummary(); // Fire and forget - updates state when complete
                }
                // Wait for RSS/FMP to complete, but AI summary continues in background
                yield Promise.all(fetchPromises);
                const endTime = performance.now();
                setLoading(false);
            }
        }
        else {
            setShowDropdown(false);
        }
        setShowTooltip(false);
    });
    const handleMouseEnter = () => {
        if (!showDropdown) {
            setShowTooltip(true);
            prefetchArticles === null || prefetchArticles === void 0 ? void 0 : prefetchArticles();
        }
    };
    const handleMouseLeave = () => {
        setShowTooltip(false);
    };
    const getSummaryArticles = () => (fmpArticles.length > 0 ? fmpArticles : allArticles);
    const buildHeadlinesHash = (articles) => {
        if (!articles || articles.length === 0) {
            return `no-articles-${symbol || 'unknown'}`;
        }
        return articles
            .slice(0, 5)
            .map(article => {
            const headline = article.headline || article.title || article.summary || '';
            const published = typeof article.publishedAt === 'string'
                ? article.publishedAt
                : article.publishedAt instanceof Date
                    ? article.publishedAt.toISOString()
                    : '';
            return `${headline.trim()}::${published}`;
        })
            .join('|')
            .substring(0, 200);
    };
    const generateAISummary = () => __awaiter(this, void 0, void 0, function* () {
        if (!symbol)
            return;
        const t0 = performance.now();
        // Generate a simple headlines hash for cache key
        const summaryArticles = getSummaryArticles();
        const headlinesHash = buildHeadlinesHash(summaryArticles);
        // PHASE 2: Check cache first
        const cached = summaryCache.getCache(symbol, headlinesHash);
        if (cached) {
            const t1 = performance.now();
            setAiSummary(cached.summary);
            setAiSummaryData(cached.data);
            setAiSummarySources(cached.sources);
            setEarningsContext(cached.earningsContext);
            setShowAiSummary(true);
            return;
        }
        setAiSummaryLoading(true);
        setShowAiSummary(true);
        setAiSummary(''); // Clear previous summary
        setThinkingSteps([]); // Reset thinking steps
        // Simulate chain-of-thought with progressive steps
        const addThinkingStep = (step) => {
            setThinkingSteps(prev => [...prev, step]);
        };
        try {
            // Step 1: Fetching data
            addThinkingStep(`📰 Fetching latest news and market data for ${symbol}...`);
            const fetchStart = performance.now();
            // Step 2: Processing data (show after a brief delay to feel natural)
            setTimeout(() => addThinkingStep(`📊 Analyzing ${symbol} headlines and price movement...`), 300);
            // Step 3: AI thinking (show during request)
            setTimeout(() => addThinkingStep(`🤖 Identifying key drivers for ${symbol} and market sentiment...`), 600);
            const response = yield fetch('/api/news/ai-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol })
            });
            const fetchEnd = performance.now();
            if (!response.ok) {
                throw new Error('Failed to generate summary');
            }
            const parseStart = performance.now();
            const data = yield response.json();
            const parseEnd = performance.now();
            // Step 4: Finalizing
            addThinkingStep(`✨ Generating ${symbol} summary...`);
            // Small delay to show all steps before displaying result
            yield new Promise(resolve => setTimeout(resolve, 500));
            setAiSummary(data.summary);
            setAiSummaryData(data.data || null); // Store structured data
            setAiSummarySources(data.sources || []);
            setEarningsContext(data.earningsContext || null); // Store earnings context
            setThinkingSteps([]); // Clear thinking steps when done
            // PHASE 2: Store in cache
            summaryCache.setCache(symbol, headlinesHash, {
                summary: data.summary,
                data: data.data || null,
                sources: data.sources || [],
                earningsContext: data.earningsContext || null
            });
            const totalTime = performance.now() - t0;
        }
        catch (error) {
            console.error('Failed to generate AI summary:', error);
            setAiSummary('Failed to generate AI summary. Please try again later.');
            setAiSummarySources([]);
            setThinkingSteps([]);
        }
        finally {
            setAiSummaryLoading(false);
        }
    });
    const fetchAnalystRatings = () => __awaiter(this, void 0, void 0, function* () {
        if (!symbol || analystLoading)
            return;
        setAnalystLoading(true);
        try {
            const response = yield fetch(`/api/analyst/details?symbol=${symbol}`);
            if (!response.ok) {
                throw new Error('Failed to fetch analyst ratings');
            }
            const data = yield response.json();
            // Filter to only show changes from the last 14 days
            const fourteenDaysAgo = new Date();
            fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
            const recentChanges = (data.changes || []).filter((change) => {
                const changeDate = new Date(change.publishedDate);
                return changeDate >= fourteenDaysAgo;
            });
            setAnalystChanges(recentChanges);
        }
        catch (error) {
            console.error('Failed to fetch analyst ratings:', error);
            setAnalystChanges([]);
        }
        finally {
            setAnalystLoading(false);
        }
    });
    return (_jsxs("div", { ref: indicatorRef, style: {
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
        }, onMouseEnter: handleMouseEnter, onMouseLeave: handleMouseLeave, children: [_jsxs("div", { onClick: handleClick, style: {
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: news ? getIndicatorColor() + '15' : 'rgb(var(--watchlist-surface))',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    zIndex: 1,
                    userSelect: 'none'
                }, onMouseDown: (e) => {
                    e.preventDefault();
                }, children: [_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: news ? getIndicatorColor() : '#666', strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" }), _jsx("path", { d: "M22 6l-10 5L2 6" }), _jsx("line", { x1: "6", y1: "14", x2: "18", y2: "14" }), _jsx("line", { x1: "6", y1: "18", x2: "12", y2: "18" })] }), (newsCount > 0 || allArticles.length > 0 || fmpNewsCount > 0) && (_jsx("span", { style: {
                            fontSize: '11px',
                            fontWeight: '600',
                            color: news ? getIndicatorColor() : '#666',
                            minWidth: '14px',
                            textAlign: 'center'
                        }, children: (() => {
                            const rssCount = newsCount || allArticles.length;
                            const totalCount = rssCount + fmpNewsCount;
                            return totalCount > 9 ? '9+' : totalCount;
                        })() }))] }), showDropdown && typeof window !== 'undefined' && createPortal((() => {
                var _a;
                const rect = (_a = indicatorRef.current) === null || _a === void 0 ? void 0 : _a.getBoundingClientRect();
                if (!rect)
                    return null;
                // Larger dropdown size for better readability
                const dropdownWidth = 900;
                const maxDropdownHeight = 700; // Fixed height to show more articles
                const padding = 8; // Distance from icon
                const screenPadding = 20; // Minimum distance from screen edges
                // Get icon center position
                const iconCenterX = rect.left + rect.width / 2;
                const iconCenterY = rect.top + rect.height / 2;
                // Check available space to the right and left
                const spaceRight = window.innerWidth - rect.right - screenPadding;
                const spaceLeft = rect.left - screenPadding;
                // Determine if we should show to the left or right
                const showLeft = spaceRight < dropdownWidth && spaceLeft > spaceRight;
                // Calculate horizontal position
                let leftPos;
                if (showLeft) {
                    // Position to the left of icon
                    leftPos = rect.left - dropdownWidth - padding;
                }
                else {
                    // Position to the right of icon
                    leftPos = rect.right + padding;
                }
                // Calculate vertical position - align top of dropdown with top of icon
                const dropdownHeight = Math.min(maxDropdownHeight, window.innerHeight - 2 * screenPadding);
                let topPos = rect.top;
                // Ensure dropdown doesn't go off screen vertically
                if (topPos < screenPadding) {
                    topPos = screenPadding;
                }
                else if (topPos + dropdownHeight > window.innerHeight - screenPadding) {
                    topPos = window.innerHeight - dropdownHeight - screenPadding;
                }
                return (_jsxs(_Fragment, { children: [_jsx("div", { style: Object.assign(Object.assign({ position: 'fixed', top: Math.max(topPos + 20, Math.min(iconCenterY - 8, topPos + dropdownHeight - 20)), left: showLeft ? leftPos + dropdownWidth - 8 : leftPos - 8, width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent' }, (showLeft ? {
                                borderLeft: `8px solid ${dropdownColors.containerBg}`,
                                borderRight: 'none',
                            } : {
                                borderRight: `8px solid ${dropdownColors.containerBg}`,
                                borderLeft: 'none',
                            })), { zIndex: 10002 }) }), _jsxs("div", { ref: dropdownRef, style: {
                                position: 'fixed',
                                top: topPos,
                                left: leftPos,
                                zIndex: 10001,
                                backgroundColor: dropdownColors.containerBg,
                                borderRadius: '8px',
                                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                                width: `${dropdownWidth}px`,
                                height: `${dropdownHeight}px`,
                                maxHeight: `${dropdownHeight}px`,
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                border: dropdownColors.border
                            }, children: [_jsx("div", { style: {
                                        borderBottom: dropdownColors.headerBorder,
                                        backgroundColor: dropdownColors.headerBg,
                                        flexShrink: 0
                                    }, children: _jsxs("div", { style: {
                                            display: 'flex',
                                            padding: '12px 16px 0 16px',
                                            gap: '16px',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }, children: [_jsxs("div", { style: {
                                                    display: 'flex',
                                                    gap: '16px'
                                                }, children: [_jsxs("button", { onClick: (e) => {
                                                            e.stopPropagation();
                                                            setActiveTab('rss');
                                                        }, style: {
                                                            background: 'transparent',
                                                            border: 'none',
                                                            padding: '14px 12px',
                                                            fontSize: '16px',
                                                            fontWeight: activeTab === 'rss' ? '600' : '400',
                                                            color: activeTab === 'rss' ? dropdownColors.tabActive : dropdownColors.tabInactive,
                                                            borderBottom: activeTab === 'rss'
                                                                ? `2px solid ${dropdownColors.tabBorderActive}`
                                                                : '2px solid transparent',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s'
                                                        }, children: ["RSS (", allArticles.filter(a => { var _a; return !((_a = a.source) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('yahoo')); }).length, ")"] }), _jsxs("button", { onClick: (e) => {
                                                            e.stopPropagation();
                                                            setActiveTab('fmp');
                                                        }, style: {
                                                            background: 'transparent',
                                                            border: 'none',
                                                            padding: '14px 12px',
                                                            fontSize: '16px',
                                                            fontWeight: activeTab === 'fmp' ? '600' : '400',
                                                            color: activeTab === 'fmp' ? dropdownColors.tabActive : dropdownColors.tabInactive,
                                                            borderBottom: activeTab === 'fmp'
                                                                ? `2px solid ${dropdownColors.tabBorderActive}`
                                                                : '2px solid transparent',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s'
                                                        }, children: ["FMP (", fmpArticles.length || fmpNewsCount, ")"] }), _jsx("button", { onClick: (e) => {
                                                            e.stopPropagation();
                                                            setActiveTab('analyst');
                                                            if (analystChanges.length === 0 && !analystLoading) {
                                                                fetchAnalystRatings();
                                                            }
                                                        }, style: {
                                                            background: 'transparent',
                                                            border: 'none',
                                                            padding: '14px 12px',
                                                            fontSize: '16px',
                                                            fontWeight: activeTab === 'analyst' ? '600' : '400',
                                                            color: activeTab === 'analyst' ? dropdownColors.tabActive : dropdownColors.tabInactive,
                                                            borderBottom: activeTab === 'analyst'
                                                                ? `2px solid ${dropdownColors.tabBorderActive}`
                                                                : '2px solid transparent',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s'
                                                        }, children: "Analyst" })] }), _jsx("button", { onClick: (e) => {
                                                    e.stopPropagation();
                                                    setShowDropdown(false);
                                                }, style: {
                                                    background: 'transparent',
                                                    border: 'none',
                                                    fontSize: '24px',
                                                    cursor: 'pointer',
                                                    color: dropdownColors.closeDefault,
                                                    padding: '0 4px',
                                                    lineHeight: 1
                                                }, onMouseEnter: (e) => {
                                                    e.currentTarget.style.color = dropdownColors.closeHover;
                                                }, onMouseLeave: (e) => {
                                                    e.currentTarget.style.color = dropdownColors.closeDefault;
                                                }, children: "\u00D7" })] }) }), _jsxs("div", { style: {
                                        flex: 1,
                                        overflowY: 'auto',
                                        overflowX: 'hidden'
                                    }, children: [symbol && (_jsx("div", { style: {
                                                padding: '16px 20px',
                                                background: isDarkMode
                                                    ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(124, 58, 237, 0.12) 100%)'
                                                    : 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)',
                                                borderBottom: isDarkMode ? '1px solid rgba(148, 163, 184, 0.2)' : '1px solid #e0e0e0',
                                                maxWidth: '100%',
                                                boxSizing: 'border-box',
                                                minHeight: '280px' // Fixed minimum height to prevent layout shift
                                            }, children: _jsxs("div", { style: {
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: '10px',
                                                    width: '100%'
                                                }, children: [_jsx("span", { style: {
                                                            fontSize: '20px',
                                                            flexShrink: 0,
                                                            opacity: aiSummaryLoading ? 0.6 : 1,
                                                            transition: 'opacity 0.3s ease'
                                                        }, children: "\uD83E\uDD16" }), _jsx("div", { style: {
                                                            flex: '1 1 auto',
                                                            minWidth: 0, // Critical for text wrapping in flex containers
                                                            maxWidth: 'calc(100% - 40px)' // Account for emoji and gap
                                                        }, children: aiSummaryLoading ? (
                                                        // Chain-of-thought: Show thinking steps
                                                        _jsxs(_Fragment, { children: [_jsx("div", { style: {
                                                                        fontSize: '16px',
                                                                        fontWeight: '600',
                                                                        color: summaryColors.heading,
                                                                        marginBottom: '16px'
                                                                    }, children: "Generating Summary..." }), _jsx("div", { style: {
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        gap: '12px'
                                                                    }, children: thinkingSteps.map((step, index) => (_jsxs("div", { style: {
                                                                            display: 'flex',
                                                                            alignItems: 'flex-start',
                                                                            gap: '10px',
                                                                            padding: '10px',
                                                                            backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)',
                                                                            borderRadius: '6px',
                                                                            borderLeft: '3px solid #3b82f6',
                                                                            animation: `fadeIn 0.3s ease-in ${index * 0.1}s both`
                                                                        }, children: [_jsx("div", { style: {
                                                                                    width: '20px',
                                                                                    height: '20px',
                                                                                    borderRadius: '50%',
                                                                                    backgroundColor: '#3b82f6',
                                                                                    flexShrink: 0,
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'center',
                                                                                    color: 'white',
                                                                                    fontSize: '11px',
                                                                                    fontWeight: '600'
                                                                                }, children: index + 1 }), _jsx("div", { style: {
                                                                                    flex: 1,
                                                                                    fontSize: '14px',
                                                                                    color: summaryColors.narrativeText,
                                                                                    lineHeight: '1.4'
                                                                                }, children: step }), index === thinkingSteps.length - 1 && (_jsx("div", { style: {
                                                                                    width: '16px',
                                                                                    height: '16px',
                                                                                    borderRadius: '50%',
                                                                                    border: '2px solid #3b82f6',
                                                                                    borderTopColor: 'transparent',
                                                                                    animation: 'spin 0.8s linear infinite',
                                                                                    flexShrink: 0
                                                                                } }))] }, index))) }), _jsx("style", { children: `
                          @keyframes fadeIn {
                            0% {
                              opacity: 0;
                              transform: translateY(10px);
                            }
                            100% {
                              opacity: 1;
                              transform: translateY(0);
                            }
                          }
                          @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                          }
                        ` })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { style: {
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '8px',
                                                                        marginBottom: '8px',
                                                                        flexWrap: 'wrap'
                                                                    }, children: aiSummaryData && (_jsxs(_Fragment, { children: [_jsxs("span", { style: {
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '4px',
                                                                                    padding: '3px 8px',
                                                                                    borderRadius: '4px',
                                                                                    fontSize: '11px',
                                                                                    fontWeight: '600',
                                                                                    backgroundColor: aiSummaryData.sentiment === 'bullish' ? summaryColors.sentimentPositiveBg :
                                                                                        aiSummaryData.sentiment === 'bearish' ? summaryColors.sentimentNegativeBg :
                                                                                            summaryColors.sentimentNeutralBg,
                                                                                    color: aiSummaryData.sentiment === 'bullish' ? summaryColors.sentimentPositive :
                                                                                        aiSummaryData.sentiment === 'bearish' ? summaryColors.sentimentNegative :
                                                                                            summaryColors.sentimentNeutral
                                                                                }, children: [_jsx("span", { style: { fontSize: '10px' }, children: aiSummaryData.sentiment === 'bullish' ? '🟢' :
                                                                                            aiSummaryData.sentiment === 'bearish' ? '🔴' : '⚪' }), aiSummaryData.sentiment.charAt(0).toUpperCase() + aiSummaryData.sentiment.slice(1)] }), _jsxs("span", { style: {
                                                                                    padding: '3px 8px',
                                                                                    borderRadius: '4px',
                                                                                    fontSize: '11px',
                                                                                    fontWeight: '600',
                                                                                    backgroundColor: summaryColors.confidenceBg,
                                                                                    color: summaryColors.confidenceText
                                                                                }, children: [(aiSummaryData.confidence * 100).toFixed(0), "% confident"] }), aiSummaryData.sentiment !== 'neutral' && (_jsxs("span", { style: {
                                                                                    padding: '3px 8px',
                                                                                    borderRadius: '4px',
                                                                                    fontSize: '11px',
                                                                                    fontWeight: '600',
                                                                                    backgroundColor: summaryColors.scoreBg,
                                                                                    color: summaryColors.scoreText
                                                                                }, children: ["Score: ", aiSummaryData.score >= 0 ? '+' : '', aiSummaryData.score.toFixed(2)] }))] })) }), aiSummaryData && aiSummaryData.primaryDriver && (_jsxs("div", { style: {
                                                                        margin: '0 0 8px 0',
                                                                        padding: '6px 10px',
                                                                        backgroundColor: summaryColors.driverBg,
                                                                        borderLeft: '3px solid #667eea',
                                                                        borderRadius: '4px',
                                                                        fontSize: '12px',
                                                                        color: summaryColors.driverText,
                                                                        fontWeight: '500'
                                                                    }, children: [_jsx("span", { style: { color: summaryColors.driverLabel, fontWeight: '400' }, children: "Key Driver:" }), " ", aiSummaryData.primaryDriver] })), _jsx("div", { style: {
                                                                        margin: 0,
                                                                        fontSize: '18px',
                                                                        color: summaryColors.narrativeText,
                                                                        lineHeight: '1.6',
                                                                        wordBreak: 'break-word',
                                                                        overflowWrap: 'break-word',
                                                                        whiteSpace: 'pre-wrap',
                                                                        maxWidth: '100%'
                                                                    }, children: aiSummary || 'Fetching market summary...' }), aiSummarySources.length > 0 && (_jsxs("div", { style: {
                                                                        marginTop: '12px',
                                                                        paddingTop: '12px',
                                                                        borderTop: isDarkMode ? '1px solid rgba(148, 163, 184, 0.2)' : '1px solid rgba(0, 0, 0, 0.08)'
                                                                    }, children: [_jsxs("button", { onClick: (e) => {
                                                                                e.stopPropagation();
                                                                                setShowSources(!showSources);
                                                                            }, style: {
                                                                                width: '100%',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'space-between',
                                                                                background: 'transparent',
                                                                                border: 'none',
                                                                                padding: '4px 0',
                                                                                cursor: 'pointer',
                                                                                fontSize: '12px',
                                                                                fontWeight: '600',
                                                                                color: isDarkMode ? '#94a3b8' : '#666',
                                                                                transition: 'color 0.2s'
                                                                            }, onMouseEnter: (e) => {
                                                                                e.currentTarget.style.color = isDarkMode ? '#cbd5e1' : '#333';
                                                                            }, onMouseLeave: (e) => {
                                                                                e.currentTarget.style.color = isDarkMode ? '#94a3b8' : '#666';
                                                                            }, children: [_jsxs("span", { children: ["Sources (", aiSummarySources.filter(src => { var _a; return !((_a = src.source) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('yahoo')); }).length, ")"] }), _jsx("span", { style: {
                                                                                        fontSize: '14px',
                                                                                        transition: 'transform 0.2s',
                                                                                        transform: showSources ? 'rotate(180deg)' : 'rotate(0deg)'
                                                                                    }, children: "\u25BC" })] }), showSources && (_jsx("div", { style: {
                                                                                display: 'flex',
                                                                                flexDirection: 'column',
                                                                                gap: '6px',
                                                                                marginTop: '8px'
                                                                            }, children: aiSummarySources
                                                                                .filter(src => { var _a; return !((_a = src.source) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('yahoo')); })
                                                                                .map((src, idx) => (_jsxs("a", { href: src.link, target: "_blank", rel: "noopener noreferrer", style: {
                                                                                    fontSize: '12px',
                                                                                    color: '#0066cc',
                                                                                    textDecoration: 'none',
                                                                                    display: 'flex',
                                                                                    alignItems: 'baseline',
                                                                                    gap: '6px',
                                                                                    wordBreak: 'break-word',
                                                                                    lineHeight: '1.4',
                                                                                    transition: 'all 0.2s'
                                                                                }, onMouseEnter: (e) => {
                                                                                    e.currentTarget.style.textDecoration = 'underline';
                                                                                    e.currentTarget.style.color = '#0052a3';
                                                                                }, onMouseLeave: (e) => {
                                                                                    e.currentTarget.style.textDecoration = 'none';
                                                                                    e.currentTarget.style.color = '#0066cc';
                                                                                }, children: [_jsxs("span", { style: {
                                                                                            flexShrink: 0,
                                                                                            fontWeight: '600',
                                                                                            color: '#888'
                                                                                        }, children: [idx + 1, "."] }), _jsx("span", { style: {
                                                                                            flexShrink: 0,
                                                                                            fontWeight: '600',
                                                                                            padding: '2px 6px',
                                                                                            backgroundColor: 'rgba(0, 102, 204, 0.1)',
                                                                                            borderRadius: '3px',
                                                                                            fontSize: '10px'
                                                                                        }, children: src.source }), _jsx("span", { style: {
                                                                                            flex: 1,
                                                                                            overflow: 'hidden',
                                                                                            textOverflow: 'ellipsis',
                                                                                            display: '-webkit-box',
                                                                                            WebkitLineClamp: 2,
                                                                                            WebkitBoxOrient: 'vertical'
                                                                                        }, children: src.title }), _jsx("span", { style: {
                                                                                            flexShrink: 0,
                                                                                            fontSize: '10px',
                                                                                            color: '#999'
                                                                                        }, children: src.time })] }, idx))) }))] }))] })) })] }) })), earningsContext && earningsContext.status !== 'none' && (_jsxs("div", { style: {
                                                padding: '16px 20px',
                                                borderBottom: isDarkMode ? '1px solid rgba(148, 163, 184, 0.2)' : '1px solid #e0e0e0',
                                                backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : 'rgba(249, 250, 251, 0.8)'
                                            }, children: [_jsx("div", { style: { marginBottom: '12px' }, children: _jsx(EarningsBadge, { earningsContext: earningsContext, compact: false }) }), earningsContext.impactConfidence >= 30 && (_jsx("div", { style: { marginBottom: '12px' }, children: _jsx(ImpactMeter, { confidence: earningsContext.impactConfidence, breakdown: earningsContext.confidenceBreakdown, showBreakdown: true }) })), _jsx(EarningsContextCard, { context: earningsContext, expanded: false })] })), _jsx("div", { style: { padding: '12px' }, children: loading ? (_jsxs("div", { style: {
                                                    padding: '40px',
                                                    textAlign: 'center',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '12px'
                                                }, children: [_jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", style: {
                                                            animation: 'newsSpinner 0.8s linear infinite'
                                                        }, children: [_jsx("style", { children: `
                      @keyframes newsSpinner {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                      }
                    ` }), _jsx("circle", { cx: "12", cy: "12", r: "10", stroke: "#f0f0f0", strokeWidth: "3", fill: "none" }), _jsx("path", { d: "M 12 2 A 10 10 0 0 1 22 12", stroke: "#1a73e8", strokeWidth: "3", fill: "none", strokeLinecap: "round" })] }), _jsx("div", { style: {
                                                            color: '#666',
                                                            fontSize: '13px',
                                                            fontWeight: '500'
                                                        }, children: "Loading articles..." })] })) : (_jsxs(_Fragment, { children: [activeTab === 'rss' && (allArticles.length > 0 ? (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: '10px' }, children: allArticles
                                                            .filter(article => { var _a; return !((_a = article.source) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('yahoo')); })
                                                            .map((article, idx) => {
                                                            var _a, _b, _c;
                                                            return (_jsxs("div", { style: {
                                                                    padding: '16px',
                                                                    border: '1px solid rgb(var(--watchlist-border))',
                                                                    borderRadius: '6px',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s',
                                                                    backgroundColor: 'rgb(var(--watchlist-surface))'
                                                                }, onMouseEnter: (e) => {
                                                                    e.currentTarget.style.backgroundColor = 'rgb(var(--watchlist-button-hover))';
                                                                    e.currentTarget.style.borderColor = 'rgb(var(--watchlist-border))';
                                                                }, onMouseLeave: (e) => {
                                                                    e.currentTarget.style.backgroundColor = 'rgb(var(--watchlist-surface))';
                                                                    e.currentTarget.style.borderColor = 'rgb(var(--watchlist-border))';
                                                                }, onClick: (e) => {
                                                                    e.stopPropagation();
                                                                    if (article.canonicalUrl) {
                                                                        window.open(article.canonicalUrl, '_blank', 'noopener,noreferrer');
                                                                    }
                                                                }, children: [_jsx("div", { style: {
                                                                            display: 'flex',
                                                                            justifyContent: 'space-between',
                                                                            alignItems: 'flex-start',
                                                                            marginBottom: '8px'
                                                                        }, children: _jsxs("div", { style: {
                                                                                display: 'flex',
                                                                                gap: '8px',
                                                                                alignItems: 'center'
                                                                            }, children: [_jsx("span", { style: {
                                                                                        fontSize: '14px',
                                                                                        fontWeight: '600',
                                                                                        color: '#666',
                                                                                        backgroundColor: '#f0f0f0',
                                                                                        padding: '5px 12px',
                                                                                        borderRadius: '3px'
                                                                                    }, children: article.source }), article.isArchived && (_jsx("span", { style: {
                                                                                        fontSize: '12px',
                                                                                        fontWeight: '600',
                                                                                        color: '#7c3aed',
                                                                                        backgroundColor: 'rgba(124, 58, 237, 0.1)',
                                                                                        padding: '3px 8px',
                                                                                        borderRadius: '3px'
                                                                                    }, children: "Archived" })), _jsx("span", { style: {
                                                                                        fontSize: '14px',
                                                                                        color: '#999'
                                                                                    }, children: formatTimeAgo(new Date(article.publishedAt)) })] }) }), _jsx("h4", { style: {
                                                                            margin: '0 0 10px 0',
                                                                            fontSize: '18px',
                                                                            fontWeight: '500',
                                                                            color: '#0066cc',
                                                                            lineHeight: '1.5'
                                                                        }, children: article.headline }), ((_b = (_a = article.matchedTickers) === null || _a === void 0 ? void 0 : _a.find(m => m.symbol === symbol)) === null || _b === void 0 ? void 0 : _b.matchReason) && (_jsx("p", { style: {
                                                                            margin: '0 0 10px 0',
                                                                            fontSize: '13px',
                                                                            fontStyle: 'italic',
                                                                            color: '#888',
                                                                            lineHeight: '1.4'
                                                                        }, children: (_c = article.matchedTickers.find(m => m.symbol === symbol)) === null || _c === void 0 ? void 0 : _c.matchReason })), article.description && (_jsx("p", { style: {
                                                                            margin: 0,
                                                                            fontSize: '15px',
                                                                            color: '#666',
                                                                            lineHeight: '1.6',
                                                                            overflow: 'hidden',
                                                                            textOverflow: 'ellipsis',
                                                                            display: '-webkit-box',
                                                                            WebkitLineClamp: 2,
                                                                            WebkitBoxOrient: 'vertical'
                                                                        }, children: article.description }))] }, idx));
                                                        }) })) : (_jsx("div", { style: {
                                                            padding: '24px',
                                                            textAlign: 'center',
                                                            color: '#999',
                                                            fontSize: '16px'
                                                        }, children: "No RSS articles available" }))), activeTab === 'fmp' && (fmpArticles.length > 0 ? (_jsx("div", { children: fmpArticles.map((article, idx) => (_jsxs("div", { style: {
                                                                padding: '16px',
                                                                border: '1px solid rgb(var(--watchlist-border))',
                                                                borderRadius: '6px',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s',
                                                                backgroundColor: 'rgb(var(--watchlist-surface))',
                                                                marginBottom: '10px'
                                                            }, onMouseEnter: (e) => {
                                                                e.currentTarget.style.backgroundColor = 'rgb(var(--watchlist-button-hover))';
                                                                e.currentTarget.style.borderColor = 'rgb(var(--watchlist-border))';
                                                            }, onMouseLeave: (e) => {
                                                                e.currentTarget.style.backgroundColor = 'rgb(var(--watchlist-surface))';
                                                                e.currentTarget.style.borderColor = 'rgb(var(--watchlist-border))';
                                                            }, onClick: (e) => {
                                                                e.stopPropagation();
                                                                if (article.url) {
                                                                    window.open(article.url, '_blank', 'noopener,noreferrer');
                                                                }
                                                            }, children: [_jsx("div", { style: {
                                                                        display: 'flex',
                                                                        justifyContent: 'space-between',
                                                                        alignItems: 'flex-start',
                                                                        marginBottom: '10px'
                                                                    }, children: _jsxs("div", { style: {
                                                                            display: 'flex',
                                                                            gap: '8px',
                                                                            alignItems: 'center'
                                                                        }, children: [_jsx("span", { style: {
                                                                                    fontSize: '14px',
                                                                                    fontWeight: '600',
                                                                                    color: '#0066cc',
                                                                                    backgroundColor: 'rgba(0, 102, 204, 0.1)',
                                                                                    padding: '5px 12px',
                                                                                    borderRadius: '3px'
                                                                                }, children: article.source || 'FMP' }), _jsx("span", { style: {
                                                                                    fontSize: '14px',
                                                                                    color: '#999'
                                                                                }, children: formatTimeAgo(new Date(article.publishedAt || article.publishedDate || Date.now())) })] }) }), _jsx("h4", { style: {
                                                                        margin: '0 0 10px 0',
                                                                        fontSize: '18px',
                                                                        fontWeight: '500',
                                                                        color: '#0066cc',
                                                                        lineHeight: '1.4'
                                                                    }, children: article.title }), article.summary && (_jsx("p", { style: {
                                                                        margin: 0,
                                                                        fontSize: '15px',
                                                                        color: '#666',
                                                                        lineHeight: '1.6',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        display: '-webkit-box',
                                                                        WebkitLineClamp: 2,
                                                                        WebkitBoxOrient: 'vertical'
                                                                    }, children: article.summary }))] }, idx))) })) : (_jsx("div", { style: {
                                                            padding: '20px',
                                                            textAlign: 'center',
                                                            color: '#999',
                                                            fontSize: '15px'
                                                        }, children: fmpNewsCount > 0 ? 'Loading FMP articles...' : 'No FMP articles available' }))), activeTab === 'analyst' && (analystLoading ? (_jsx("div", { style: {
                                                            padding: '20px',
                                                            textAlign: 'center',
                                                            color: '#999',
                                                            fontSize: '15px'
                                                        }, children: "Loading analyst ratings..." })) : analystChanges.length > 0 ? (_jsx("div", { children: analystChanges.map((change, index) => (_jsxs("div", { style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                padding: '12px 16px',
                                                                borderBottom: index < analystChanges.length - 1 ? '1px solid #f0f0f0' : 'none',
                                                                transition: 'background 0.2s',
                                                                cursor: 'pointer'
                                                            }, onMouseEnter: (e) => e.currentTarget.style.background = '#f8f8f8', onMouseLeave: (e) => e.currentTarget.style.background = 'transparent', onClick: () => change.newsURL && window.open(change.newsURL, '_blank'), children: [_jsxs("div", { style: {
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '16px',
                                                                        flex: '1',
                                                                        minWidth: 0
                                                                    }, children: [_jsx("span", { style: {
                                                                                color: '#666',
                                                                                fontSize: '13px',
                                                                                minWidth: '80px'
                                                                            }, children: (() => {
                                                                                const date = new Date(change.publishedDate);
                                                                                const now = new Date();
                                                                                const diffMs = now.getTime() - date.getTime();
                                                                                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                                                                if (diffDays === 0)
                                                                                    return 'Today';
                                                                                if (diffDays === 1)
                                                                                    return 'Yesterday';
                                                                                if (diffDays < 7)
                                                                                    return `${diffDays} days ago`;
                                                                                if (diffDays < 30)
                                                                                    return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
                                                                                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                                                            })() }), _jsx("span", { style: {
                                                                                color: '#000',
                                                                                fontSize: '14px',
                                                                                fontWeight: '500',
                                                                                minWidth: '120px'
                                                                            }, children: change.gradingCompany }), _jsx("span", { style: {
                                                                                color: (() => {
                                                                                    var _a;
                                                                                    const actionLower = (_a = change.action) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                                                                                    if (actionLower === 'upgrade' || actionLower === 'up')
                                                                                        return '#16a34a';
                                                                                    if (actionLower === 'downgrade' || actionLower === 'down')
                                                                                        return '#dc2626';
                                                                                    if (actionLower === 'init' || actionLower === 'initiated')
                                                                                        return '#2563eb';
                                                                                    return '#6b7280';
                                                                                })(),
                                                                                fontSize: '13px',
                                                                                fontWeight: '600',
                                                                                minWidth: '80px'
                                                                            }, children: (() => {
                                                                                var _a;
                                                                                const actionLower = (_a = change.action) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                                                                                if (actionLower === 'upgrade' || actionLower === 'up')
                                                                                    return 'Upgraded';
                                                                                if (actionLower === 'downgrade' || actionLower === 'down')
                                                                                    return 'Downgraded';
                                                                                if (actionLower === 'init' || actionLower === 'initiated')
                                                                                    return 'Initiated';
                                                                                if (actionLower === 'reit' || actionLower === 'reiterated')
                                                                                    return 'Reiterated';
                                                                                if (actionLower === 'main' || actionLower === 'maintained' || actionLower === 'hold')
                                                                                    return 'Maintained';
                                                                                return change.action;
                                                                            })() }), _jsx("div", { style: {
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: '6px',
                                                                                fontSize: '13px'
                                                                            }, children: (() => {
                                                                                var _a;
                                                                                const actionLower = (_a = change.action) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                                                                                const isMaintained = actionLower === 'main' || actionLower === 'maintained' || actionLower === 'hold' || actionLower === 'reit' || actionLower === 'reiterated';
                                                                                // If rating is maintained/reiterated, just show the current rating
                                                                                if (isMaintained || (change.previousGrade === change.newGrade)) {
                                                                                    return (_jsx("span", { style: { color: '#000', fontWeight: '500' }, children: change.newGrade }));
                                                                                }
                                                                                // If it's a change or initiation, show the transition
                                                                                if (change.previousGrade && change.previousGrade !== 'None') {
                                                                                    return (_jsxs(_Fragment, { children: [_jsx("span", { style: { color: '#888' }, children: change.previousGrade }), _jsx("span", { style: { color: '#666' }, children: "\u2192" }), _jsx("span", { style: { color: '#000', fontWeight: '500' }, children: change.newGrade })] }));
                                                                                }
                                                                                // For initiations or when no previous grade
                                                                                return (_jsx("span", { style: { color: '#000', fontWeight: '500' }, children: change.newGrade }));
                                                                            })() })] }), _jsxs("div", { style: {
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '16px'
                                                                    }, children: [change.priceTarget && (_jsxs("span", { style: {
                                                                                color: '#000',
                                                                                fontSize: '13px',
                                                                                fontWeight: '500'
                                                                            }, children: ["PT: $", change.priceTarget.toFixed(0)] })), change.newsURL && (_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "#666", strokeWidth: "2", children: [_jsx("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }), _jsx("polyline", { points: "15 3 21 3 21 9" }), _jsx("line", { x1: "10", y1: "14", x2: "21", y2: "3" })] }))] })] }, index))) })) : (_jsx("div", { style: {
                                                            padding: '20px',
                                                            textAlign: 'center',
                                                            color: '#999',
                                                            fontSize: '15px'
                                                        }, children: "No analyst rating changes in the last 14 days" })))] })) })] })] })] }));
            })(), document.body), showTooltip && news && !showDropdown && (_jsxs("div", { style: {
                    position: 'fixed',
                    bottom: indicatorRef.current
                        ? window.innerHeight - indicatorRef.current.getBoundingClientRect().top + 8
                        : 0,
                    left: indicatorRef.current
                        ? indicatorRef.current.getBoundingClientRect().left +
                            (indicatorRef.current.getBoundingClientRect().width / 2) - 150
                        : 0,
                    zIndex: 10000,
                    pointerEvents: 'none'
                }, children: [_jsxs("div", { style: {
                            backgroundColor: 'rgba(0, 0, 0, 0.95)',
                            color: 'white',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            maxWidth: '300px',
                            minWidth: '200px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                            fontSize: '12px',
                            lineHeight: '1.4'
                        }, children: [_jsxs("div", { style: {
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '6px'
                                }, children: [_jsx("span", { style: {
                                            color: news.source === 'WSJ' ? '#ff6b6b' : '#4dabf7',
                                            fontWeight: '600',
                                            fontSize: '11px'
                                        }, children: news.source }), _jsx("span", { style: {
                                            color: '#999',
                                            fontSize: '10px'
                                        }, children: formatTimeAgo(new Date(news.publishedAt)) })] }), _jsx("div", { style: {
                                    fontWeight: '500',
                                    marginBottom: '4px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical'
                                }, children: news.headline }), news.description && (_jsx("div", { style: {
                                    color: '#ccc',
                                    fontSize: '11px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical'
                                }, children: news.description })), newsCount > 1 && (_jsxs("div", { style: {
                                    marginTop: '6px',
                                    paddingTop: '6px',
                                    borderTop: '1px solid #333',
                                    color: '#999',
                                    fontSize: '10px',
                                    textAlign: 'center'
                                }, children: ["+", newsCount - 1, " more ", newsCount === 2 ? 'article' : 'articles'] })), _jsx("div", { style: {
                                    marginTop: '6px',
                                    color: '#666',
                                    fontSize: '10px',
                                    textAlign: 'center',
                                    fontStyle: 'italic'
                                }, children: "Click to view all articles" })] }), _jsx("div", { style: {
                            position: 'absolute',
                            bottom: '-6px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: 0,
                            height: 0,
                            borderLeft: '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderTop: '6px solid rgba(0, 0, 0, 0.95)'
                        } })] }))] }));
}
