interface StatusMessageProps {
    message: string | null;
    isError?: boolean;
    onClose?: () => void;
}
export default function StatusMessage({ message, isError, onClose }: StatusMessageProps): import("react/jsx-runtime").JSX.Element | null;
export {};
