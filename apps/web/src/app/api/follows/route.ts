import { NextResponse } from 'next/server';

// The follow system has been replaced with mutual friendships.
// Use /api/friends instead.
export async function GET() {
  return NextResponse.json({ error: 'This endpoint has moved to /api/friends' }, { status: 410 });
}
export async function POST() {
  return NextResponse.json({ error: 'This endpoint has moved to /api/friends' }, { status: 410 });
}
export async function DELETE() {
  return NextResponse.json({ error: 'This endpoint has moved to /api/friends' }, { status: 410 });
}
