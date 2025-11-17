'use client';

import { useSubscription } from '@watchlist/hooks/useSubscription';

interface SubscriptionStatusProps {
  customerSince?: string;
}

export default function SubscriptionStatus({ customerSince }: SubscriptionStatusProps) {
  const { subscription, isPremium, willCancelAtPeriodEnd, daysUntilPeriodEnd, loading } = useSubscription();

  if (loading) {
    return (
      <div className="bg-[#111] border border-gray-800 rounded-xl p-6 mb-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-1/3 mb-2"></div>
          <div className="h-6 bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="bg-[#111] border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-400 mb-1">Subscription Status</h3>
            <p className="text-2xl font-bold text-gray-300">No Active Subscription</p>
          </div>
          <div className="text-gray-500">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusColor = () => {
    if (willCancelAtPeriodEnd) return 'text-yellow-500';
    if (isPremium) return 'text-green-500';
    if (subscription.status === 'past_due') return 'text-orange-500';
    if (subscription.status === 'canceled') return 'text-red-500';
    return 'text-gray-500';
  };

  const getStatusText = () => {
    if (willCancelAtPeriodEnd) return 'Canceling Soon';
    if (subscription.status === 'active') return 'Active';
    if (subscription.status === 'trialing') return 'Trial';
    if (subscription.status === 'past_due') return 'Past Due';
    if (subscription.status === 'canceled') return 'Canceled';
    return subscription.status || 'Unknown';
  };

  return (
    <div className="bg-[#111] border border-gray-800 rounded-xl p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-400 mb-1">Subscription Status</h3>
          <div className="flex items-center gap-3">
            <p className={`text-2xl font-bold ${getStatusColor()}`}>
              {getStatusText()}
            </p>
            {isPremium && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-800">
                Premium
              </span>
            )}
          </div>
        </div>
        <div className={`${getStatusColor()}`}>
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isPremium ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        {customerSince && (
          <div>
            <p className="text-gray-500 mb-1">Member Since</p>
            <p className="text-gray-300 font-medium">{formatDate(customerSince)}</p>
          </div>
        )}
        
        {subscription.currentPeriodEnd && (
          <div>
            <p className="text-gray-500 mb-1">
              {willCancelAtPeriodEnd ? 'Cancels On' : 'Next Billing Date'}
            </p>
            <p className="text-gray-300 font-medium">
              {formatDate(subscription.currentPeriodEnd)}
              {daysUntilPeriodEnd !== null && daysUntilPeriodEnd > 0 && (
                <span className="text-gray-500 ml-1">({daysUntilPeriodEnd} days)</span>
              )}
            </p>
          </div>
        )}

        {subscription.trialEnd && (
          <div>
            <p className="text-gray-500 mb-1">Trial Ends</p>
            <p className="text-gray-300 font-medium">{formatDate(subscription.trialEnd)}</p>
          </div>
        )}

        <div>
          <p className="text-gray-500 mb-1">Plan</p>
          <p className="text-gray-300 font-medium">Premium Monthly - $1/mo</p>
        </div>
      </div>

      {willCancelAtPeriodEnd && (
        <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg">
          <p className="text-yellow-400 text-sm">
            Your subscription will be canceled at the end of the current billing period.
            You'll continue to have access until {subscription.currentPeriodEnd && formatDate(subscription.currentPeriodEnd)}.
          </p>
        </div>
      )}

      {subscription.status === 'past_due' && (
        <div className="mt-4 p-3 bg-orange-900/20 border border-orange-800 rounded-lg">
          <p className="text-orange-400 text-sm">
            Your payment is past due. Please update your payment method to continue your subscription.
          </p>
        </div>
      )}
    </div>
  );
}