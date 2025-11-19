interface ActionsDropdownProps {
    onDeleteMode: () => void;
    onReorderMode: () => void;
    onAddHeader: () => void;
    isTabReorderMode: boolean;
    deleteMode: boolean;
    reorderMode: boolean;
}
export default function ActionsDropdown({ onDeleteMode, onReorderMode, onAddHeader, isTabReorderMode, deleteMode, reorderMode }: ActionsDropdownProps): import("react/jsx-runtime").JSX.Element;
export {};
