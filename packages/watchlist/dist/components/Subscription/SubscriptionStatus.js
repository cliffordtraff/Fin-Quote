'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useSubscription } from '@watchlist/hooks/useSubscription';
export default function SubscriptionStatus({ customerSince }) {
    const { subscription, isPremium, willCancelAtPeriodEnd, daysUntilPeriodEnd, loading } = useSubscription();
    if (loading) {
        return (_jsx("div", { className: "bg-[#111] border border-gray-800 rounded-xl p-6 mb-6", children: _jsxs("div", { className: "animate-pulse", children: [_jsx("div", { className: "h-4 bg-gray-700 rounded w-1/3 mb-2" }), _jsx("div", { className: "h-6 bg-gray-700 rounded w-1/2" })] }) }));
    }
    if (!subscription) {
        return (_jsx("div", { className: "bg-[#111] border border-gray-800 rounded-xl p-6 mb-6", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-lg font-semibold text-gray-400 mb-1", children: "Subscription Status" }), _jsx("p", { className: "text-2xl font-bold text-gray-300", children: "No Active Subscription" })] }), _jsx("div", { className: "text-gray-500", children: _jsx("svg", { className: "w-12 h-12", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }) })] }) }));
    }
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    };
    const getStatusColor = () => {
        if (willCancelAtPeriodEnd)
            return 'text-yellow-500';
        if (isPremium)
            return 'text-green-500';
        if (subscription.status === 'past_due')
            return 'text-orange-500';
        if (subscription.status === 'canceled')
            return 'text-red-500';
        return 'text-gray-500';
    };
    const getStatusText = () => {
        if (willCancelAtPeriodEnd)
            return 'Canceling Soon';
        if (subscription.status === 'active')
            return 'Active';
        if (subscription.status === 'trialing')
            return 'Trial';
        if (subscription.status === 'past_due')
            return 'Past Due';
        if (subscription.status === 'canceled')
            return 'Canceled';
        return subscription.status || 'Unknown';
    };
    return (_jsxs("div", { className: "bg-[#111] border border-gray-800 rounded-xl p-6 mb-6", children: [_jsxs("div", { className: "flex items-start justify-between mb-4", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-lg font-semibold text-gray-400 mb-1", children: "Subscription Status" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("p", { className: `text-2xl font-bold ${getStatusColor()}`, children: getStatusText() }), isPremium && (_jsx("span", { className: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-800", children: "Premium" }))] })] }), _jsx("div", { className: `${getStatusColor()}`, children: _jsx("svg", { className: "w-12 h-12", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: isPremium ? (_jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" })) : (_jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" })) }) })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4 text-sm", children: [customerSince && (_jsxs("div", { children: [_jsx("p", { className: "text-gray-500 mb-1", children: "Member Since" }), _jsx("p", { className: "text-gray-300 font-medium", children: formatDate(customerSince) })] })), subscription.currentPeriodEnd && (_jsxs("div", { children: [_jsx("p", { className: "text-gray-500 mb-1", children: willCancelAtPeriodEnd ? 'Cancels On' : 'Next Billing Date' }), _jsxs("p", { className: "text-gray-300 font-medium", children: [formatDate(subscription.currentPeriodEnd), daysUntilPeriodEnd !== null && daysUntilPeriodEnd > 0 && (_jsxs("span", { className: "text-gray-500 ml-1", children: ["(", daysUntilPeriodEnd, " days)"] }))] })] })), subscription.trialEnd && (_jsxs("div", { children: [_jsx("p", { className: "text-gray-500 mb-1", children: "Trial Ends" }), _jsx("p", { className: "text-gray-300 font-medium", children: formatDate(subscription.trialEnd) })] })), _jsxs("div", { children: [_jsx("p", { className: "text-gray-500 mb-1", children: "Plan" }), _jsx("p", { className: "text-gray-300 font-medium", children: "Premium Monthly - $1/mo" })] })] }), willCancelAtPeriodEnd && (_jsx("div", { className: "mt-4 p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg", children: _jsxs("p", { className: "text-yellow-400 text-sm", children: ["Your subscription will be canceled at the end of the current billing period. You'll continue to have access until ", subscription.currentPeriodEnd && formatDate(subscription.currentPeriodEnd), "."] }) })), subscription.status === 'past_due' && (_jsx("div", { className: "mt-4 p-3 bg-orange-900/20 border border-orange-800 rounded-lg", children: _jsx("p", { className: "text-orange-400 text-sm", children: "Your payment is past due. Please update your payment method to continue your subscription." }) }))] }));
}
