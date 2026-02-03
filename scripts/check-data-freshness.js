#!/usr/bin/env node
/**
 * Check data freshness and warn if stale
 *
 * This script runs quickly on dev server startup to remind you
 * when the US stocks registry needs refreshing.
 *
 * Checks:
 * - US stocks registry last updated date
 * - Warns if older than 7 days
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load .env.local
function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  } catch {
    // .env.local not found, skip
  }
}

// Simple fetch using https module (no external deps)
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout'));
    }, 5000); // 5 second timeout

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function checkFreshness() {
  loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // No env vars, skip check silently
    return;
  }

  try {
    // Query the most recent updated_at from us_stocks
    const url = `${supabaseUrl}/rest/v1/us_stocks?select=updated_at&order=updated_at.desc&limit=1`;

    const data = await fetchJson(url + `&apikey=${supabaseKey}`);

    if (!data || !data[0] || !data[0].updated_at) {
      // No data or table doesn't exist, skip
      return;
    }

    const lastUpdated = new Date(data[0].updated_at);
    const now = new Date();
    const daysSinceUpdate = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));

    if (daysSinceUpdate >= 7) {
      const dateStr = lastUpdated.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });

      console.log('');
      console.log('\x1b[33m┌─────────────────────────────────────────────────────┐\x1b[0m');
      console.log('\x1b[33m│\x1b[0m  \x1b[33m⚠️  US stocks data is ' + daysSinceUpdate + ' days old (last: ' + dateStr + ')\x1b[0m'.padEnd(60) + '\x1b[33m│\x1b[0m');
      console.log('\x1b[33m│\x1b[0m     Run: \x1b[36mnpm run refresh:stocks\x1b[0m'.padEnd(67) + '\x1b[33m│\x1b[0m');
      console.log('\x1b[33m└─────────────────────────────────────────────────────┘\x1b[0m');
      console.log('');
    }
  } catch {
    // Silently fail - don't block dev server for network issues
  }
}

checkFreshness();
