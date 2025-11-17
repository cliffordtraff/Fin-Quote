'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@watchlist/lib/firebase/auth-context';

interface Payment {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  paid: boolean;
  invoiceUrl: string;
  invoicePdf: string;
  description: string;
  number: string;
}

interface PaymentHistoryData {
  payments: Payment[];
  hasMore: boolean;
  customer?: {
    id: string;
    email: string;
    created: string;
  };
}

interface PaymentHistoryProps {
  onCustomerDataLoaded?: (customerSince: string) => void;
}

export default function PaymentHistory({ onCustomerDataLoaded }: PaymentHistoryProps) {
  const { user, getIdToken } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [customerSince, setCustomerSince] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (user) {
      fetchPaymentHistory();
    }
  }, [user]);

  const fetchPaymentHistory = async (startingAfter?: string) => {
    if (!user) return;

    const isLoadingMore = !!startingAfter;
    if (isLoadingMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const token = await getIdToken();
      const params = new URLSearchParams();
      if (startingAfter) {
        params.append('starting_after', startingAfter);
      }
      params.append('limit', '10');

      const response = await fetch(`/api/stripe/payment-history?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch payment history');
      }

      const data: PaymentHistoryData = await response.json();
      
      if (isLoadingMore) {
        setPayments(prev => [...prev, ...data.payments]);
      } else {
        setPayments(data.payments);
        if (data.customer) {
          setCustomerSince(data.customer.created);
          onCustomerDataLoaded?.(data.customer.created);
        }
      }
      
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('Error fetching payment history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load payment history');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (payments.length > 0) {
      const lastPayment = payments[payments.length - 1];
      fetchPaymentHistory(lastPayment.id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  const getStatusBadge = (status: string, paid: boolean) => {
    if (paid) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900/30 text-green-400 border border-green-800">
          Paid
        </span>
      );
    }
    
    const statusColors: Record<string, string> = {
      'open': 'bg-yellow-900/30 text-yellow-400 border-yellow-800',
      'draft': 'bg-gray-900/30 text-gray-400 border-gray-800',
      'void': 'bg-red-900/30 text-red-400 border-red-800',
      'uncollectible': 'bg-red-900/30 text-red-400 border-red-800',
    };

    const colorClass = statusColors[status] || 'bg-gray-900/30 text-gray-400 border-gray-800';
    
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (loading && payments.length === 0) {
    return (
      <div className="bg-[#111] border border-gray-800 rounded-xl p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#111] border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-900/50 transition-colors"
      >
        <h3 className="text-lg font-semibold text-white">Payment History</h3>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-6 pb-6">
          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {payments.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p>No payment history yet</p>
              <p className="text-sm text-gray-500 mt-1">Your payments will appear here after your first billing cycle</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-3 px-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                      <th className="text-left py-3 px-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Description</th>
                      <th className="text-left py-3 px-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                      <th className="text-left py-3 px-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="text-left py-3 px-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Invoice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-900/30 transition-colors">
                        <td className="py-3 px-2 text-sm text-gray-300">
                          {formatDate(payment.date)}
                        </td>
                        <td className="py-3 px-2 text-sm text-gray-300">
                          {payment.description}
                          {payment.number && (
                            <span className="text-xs text-gray-500 block">#{payment.number}</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-sm font-medium text-gray-300">
                          {formatCurrency(payment.amount, payment.currency)}
                        </td>
                        <td className="py-3 px-2">
                          {getStatusBadge(payment.status, payment.paid)}
                        </td>
                        <td className="py-3 px-2">
                          {payment.invoiceUrl && (
                            <a
                              href={payment.invoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
                            >
                              View
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {hasMore && (
                <div className="mt-4 text-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}