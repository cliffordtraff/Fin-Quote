import { ReactNode } from 'react';
interface StatusContextType {
    showStatus: (message: string, isError?: boolean) => void;
    clearStatus: () => void;
}
export declare function useStatus(): StatusContextType;
export declare function StatusProvider({ children }: {
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export {};
