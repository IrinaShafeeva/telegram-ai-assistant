import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Mock reminders data
    const reminders = [
      {
        id: 1,
        emoji: '📞',
        title: 'Позвонить клиенту по проекту',
        time: '15 августа в 12:00',
        assignee: 'Мария',
        status: 'pending',
        type: 'team'
      },
      {
        id: 2,
        emoji: '🤝',
        title: 'Встреча с командой',
        time: 'Сегодня в 15:00',
        assignee: null,
        status: 'pending',
        type: 'personal'
      },
      {
        id: 3,
        emoji: '📄',
        title: 'Отправить отчет',
        time: 'Вчера в 18:00',
        assignee: 'Алексей',
        status: 'completed',
        type: 'team'
      },
      {
        id: 4,
        emoji: '📝',
        title: 'Обновить документацию',
        time: '12 августа в 10:00',
        assignee: null,
        status: 'overdue',
        type: 'personal'
      }
    ];

    return NextResponse.json({ success: true, data: reminders });
  } catch (error) {
    console.error('Reminders API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reminders' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, time, assignee, type } = body;

    // Validate required fields
    if (!title || !time) {
      return NextResponse.json(
        { success: false, error: 'Title and time are required' },
        { status: 400 }
      );
    }

    // Mock creation response
    const newReminder = {
      id: Date.now(),
      emoji: '🔔',
      title,
      time,
      assignee,
      status: 'pending',
      type: type || 'personal'
    };

    return NextResponse.json({ 
      success: true, 
      data: newReminder,
      message: 'Reminder created successfully' 
    });
  } catch (error) {
    console.error('Create reminder API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create reminder' },
      { status: 500 }
    );
  }
}