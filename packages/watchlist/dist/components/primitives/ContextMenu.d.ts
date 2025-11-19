interface ContextMenuItem {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'danger';
    disabled?: boolean;
    title?: string;
}
interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps): import("react/jsx-runtime").JSX.Element;
export {};
