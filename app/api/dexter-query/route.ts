import { NextResponse } from 'next/server'

const unavailableResponse = () => NextResponse.json(
  { error: 'Dexter is unavailable.' },
  {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  },
)

export async function GET() {
  return unavailableResponse()
}

export async function POST() {
  return unavailableResponse()
}
