'use client';

import { useState, useEffect } from 'react';

interface Stats {
  totalReminders: number;
  activeTeam: number;
  completedToday: number;
  todayReminders: number;
  trends: {
    reminders: string;
    completed: string;
    today: string;
  };
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/stats');
      const result = await response.json();
      if (result.success) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const recentReminders = [
    { emoji: '📞', text: 'Позвонить клиенту по проекту', time: '15 августа в 12:00', person: 'Мария', status: '⏳' },
    { emoji: '🤝', text: 'Встреча с командой', time: 'Сегодня в 15:00', person: '', status: '⏳' },
    { emoji: '📄', text: 'Отправить отчет', time: 'Вчера в 18:00', person: 'Алексей', status: '✅' },
    { emoji: '📝', text: 'Обновить документацию', time: '12 августа в 10:00', person: '', status: '⚠️' },
  ];

  if (loading) {
    return (
      <div className="page-pad" style={{ height: '100%', overflow: 'auto' }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: 24, marginBottom: 16 }}>⏳</div>
          <div className="secondary">Загрузка данных...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-pad" style={{ height: '100%', overflow: 'auto' }}>
      {/* Page header */}
      <div className="row" style={{ gap: 14, alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ fontSize: 46, lineHeight: 1 }}>📊</div>
        <div className="title">Dashboard</div>
      </div>

      {/* Callout */}
      <div className="callout row" style={{ alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ fontSize: 20 }}>💡</div>
        <div style={{ fontSize: 14 }}>
          Обзор активности напоминаний и команды. Здесь вы можете видеть статистику и последние обновления.
        </div>
      </div>

      {/* Stats grid */}
      {stats && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
          gap: 12,
          marginBottom: 24 
        }}>
          <div className="stat-card fade-in">
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔔</div>
            <div style={{ fontWeight: 600, fontSize: 24, marginBottom: 4 }}>{stats.totalReminders}</div>
            <div style={{ fontSize: 12, color: 'rgb(var(--secondary))' }}>Напоминаний</div>
            <div style={{ 
              fontSize: 12, 
              color: 'rgb(34, 197, 94)',
              marginTop: 4 
            }}>
              {stats.trends.reminders}
            </div>
          </div>

          <div className="stat-card fade-in" style={{ animationDelay: '0.1s' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>👥</div>
            <div style={{ fontWeight: 600, fontSize: 24, marginBottom: 4 }}>{stats.activeTeam}</div>
            <div style={{ fontSize: 12, color: 'rgb(var(--secondary))' }}>Команда</div>
          </div>

          <div className="stat-card fade-in" style={{ animationDelay: '0.2s' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 600, fontSize: 24, marginBottom: 4 }}>{stats.completedToday}</div>
            <div style={{ fontSize: 12, color: 'rgb(var(--secondary))' }}>Выполнено</div>
            <div style={{ 
              fontSize: 12, 
              color: 'rgb(34, 197, 94)',
              marginTop: 4 
            }}>
              {stats.trends.completed}
            </div>
          </div>

          <div className="stat-card fade-in" style={{ animationDelay: '0.3s' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📅</div>
            <div style={{ fontWeight: 600, fontSize: 24, marginBottom: 4 }}>{stats.todayReminders}</div>
            <div style={{ fontSize: 12, color: 'rgb(var(--secondary))' }}>Сегодня</div>
            <div style={{ 
              fontSize: 12, 
              color: 'rgb(34, 197, 94)',
              marginTop: 4 
            }}>
              {stats.trends.today}
            </div>
          </div>
        </div>
      )}

      {/* Recent reminders */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ 
          fontWeight: 600, 
          fontSize: 16, 
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span>🕐</span>
          Последние напоминания
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {recentReminders.map((reminder, index) => (
            <div key={index} className="fade-in" style={{ animationDelay: `${(index + 4) * 0.1}s` }}>
              <div className="row" style={{ 
                padding: 12, 
                borderRadius: 8, 
                border: '1px solid rgb(var(--border))',
                alignItems: 'flex-start'
              }}>
                <div style={{ fontSize: 18 }}>{reminder.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>
                    {reminder.text}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgb(var(--secondary))', marginBottom: 4 }}>
                    {reminder.time}
                  </div>
                  {reminder.person && (
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
                        {reminder.person[0]}
                      </div>
                      <span style={{ fontSize: 12, color: 'rgb(var(--secondary))' }}>
                        {reminder.person}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 16 }}>{reminder.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="card">
        <div style={{ 
          fontWeight: 600, 
          fontSize: 16, 
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span>⚡</span>
          Быстрые действия
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="row" style={{ 
            padding: 12, 
            borderRadius: 8, 
            border: '2px dashed rgb(var(--border))',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            textAlign: 'left'
          }} onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgb(99, 102, 241)';
            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.05)';
          }} onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgb(var(--border))';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}>
            <span style={{ fontSize: 20 }}>🔔</span>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Новое напоминание</div>
              <div style={{ fontSize: 12, color: 'rgb(var(--secondary))' }}>
                Создать напоминание для себя или команды
              </div>
            </div>
          </button>

          <button className="row" style={{ 
            padding: 12, 
            borderRadius: 8, 
            border: '2px dashed rgb(var(--border))',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            textAlign: 'left'
          }} onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgb(34, 197, 94)';
            e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.05)';
          }} onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgb(var(--border))';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}>
            <span style={{ fontSize: 20 }}>👥</span>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Добавить участника</div>
              <div style={{ fontSize: 12, color: 'rgb(var(--secondary))' }}>
                Пригласить нового человека в команду
              </div>
            </div>
          </button>

          <button className="row" style={{ 
            padding: 12, 
            borderRadius: 8, 
            border: '2px dashed rgb(var(--border))',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            textAlign: 'left'
          }} onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgb(168, 85, 247)';
            e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.05)';
          }} onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgb(var(--border))';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}>
            <span style={{ fontSize: 20 }}>📅</span>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Настроить календарь</div>
              <div style={{ fontSize: 12, color: 'rgb(var(--secondary))' }}>
                Подключить Google Calendar
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}