import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@watchlist/lib/firebase/config';
import { useAuth } from '@watchlist/lib/firebase/auth-context';

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

export function useSubscription() {
  const { user, getIdToken } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    // First try to get from Firestore
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'subscription', 'current'),
      async (doc) => {
        if (doc.exists()) {
          setSubscription(doc.data() as Subscription);
          setLoading(false);
          setError(null);
        } else {
          // If not in Firestore, try to sync from Stripe
          try {
            const token = await getIdToken();
            const response = await fetch('/api/stripe/sync-subscription', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });

            if (response.ok) {
              const data = await response.json();
              if (data.hasSubscription && data.subscription) {
                setSubscription(data.subscription);
              } else {
                setSubscription(null);
              }
            } else {
              setSubscription(null);
            }
          } catch (syncError) {
            console.error('Error syncing subscription from Stripe:', syncError);
            setSubscription(null);
          }
          setLoading(false);
        }
      },
      (err) => {
        console.error('Error fetching subscription:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, getIdToken]);

  const isPremium = subscription?.entitlements?.premium === true && 
                    (subscription?.status === 'active' || subscription?.status === 'trialing');

  const isTrialing = subscription?.status === 'trialing';
  
  const willCancelAtPeriodEnd = subscription?.cancellationAtPeriodEnd === true;

  const daysUntilPeriodEnd = () => {
    if (!subscription?.currentPeriodEnd) return null;
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