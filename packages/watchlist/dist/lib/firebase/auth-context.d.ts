import type { User } from '@supabase/supabase-js';
interface AuthContextType {
    user: User | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signInWithEmail: (email: string, password: string, rememberMe: boolean) => Promise<void>;
    signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
    logout: () => Promise<void>;
    resendVerificationEmail: () => Promise<void>;
    getIdToken: () => Promise<string>;
}
export declare const useAuth: () => AuthContextType;
export declare function AuthProvider({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export {};
