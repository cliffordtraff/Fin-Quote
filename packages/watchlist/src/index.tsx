'use client';

import type { ReactNode } from 'react';
import './globals.css';
import WatchlistPage from './app/watchlist/page';
import { AuthProvider } from '@watchlist/lib/firebase/auth-context';
import { AiSummaryCacheProvider } from '@watchlist/contexts/AiSummaryContext';
import { ThemeProvider } from '@watchlist/components/ThemeProvider';

interface SundayWatchlistAppProps {
  header?: ReactNode;
  [key: string]: unknown;
}

export function SundayWatchlistApp({ header, ...props }: SundayWatchlistAppProps = {}) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AiSummaryCacheProvider>
          <>
            {header}
            <WatchlistPage {...props} />
          </>
        </AiSummaryCacheProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
