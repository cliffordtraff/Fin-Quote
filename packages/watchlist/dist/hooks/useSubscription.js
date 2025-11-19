var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@watchlist/lib/firebase/config';
import { useAuth } from '@watchlist/lib/firebase/auth-context';
export function useSubscription() {
    var _a;
    const { user, getIdToken } = useAuth();
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!user) {
            setSubscription(null);
            setLoading(false);
            return;
        }
        // First try to get from Firestore
        const unsubscribe = onSnapshot(doc(db, 'users', user.uid, 'subscription', 'current'), (doc) => __awaiter(this, void 0, void 0, function* () {
            if (doc.exists()) {
                setSubscription(doc.data());
                setLoading(false);
                setError(null);
            }
            else {
                // If not in Firestore, try to sync from Stripe
                try {
                    const token = yield getIdToken();
                    const response = yield fetch('/api/stripe/sync-subscription', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                        },
                    });
                    if (response.ok) {
                        const data = yield response.json();
                        if (data.hasSubscription && data.subscription) {
                            setSubscription(data.subscription);
                        }
                        else {
                            setSubscription(null);
                        }
                    }
                    else {
                        setSubscription(null);
                    }
                }
                catch (syncError) {
                    console.error('Error syncing subscription from Stripe:', syncError);
                    setSubscription(null);
                }
                setLoading(false);
            }
        }), (err) => {
            console.error('Error fetching subscription:', err);
            setError(err.message);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user, getIdToken]);
    const isPremium = ((_a = subscription === null || subscription === void 0 ? void 0 : subscription.entitlements) === null || _a === void 0 ? void 0 : _a.premium) === true &&
        ((subscription === null || subscription === void 0 ? void 0 : subscription.status) === 'active' || (subscription === null || subscription === void 0 ? void 0 : subscription.status) === 'trialing');
    const isTrialing = (subscription === null || subscription === void 0 ? void 0 : subscription.status) === 'trialing';
    const willCancelAtPeriodEnd = (subscription === null || subscription === void 0 ? void 0 : subscription.cancellationAtPeriodEnd) === true;
    const daysUntilPeriodEnd = () => {
        if (!(subscription === null || subscription === void 0 ? void 0 : subscription.currentPeriodEnd))
            return null;
        const endDate = new Date(subscription.currentPeriodEnd);
        const now = new Date();
        const diffTime = endDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    };
    return {
        subscription,
        isPremium,
        isTrialing,
        willCancelAtPeriodEnd,
        daysUntilPeriodEnd: daysUntilPeriodEnd(),
        loading,
        error,
    };
}
