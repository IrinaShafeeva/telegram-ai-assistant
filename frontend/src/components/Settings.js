import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Settings as SettingsIcon, User, Database, Bell } from 'lucide-react';
import axios from 'axios';

const Settings = ({ user }) => {
  const [settings, setSettings] = useState({
    taskStorage: 'supabase',
    ideaStorage: 'supabase',
    sendToPersonal: true,
    notifications: true
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/api/settings');
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError('');
      setMessage('');

      const response = await axios.post('/api/settings', settings);

      if (response.data.success) {
        setMessage('Настройки сохранены!');
      } else {
        setError(response.data.message || 'Ошибка при сохранении');
      }
    } catch (error) {
      console.error('Save settings error:', error);
      setError('Ошибка при сохранении настроек');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Link to="/" className="btn btn-secondary" style={{ padding: '8px' }}>
            <ArrowLeft size={16} />
          </Link>
          <h1>Настройки</h1>
        </div>
      </div>

      {/* User Info */}
      <div className="card">
        <h3>
          <User size={16} />
          Информация о пользователе
        </h3>
        {user && (
          <div>
            <div className="form-group">
              <label>Имя</label>
              <input
                type="text"
                className="form-control"
                value={user.first_name || ''}
                disabled
              />
            </div>
            <div className="form-group">
              <label>Фамилия</label>
              <input
                type="text"
                className="form-control"
                value={user.last_name || ''}
                disabled
              />
            </div>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                className="form-control"
                value={user.username || ''}
                disabled
              />
            </div>
            <div className="form-group">
              <label>Telegram ID</label>
              <input
                type="text"
                className="form-control"
                value={user.id || ''}
                disabled
              />
            </div>
          </div>
        )}
      </div>

      {/* Storage Settings */}
      <div className="card">
        <h3>
          <Database size={16} />
          Настройки хранения
        </h3>
        <div className="form-group">
          <label>Хранение задач</label>
          <select
            className="form-control"
            value={settings.taskStorage}
            onChange={(e) => handleSettingChange('taskStorage', e.target.value)}
          >
            <option value="supabase">Supabase (по умолчанию)</option>
            <option value="notion">Notion</option>
            <option value="sheets">Google Sheets</option>
          </select>
        </div>
        <div className="form-group">
          <label>Хранение идей</label>
          <select
            className="form-control"
            value={settings.ideaStorage}
            onChange={(e) => handleSettingChange('ideaStorage', e.target.value)}
          >
            <option value="supabase">Supabase (по умолчанию)</option>
            <option value="notion">Notion</option>
            <option value="sheets">Google Sheets</option>
          </select>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color)' }}>
          Транзакции всегда сохраняются в Google Sheets для удобства работы с финансами
        </p>
      </div>

      {/* Notification Settings */}
      <div className="card">
        <h3>
          <Bell size={16} />
          Настройки уведомлений
        </h3>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={settings.sendToPersonal}
              onChange={(e) => handleSettingChange('sendToPersonal', e.target.checked)}
            />
            Отправлять уведомления в личные сообщения
          </label>
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={settings.notifications}
              onChange={(e) => handleSettingChange('notifications', e.target.checked)}
            />
            Включить напоминания о задачах
          </label>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color)' }}>
          Напоминания отправляются в 7:00, 13:00 и 19:00 по времени Албании
        </p>
      </div>

      {/* Project Settings */}
      <div className="card">
        <h3>Настройки проектов</h3>
        <p>Проекты: GO, Glamping, Family, Cars</p>
        <p style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color)' }}>
          Для изменения настроек проектов обратитесь к администратору
        </p>
      </div>

      {/* Messages */}
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      {/* Save Button */}
      <div className="card">
        <div className="btn-group">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={loading}
          >
            <SettingsIcon size={16} />
            {loading ? 'Сохранение...' : 'Сохранить настройки'}
          </button>
          <Link to="/" className="btn btn-secondary">
            Отмена
          </Link>
        </div>
      </div>

      {/* Info */}
      <div className="card">
        <h3>О приложении</h3>
        <p>BLG Family Assistant v1.0.0</p>
        <p style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color)' }}>
          Telegram AI Assistant для управления задачами, расходами и идеями семьи
        </p>
      </div>
    </div>
  );
};

export default Settings; 