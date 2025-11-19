import { ReactNode } from 'react';
interface ContextMenuProps {
    isOpen: boolean;
    x: number;
    y: number;
    onClose: () => void;
    children: ReactNode;
}
export default function ContextMenu({ isOpen, x, y, onClose, children }: ContextMenuProps): import("react").ReactPortal | null;
interface ContextMenuItemProps {
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    children: ReactNode;
}
export declare function ContextMenuItem({ onClick, disabled, danger, children }: ContextMenuItemProps): import("react/jsx-runtime").JSX.Element;
export {};
