/**
 * Earnings Badge Component
 *
 * Displays earnings proximity/status badge
 */
import React from 'react';
import { EarningsContext } from '@watchlist/types/earnings';
interface EarningsBadgeProps {
    earningsContext: EarningsContext;
    compact?: boolean;
}
export declare const EarningsBadge: React.FC<EarningsBadgeProps>;
export default EarningsBadge;
