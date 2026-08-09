import { NextResponse } from 'next/server'
import { getFastSnapshotBase } from '@/lib/fast-snapshot-base-cache'
import { fastSectionHeaderName } from '@/lib/fast-snapshot-types'

const COMPLETE_CACHE_CONTROL =
  'public, max-age=10, stale-while-revalidate=30'
const DEGRADED_CACHE_CONTROL = 'no-store'

export async function GET(request: Request) {
  const snapshot = await getFastSnapshotBase(request.signal)
  const complete = snapshot.failedSections.length === 0

  return NextResponse.json(snapshot.data, {
    headers: {
      'Cache-Control': complete
        ? COMPLETE_CACHE_CONTROL
        : DEGRADED_CACHE_CONTROL,
      'X-Cache': snapshot.cacheStatus,
      'X-Snapshot': 'fast',
      'X-Snapshot-Captured-At': snapshot.capturedAt,
      ...(complete
        ? {}
        : {
            'X-Snapshot-Degraded': snapshot.failedSections
              .map(fastSectionHeaderName)
              .join(','),
          }),
    },
  })
}
