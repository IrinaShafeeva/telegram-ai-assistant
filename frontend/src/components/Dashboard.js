import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  DollarSign, 
  CheckSquare, 
  Lightbulb, 
  Calendar,
  BarChart3,
  Settings,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import axios from 'axios';

const Dashboard = ({ user }) => {
  const [stats, setStats] = useState({
    transactions: 0,
    tasks: 0,
    ideas: 0,
    totalIncome: 0,
    totalExpenses: 0
  });
  const [recentItems, setRecentItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsResponse, recentResponse] = await Promise.all([
        axios.get('/api/analytics?period=week'),
        axios.get('/api/recent')
      ]);

      setStats(statsResponse.data);
      setRecentItems(recentResponse.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getItemIcon = (type) => {
    switch (type) {
      case 'transaction':
        return <DollarSign size={16} />;
      case 'task':
        return <CheckSquare size={16} />;
      case 'idea':
        return <Lightbulb size={16} />;
      default:
        return <Calendar size={16} />;
    }
  };

  const getItemBadge = (type) => {
    switch (type) {
      case 'transaction':
        return 'badge-transaction';
      case 'task':
        return 'badge-task';
      case 'idea':
        return 'badge-idea';
      default:
        return '';
    }
  };

  const formatAmount = (amount) => {
    const num = parseFloat(amount.replace(/[^\d.-]/g, ''));
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB'
    }).format(Math.abs(num));
  };

  if (loading) {
    return (
      <div className="loading">
        <p>Загрузка данных...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="header">
        <h1>BLG Family Assistant</h1>
        <p>Управление задачами, расходами и идеями</p>
        {user && (
          <p>Привет, {user.first_name || user.username || 'пользователь'}!</p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3>Быстрые действия</h3>
        <div className="btn-group">
          <Link to="/add" className="btn btn-primary">
            <Plus size={16} />
            Добавить
          </Link>
          <Link to="/analytics" className="btn btn-secondary">
            <BarChart3 size={16} />
            Аналитика
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="stats">
        <div className="stat-card">
          <div className="stat-value">{stats.transactions}</div>
          <div className="stat-label">Транзакции</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.tasks}</div>
          <div className="stat-label">Задачи</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.ideas}</div>
          <div className="stat-label">Идеи</div>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="card">
        <h3>Финансы за неделю</h3>
        <div className="stats">
          <div className="stat-card">
            <div className="stat-value positive">
              <TrendingUp size={16} />
              {formatAmount(stats.totalIncome)}
            </div>
            <div className="stat-label">Доходы</div>
          </div>
          <div className="stat-card">
            <div className="stat-value negative">
              <TrendingDown size={16} />
              {formatAmount(stats.totalExpenses)}
            </div>
            <div className="stat-label">Расходы</div>
          </div>
        </div>
      </div>

      {/* Recent Items */}
      <div className="card">
        <h3>Последние записи</h3>
        <div className="list">
          {recentItems.length > 0 ? (
            recentItems.map((item) => (
              <div key={item.id} className="list-item">
                <div className="list-item-content">
                  <div className="list-item-title">
                    {getItemIcon(item.type)}
                    {item.description}
                  </div>
                  <div className="list-item-subtitle">
                    {item.project} • {item.date}
                    {item.amount && (
                      <span className={`amount ${item.amount.startsWith('+') ? 'positive' : 'negative'}`}>
                        {formatAmount(item.amount)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="list-item-actions">
                  <span className={`badge ${getItemBadge(item.type)}`}>
                    {item.type}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p>Нет записей</p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="card">
        <div className="btn-group">
          <Link to="/add" className="btn btn-primary">
            <Plus size={16} />
            Добавить запись
          </Link>
          <Link to="/settings" className="btn btn-secondary">
            <Settings size={16} />
            Настройки
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 