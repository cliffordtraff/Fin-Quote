'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

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

const notImplemented = async () => {
  throw new Error('Use the Fin Quote authentication flow to sign in.');
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: notImplemented,
  signInWithEmail: async () => notImplemented(),
  signUpWithEmail: async () => notImplemented(),
  logout: notImplemented,
  resendVerificationEmail: notImplemented,
  getIdToken: async () => ''
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        console.error('[watchlist] Failed to get Supabase session', error);
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const getIdToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      throw new Error('Not authenticated');
    }
    return data.session.access_token;
  };

  const value: AuthContextType = {
    user,
    loading,
    signInWithGoogle: notImplemented,
    signInWithEmail: async () => notImplemented(),
    signUpWithEmail: async () => notImplemented(),
    logout,
    resendVerificationEmail: notImplemented,
    getIdToken
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
