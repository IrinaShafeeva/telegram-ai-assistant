import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Mock data for now - will connect to Supabase later
    const stats = {
      totalReminders: 24,
      activeTeam: 5, 
      completedToday: 16,
      todayReminders: 8,
      trends: {
        reminders: '+12%',
        completed: '+8',
        today: '+3'
      }
    };

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}