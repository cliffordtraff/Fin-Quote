import { CompanyMapping } from '@watchlist/types';
export declare const companyMappings: Record<string, CompanyMapping>;
export declare const getAllTickers: () => string[];
export declare const findTickerByName: (name: string) => string | undefined;
export declare const findTickerByExecutive: (executiveName: string) => string | undefined;
export declare const findTickerByProduct: (productName: string) => string | undefined;
