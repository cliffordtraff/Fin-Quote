/**
 * Earnings Impact Meter Component
 *
 * Visual bar showing earnings impact confidence with breakdown
 */
import React from 'react';
interface ImpactMeterProps {
    confidence: number;
    breakdown?: {
        temporal: number;
        volume: number;
        news: number;
        analyst: number;
        gap: number;
        negative: number;
    };
    showBreakdown?: boolean;
}
export declare const ImpactMeter: React.FC<ImpactMeterProps>;
export default ImpactMeter;
