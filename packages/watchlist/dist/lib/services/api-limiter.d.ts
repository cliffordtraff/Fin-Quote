/**
 * API Rate Limiter and Cost Tracking Service
 *
 * Manages API rate limits, cost tracking, and request queuing
 * to prevent exceeding FMP API limits and budget constraints.
 */
interface APIUsage {
    dailyCalls: number;
    monthlyCalls: number;
    dailyCost: number;
    monthlyCost: number;
    lastReset: {
        daily: Date;
        monthly: Date;
    };
}
export declare class APIRateLimiter {
    private static instance;
    private readonly DAILY_LIMIT;
    private readonly MONTHLY_BUDGET;
    private readonly COST_PER_CALL;
    private readonly FAILURE_THRESHOLD;
    private readonly RESET_TIMEOUT;
    private readonly HALF_OPEN_REQUESTS;
    private requestQueue;
    private processing;
    private usage;
    private circuitBreaker;
    private constructor();
    static getInstance(): APIRateLimiter;
    /**
     * Queue an API request with priority
     */
    queueRequest<T>(endpoint: string, callback: () => Promise<T>, priority?: 'high' | 'normal' | 'low'): Promise<T>;
    /**
     * Add request to queue based on priority
     */
    private enqueueRequest;
    /**
     * Process queued requests
     */
    private processQueue;
    /**
     * Execute request with exponential backoff retry
     */
    private executeWithRetry;
    /**
     * Record successful API call
     */
    private recordSuccess;
    /**
     * Record failed API call
     */
    private recordFailure;
    /**
     * Increment usage counters
     */
    private incrementUsage;
    /**
     * Load usage data from localStorage
     */
    private loadUsageFromStorage;
    /**
     * Save usage data to localStorage
     */
    private saveUsageToStorage;
    /**
     * Check and perform daily/monthly resets
     */
    private checkResets;
    /**
     * Start daily reset timer
     */
    private startDailyResetTimer;
    /**
     * Start monthly reset timer
     */
    private startMonthlyResetTimer;
    /**
     * Utility delay function
     */
    private delay;
    /**
     * Get current usage statistics
     */
    getUsageStats(): APIUsage & {
        circuitBreakerOpen: boolean;
    };
    /**
     * Check if we can make more requests
     */
    canMakeRequest(): boolean;
    /**
     * Get remaining daily calls
     */
    getRemainingDailyCalls(): number;
    /**
     * Get remaining monthly budget
     */
    getRemainingMonthlyBudget(): number;
}
export declare const apiLimiter: APIRateLimiter;
export {};
