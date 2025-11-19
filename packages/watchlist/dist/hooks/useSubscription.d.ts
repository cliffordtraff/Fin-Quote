interface Subscription {
    stripeCustomerId?: string;
    subscriptionId?: string;
    status?: string;
    currentPeriodEnd?: string;
    currentPeriodStart?: string;
    priceId?: string;
    cancellationAtPeriodEnd?: boolean;
    trialEnd?: string | null;
    entitlements?: {
        premium: boolean;
    };
    createdAt?: string;
    updatedAt?: string;
}
export declare function useSubscription(): {
    subscription: Subscription | null;
    isPremium: boolean;
    isTrialing: boolean;
    willCancelAtPeriodEnd: boolean;
    daysUntilPeriodEnd: number | null;
    loading: boolean;
    error: string | null;
};
export {};
