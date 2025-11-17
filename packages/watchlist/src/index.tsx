'use client';

import './globals.css';
import WatchlistPage from './app/watchlist/page';
import { AuthProvider } from '@watchlist/lib/firebase/auth-context';
import { AiSummaryCacheProvider } from '@watchlist/contexts/AiSummaryContext';
import { ThemeProvider } from '@watchlist/components/ThemeProvider';

export function SundayWatchlistApp(props?: Record<string, unknown>) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AiSummaryCacheProvider>
          <WatchlistPage {...props} />
        </AiSummaryCacheProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
