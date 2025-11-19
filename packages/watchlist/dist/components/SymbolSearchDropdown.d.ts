import React from 'react';
import { SearchResult } from '@watchlist/hooks/useSymbolSearch';
interface SymbolSearchDropdownProps {
    onSelect: (result: SearchResult) => void;
    existingSymbols?: string[];
    existingTvSymbols?: string[];
    placeholder?: string;
}
export declare const SymbolSearchDropdown: React.ForwardRefExoticComponent<SymbolSearchDropdownProps & React.RefAttributes<HTMLInputElement>>;
export {};
