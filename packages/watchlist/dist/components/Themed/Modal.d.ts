import { ReactNode } from 'react';
interface ThemedModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}
export default function ThemedModal({ isOpen, onClose, title, children }: ThemedModalProps): import("react").ReactPortal | null;
export {};
