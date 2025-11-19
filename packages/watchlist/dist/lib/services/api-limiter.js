/**
 * API Rate Limiter and Cost Tracking Service
 *
 * Manages API rate limits, cost tracking, and request queuing
 * to prevent exceeding FMP API limits and budget constraints.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class APIRateLimiter {
    constructor() {
        // Configuration
        this.DAILY_LIMIT = 1000; // Conservative limit
        this.MONTHLY_BUDGET = 50; // $50/month
        this.COST_PER_CALL = 0.001; // Estimated cost per API call
        // Circuit breaker settings
        this.FAILURE_THRESHOLD = 5;
        this.RESET_TIMEOUT = 60000; // 1 minute
        this.HALF_OPEN_REQUESTS = 3;
        // State
        this.requestQueue = [];
        this.processing = false;
        this.usage = {
            dailyCalls: 0,
            monthlyCalls: 0,
            dailyCost: 0,
            monthlyCost: 0,
            lastReset: {
                daily: new Date(),
                monthly: new Date()
            }
        };
        this.circuitBreaker = {
            isOpen: false,
            failureCount: 0,
            lastFailureTime: 0,
            nextRetryTime: 0
        };
        this.loadUsageFromStorage();
        this.startDailyResetTimer();
        this.startMonthlyResetTimer();
    }
    static getInstance() {
        if (!APIRateLimiter.instance) {
            APIRateLimiter.instance = new APIRateLimiter();
        }
        return APIRateLimiter.instance;
    }
    /**
     * Queue an API request with priority
     */
    queueRequest(endpoint_1, callback_1) {
        return __awaiter(this, arguments, void 0, function* (endpoint, callback, priority = 'normal') {
            // Check if circuit breaker is open
            if (this.circuitBreaker.isOpen) {
                if (Date.now() < this.circuitBreaker.nextRetryTime) {
                    throw new Error('API circuit breaker is open. Service temporarily unavailable.');
                }
                // Try half-open state
                this.circuitBreaker.isOpen = false;
            }
            // Check daily and monthly limits
            if (this.usage.dailyCalls >= this.DAILY_LIMIT) {
                throw new Error('Daily API limit reached. Try again tomorrow.');
            }
            if (this.usage.monthlyCost >= this.MONTHLY_BUDGET) {
                throw new Error('Monthly budget limit reached.');
            }
            return new Promise((resolve, reject) => {
                const request = {
                    id: `${Date.now()}-${Math.random()}`,
                    endpoint,
                    priority,
                    timestamp: Date.now(),
                    retryCount: 0,
                    callback: () => __awaiter(this, void 0, void 0, function* () {
                        try {
                            const result = yield callback();
                            this.recordSuccess();
                            resolve(result);
                            return result;
                        }
                        catch (error) {
                            this.recordFailure();
                            reject(error);
                            throw error;
                        }
                    })
                };
                this.enqueueRequest(request);
                this.processQueue();
            });
        });
    }
    /**
     * Add request to queue based on priority
     */
    enqueueRequest(request) {
        // Find insertion point based on priority
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const insertIndex = this.requestQueue.findIndex(r => priorityOrder[r.priority] > priorityOrder[request.priority]);
        if (insertIndex === -1) {
            this.requestQueue.push(request);
        }
        else {
            this.requestQueue.splice(insertIndex, 0, request);
        }
    }
    /**
     * Process queued requests
     */
    processQueue() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.processing || this.requestQueue.length === 0) {
                return;
            }
            this.processing = true;
            while (this.requestQueue.length > 0) {
                // Check limits before each request
                if (this.usage.dailyCalls >= this.DAILY_LIMIT ||
                    this.usage.monthlyCost >= this.MONTHLY_BUDGET) {
                    break;
                }
                const request = this.requestQueue.shift();
                try {
                    yield this.executeWithRetry(request);
                }
                catch (error) {
                    console.error(`Failed to execute request to ${request.endpoint}:`, error);
                }
                // Add small delay between requests to avoid overwhelming the API
                yield this.delay(100);
            }
            this.processing = false;
        });
    }
    /**
     * Execute request with exponential backoff retry
     */
    executeWithRetry(request) {
        return __awaiter(this, void 0, void 0, function* () {
            const maxRetries = 3;
            const baseDelay = 1000;
            while (request.retryCount < maxRetries) {
                try {
                    const result = yield request.callback();
                    this.incrementUsage();
                    return result;
                }
                catch (error) {
                    request.retryCount++;
                    if (request.retryCount >= maxRetries) {
                        throw error;
                    }
                    // Exponential backoff with jitter
                    const delay = baseDelay * Math.pow(2, request.retryCount) + Math.random() * 1000;
                    console.log(`Retrying request to ${request.endpoint} after ${delay}ms (attempt ${request.retryCount + 1})`);
                    yield this.delay(delay);
                }
            }
        });
    }
    /**
     * Record successful API call
     */
    recordSuccess() {
        this.circuitBreaker.failureCount = 0;
    }
    /**
     * Record failed API call
     */
    recordFailure() {
        this.circuitBreaker.failureCount++;
        this.circuitBreaker.lastFailureTime = Date.now();
        if (this.circuitBreaker.failureCount >= this.FAILURE_THRESHOLD) {
            this.circuitBreaker.isOpen = true;
            this.circuitBreaker.nextRetryTime = Date.now() + this.RESET_TIMEOUT;
            console.error('Circuit breaker opened due to repeated failures');
        }
    }
    /**
     * Increment usage counters
     */
    incrementUsage() {
        this.usage.dailyCalls++;
        this.usage.monthlyCalls++;
        this.usage.dailyCost += this.COST_PER_CALL;
        this.usage.monthlyCost += this.COST_PER_CALL;
        this.saveUsageToStorage();
        // Check if we're approaching limits and log warnings
        if (this.usage.dailyCalls > this.DAILY_LIMIT * 0.8) {
            console.warn(`API daily limit warning: ${this.usage.dailyCalls}/${this.DAILY_LIMIT} calls used`);
        }
        if (this.usage.monthlyCost > this.MONTHLY_BUDGET * 0.8) {
            console.warn(`API monthly budget warning: $${this.usage.monthlyCost.toFixed(2)}/$${this.MONTHLY_BUDGET} used`);
        }
    }
    /**
     * Load usage data from localStorage
     */
    loadUsageFromStorage() {
        try {
            const stored = localStorage.getItem('api_usage');
            if (stored) {
                const data = JSON.parse(stored);
                this.usage = Object.assign(Object.assign({}, data), { lastReset: {
                        daily: new Date(data.lastReset.daily),
                        monthly: new Date(data.lastReset.monthly)
                    } });
                // Check if we need to reset daily/monthly counters
                this.checkResets();
            }
        }
        catch (error) {
            console.error('Failed to load API usage from storage:', error);
        }
    }
    /**
     * Save usage data to localStorage
     */
    saveUsageToStorage() {
        try {
            localStorage.setItem('api_usage', JSON.stringify(this.usage));
        }
        catch (error) {
            console.error('Failed to save API usage to storage:', error);
        }
    }
    /**
     * Check and perform daily/monthly resets
     */
    checkResets() {
        const now = new Date();
        // Daily reset
        if (now.getDate() !== this.usage.lastReset.daily.getDate() ||
            now.getMonth() !== this.usage.lastReset.daily.getMonth() ||
            now.getFullYear() !== this.usage.lastReset.daily.getFullYear()) {
            this.usage.dailyCalls = 0;
            this.usage.dailyCost = 0;
            this.usage.lastReset.daily = now;
            console.log('Daily API usage reset');
        }
        // Monthly reset
        if (now.getMonth() !== this.usage.lastReset.monthly.getMonth() ||
            now.getFullYear() !== this.usage.lastReset.monthly.getFullYear()) {
            this.usage.monthlyCalls = 0;
            this.usage.monthlyCost = 0;
            this.usage.lastReset.monthly = now;
            console.log('Monthly API usage reset');
        }
        this.saveUsageToStorage();
    }
    /**
     * Start daily reset timer
     */
    startDailyResetTimer() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const msUntilMidnight = tomorrow.getTime() - now.getTime();
        setTimeout(() => {
            this.checkResets();
            // Set up recurring daily timer
            setInterval(() => this.checkResets(), 24 * 60 * 60 * 1000);
        }, msUntilMidnight);
    }
    /**
     * Start monthly reset timer
     */
    startMonthlyResetTimer() {
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
        const msUntilNextMonth = nextMonth.getTime() - now.getTime();
        setTimeout(() => {
            this.checkResets();
            // Set up recurring monthly timer (check daily, will reset when month changes)
            setInterval(() => this.checkResets(), 24 * 60 * 60 * 1000);
        }, msUntilNextMonth);
    }
    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Get current usage statistics
     */
    getUsageStats() {
        return Object.assign(Object.assign({}, this.usage), { circuitBreakerOpen: this.circuitBreaker.isOpen });
    }
    /**
     * Check if we can make more requests
     */
    canMakeRequest() {
        return !this.circuitBreaker.isOpen &&
            this.usage.dailyCalls < this.DAILY_LIMIT &&
            this.usage.monthlyCost < this.MONTHLY_BUDGET;
    }
    /**
     * Get remaining daily calls
     */
    getRemainingDailyCalls() {
        return Math.max(0, this.DAILY_LIMIT - this.usage.dailyCalls);
    }
    /**
     * Get remaining monthly budget
     */
    getRemainingMonthlyBudget() {
        return Math.max(0, this.MONTHLY_BUDGET - this.usage.monthlyCost);
    }
}
// Export singleton instance
export const apiLimiter = APIRateLimiter.getInstance();
