export declare function isMarketOpen(): boolean;
export declare function isExtendedHours(): boolean;
export declare function getExtendedHoursSession(): 'pre-market' | 'after-hours' | null;
export declare function getCacheMaxAge(dataType: 'quote' | 'dividend' | 'static'): number;
