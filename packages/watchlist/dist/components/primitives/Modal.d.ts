import React from 'react';
interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    className?: string;
}
export default function Modal({ isOpen, onClose, title, children, className }: ModalProps): import("react/jsx-runtime").JSX.Element | null;
export {};
