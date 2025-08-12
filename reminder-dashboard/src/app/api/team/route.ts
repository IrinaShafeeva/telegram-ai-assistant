import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Mock team data
    const teamMembers = [
      {
        id: 1,
        name: 'Мария Петрова',
        email: 'maria@example.com',
        timezone: 'Europe/Moscow',
        calendarId: 'maria.petrova@gmail.com',
        activeReminders: 3,
        completedToday: 1,
        avatar: 'М'
      },
      {
        id: 2,
        name: 'Алексей Иванов',
        email: 'alex@example.com',
        timezone: 'Europe/Kiev',
        calendarId: 'alex.ivanov@gmail.com',
        activeReminders: 2,
        completedToday: 4,
        avatar: 'А'
      },
      {
        id: 3,
        name: 'Елена Сидорова',
        email: 'elena@example.com',
        timezone: 'Europe/Moscow',
        calendarId: 'elena.sidorova@gmail.com',
        activeReminders: 1,
        completedToday: 2,
        avatar: 'Е'
      }
    ];

    return NextResponse.json({ success: true, data: teamMembers });
  } catch (error) {
    console.error('Team API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch team' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, timezone, calendarId } = body;

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json(
        { success: false, error: 'Name and email are required' },
        { status: 400 }
      );
    }

    // Mock creation response
    const newMember = {
      id: Date.now(),
      name,
      email,
      timezone: timezone || 'Europe/Moscow',
      calendarId,
      activeReminders: 0,
      completedToday: 0,
      avatar: name[0].toUpperCase()
    };

    return NextResponse.json({ 
      success: true, 
      data: newMember,
      message: 'Team member added successfully' 
    });
  } catch (error) {
    console.error('Add team member API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add team member' },
      { status: 500 }
    );
  }
}