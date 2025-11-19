interface ApiError {
    type: 'API_ERROR' | 'CONFIGURATION_ERROR' | 'RATE_LIMIT' | 'NETWORK_ERROR' | 'VALIDATION_ERROR';
    message: string;
    details?: string;
    retryAfter?: number;
    timestamp: string;
}
interface ApiErrorMessageProps {
    error: ApiError | string | null;
    onRetry?: () => void;
    className?: string;
}
export default function ApiErrorMessage({ error, onRetry, className }: ApiErrorMessageProps): import("react/jsx-runtime").JSX.Element | null;
export {};
