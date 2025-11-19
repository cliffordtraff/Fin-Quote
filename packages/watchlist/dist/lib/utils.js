import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
/**
 * Utility for merging Tailwind classes
 * Combines clsx for conditional classes and tailwind-merge for deduplication
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
