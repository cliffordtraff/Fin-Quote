interface ExtendedHoursToggleProps {
    enabled: boolean;
    onToggle: () => void;
    isExtendedHours: boolean;
}
/**
 * Toggle button for extended hours column visibility
 * Only active during pre-market (4-9:30am ET) and after-hours (4-8pm ET)
 */
export declare function ExtendedHoursToggle({ enabled, onToggle, isExtendedHours }: ExtendedHoursToggleProps): import("react/jsx-runtime").JSX.Element;
export {};
