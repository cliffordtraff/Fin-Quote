import { ButtonHTMLAttributes } from 'react';
export interface ThemedButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'danger' | 'success';
    size?: 'sm' | 'md' | 'lg';
}
declare const ThemedButton: import("react").ForwardRefExoticComponent<ThemedButtonProps & import("react").RefAttributes<HTMLButtonElement>>;
export default ThemedButton;
