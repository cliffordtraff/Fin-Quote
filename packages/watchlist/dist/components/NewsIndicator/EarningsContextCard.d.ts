/**
 * Earnings Context Card Component
 *
 * Expandable card showing detailed earnings information
 */
import React from 'react';
import { EarningsContext } from '@watchlist/types/earnings';
interface EarningsContextCardProps {
    context: EarningsContext;
    expanded?: boolean;
}
export declare const EarningsContextCard: React.FC<EarningsContextCardProps>;
export default EarningsContextCard;
