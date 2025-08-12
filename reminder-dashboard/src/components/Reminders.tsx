'use client';

import { useState, useEffect } from 'react';

interface Reminder {
  id: number;
  emoji: string;
  title: string;
  time: string;
  assignee?: string | null;
  status: 'pending' | 'completed' | 'overdue';
  type: 'personal' | 'team';
}

interface RemindersProps {
  section: string;
}

export default function Reminders({ section }: RemindersProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newReminder, setNewReminder] = useState({
    title: '',
    time: '',
    assignee: '',
    type: 'personal' as 'personal' | 'team'
  });

  useEffect(() => {
    fetchReminders();
  }, []);

  const fetchReminders = async () => {
    try {
      const response = await fetch('/api/reminders');
      const result = await response.json();
      if (result.success) {
        setReminders(result.data);
      }
    } catch (error) {
      console.error('Error fetching reminders:', error);
    } finally {
      setLoading(false);
    }
  };

  const createReminder = async () => {
    console.log('🔔 Создаем напоминание:', newReminder);
    
    if (!newReminder.title || !newReminder.time) {
      console.log('❌ Не хватает данных:', { title: newReminder.title, time: newReminder.time });
      return;
    }

    try {
      console.log('📤 Отправляем запрос на основной backend...');
      
      // Get Telegram Web App data
      const telegram = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: unknown } } })?.Telegram;
      const tgWebAppData = telegram?.WebApp?.initDataUnsafe || { user: { id: 123456, first_name: 'Test' } };
      
      console.log('📱 Telegram Web App data:', tgWebAppData);
      
      const response = await fetch('https://ai-assist-production.up.railway.app/api/mini-app/reminders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newReminder,
          tgWebAppData
        }),
      });

      console.log('📥 Получен ответ:', response.status);
      const result = await response.json();
      console.log('📋 Данные ответа:', result);
      
      if (result.success) {
        setReminders([result.data, ...reminders]);
        setNewReminder({ title: '', time: '', assignee: '', type: 'personal' });
        setShowCreateForm(false);
        console.log('✅ Напоминание создано в основном боте и календаре!');
        
        // Show success message to user
        const telegramWebApp = (window as unknown as { Telegram?: { WebApp?: { showAlert?: (message: string) => void } } })?.Telegram?.WebApp;
        if (telegramWebApp?.showAlert) {
          telegramWebApp.showAlert('✅ Напоминание создано и добавлено в календарь!');
        }
      } else {
        console.log('❌ Ошибка создания:', result.error);
        const telegramWebApp = (window as unknown as { Telegram?: { WebApp?: { showAlert?: (message: string) => void } } })?.Telegram?.WebApp;
        if (telegramWebApp?.showAlert) {
          telegramWebApp.showAlert(`❌ Ошибка: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка запроса:', error);
      const telegramWebApp = (window as unknown as { Telegram?: { WebApp?: { showAlert?: (message: string) => void } } })?.Telegram?.WebApp;
      if (telegramWebApp?.showAlert) {
        telegramWebApp.showAlert(`❌ Ошибка подключения к серверу: ${(error as Error).message}`);
      }
    }
  };

  const toggleReminderStatus = (id: number) => {
    setReminders(reminders.map(reminder => 
      reminder.id === id 
        ? { ...reminder, status: reminder.status === 'completed' ? 'pending' : 'completed' as const }
        : reminder
    ));
  };

  const getSectionTitle = () => {
    switch (section) {
      case 'reminders-today':
        return 'Напоминания на сегодня';
      case 'reminders-upcoming':
        return 'Предстоящие напоминания';
      default:
        return 'Все напоминания';
    }
  };

  const getFilteredReminders = () => {
    switch (section) {
      case 'reminders-today':
        return reminders.filter(r => r.time.includes('Сегодня'));
      case 'reminders-upcoming':
        return reminders.filter(r => r.status === 'pending' && !r.time.includes('Сегодня'));
      default:
        return reminders;
    }
  };

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'completed': return '✅';
      case 'overdue': return '⚠️';
      default: return '⏳';
    }
  };

  if (loading) {
    return (
      <div className="page-pad" style={{ height: '100%', overflow: 'auto' }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: 24, marginBottom: 16 }}>⏳</div>
          <div className="secondary">Загрузка напоминаний...</div>
        </div>
      </div>
    );
  }

  const filteredReminders = getFilteredReminders();

  return (
    <div className="page-pad" style={{ height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div className="row" style={{ gap: 14, alignItems: 'flex-end', marginBottom: 16, justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-end' }}>
          <div style={{ fontSize: 46, lineHeight: 1 }}>🔔</div>
          <div className="title">{getSectionTitle()}</div>
        </div>
        <button 
          className="btn"
          onClick={() => setShowCreateForm(true)}
        >
          ➕ Создать
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>
            ➕ Новое напоминание
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              placeholder="Что напомнить?"
              value={newReminder.title}
              onChange={(e) => setNewReminder({ ...newReminder, title: e.target.value })}
              className="form-input"
            />
            
            <input
              type="text"
              placeholder="Когда? (например: завтра в 15:00, 15 августа в 12:00)"
              value={newReminder.time}
              onChange={(e) => setNewReminder({ ...newReminder, time: e.target.value })}
              className="form-input"
            />

            <div className="row" style={{ gap: 12 }}>
              <select
                value={newReminder.type}
                onChange={(e) => setNewReminder({ ...newReminder, type: e.target.value as 'personal' | 'team' })}
                className="form-select"
                style={{ flex: 1 }}
              >
                <option value="personal">👤 Личное</option>
                <option value="team">👥 Для команды</option>
              </select>

              {newReminder.type === 'team' && (
                <input
                  type="text"
                  placeholder="Кому? (например: Мария)"
                  value={newReminder.assignee}
                  onChange={(e) => setNewReminder({ ...newReminder, assignee: e.target.value })}
                  className="form-input"
                  style={{ flex: 1 }}
                />
              )}
            </div>

            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button 
                className="btn-ghost"
                onClick={() => setShowCreateForm(false)}
              >
                Отмена
              </button>
              <button 
                className="btn"
                onClick={() => {
                  console.log('👆 Нажата кнопка Создать');
                  createReminder();
                }}
                disabled={!newReminder.title || !newReminder.time}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="row" style={{ gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button 
          className={`btn ${section === 'reminders' ? 'active' : ''}`}
          style={{ 
            fontSize: 12,
            background: section === 'reminders' ? 'rgb(var(--muted))' : 'rgb(var(--bg))'
          }}
        >
          Все ({reminders.length})
        </button>
        <button 
          className={`btn ${section === 'reminders-today' ? 'active' : ''}`}
          style={{ 
            fontSize: 12,
            background: section === 'reminders-today' ? 'rgb(var(--muted))' : 'rgb(var(--bg))'
          }}
        >
          Сегодня ({reminders.filter(r => r.time.includes('Сегодня')).length})
        </button>
        <button 
          className={`btn ${section === 'reminders-upcoming' ? 'active' : ''}`}
          style={{ 
            fontSize: 12,
            background: section === 'reminders-upcoming' ? 'rgb(var(--muted))' : 'rgb(var(--bg))'
          }}
        >
          Предстоящие ({reminders.filter(r => r.status === 'pending' && !r.time.includes('Сегодня')).length})
        </button>
      </div>

      {/* Reminders list */}
      {filteredReminders.length === 0 ? (
        <div className="callout" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>📝</div>
          <div>Нет напоминаний в этом разделе</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredReminders.map((reminder, index) => (
            <div key={reminder.id} className="card fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <button
                  onClick={() => toggleReminderStatus(reminder.id)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    border: '1px solid rgb(var(--border))',
                    background: reminder.status === 'completed' ? 'rgb(34, 197, 94)' : 'rgb(var(--bg))',
                    color: reminder.status === 'completed' ? 'white' : 'rgb(var(--fg))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  {reminder.status === 'completed' ? '✓' : ''}
                </button>

                <div style={{ fontSize: 18, flexShrink: 0 }}>{reminder.emoji}</div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontWeight: 500, 
                    fontSize: 14, 
                    marginBottom: 4,
                    textDecoration: reminder.status === 'completed' ? 'line-through' : 'none',
                    opacity: reminder.status === 'completed' ? 0.6 : 1
                  }}>
                    {reminder.title}
                  </div>
                  
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <span className="secondary" style={{ fontSize: 12 }}>
                      {reminder.time}
                    </span>
                    {reminder.type === 'team' && (
                      <span style={{ 
                        fontSize: 10, 
                        background: 'rgb(var(--muted))', 
                        padding: '2px 6px', 
                        borderRadius: 4 
                      }}>
                        👥 Команда
                      </span>
                    )}
                  </div>
                  
                  {reminder.assignee && (
                    <div className="row" style={{ gap: 6 }}>
                      <div style={{ 
                        width: 16, 
                        height: 16, 
                        borderRadius: '50%', 
                        backgroundColor: 'rgb(var(--muted))', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 600
                      }}>
                        {reminder.assignee[0].toUpperCase()}
                      </div>
                      <span className="secondary" style={{ fontSize: 12 }}>
                        {reminder.assignee}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 16, flexShrink: 0 }}>
                  {getStatusEmoji(reminder.status)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}