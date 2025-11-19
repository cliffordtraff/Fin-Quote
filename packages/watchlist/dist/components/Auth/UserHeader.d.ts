interface UserHeaderProps {
    onIncreaseText?: () => void;
    onDecreaseText?: () => void;
    canIncreaseText?: boolean;
    canDecreaseText?: boolean;
}
export default function UserHeader({ onIncreaseText, onDecreaseText, canIncreaseText, canDecreaseText }: UserHeaderProps): import("react/jsx-runtime").JSX.Element;
export {};
