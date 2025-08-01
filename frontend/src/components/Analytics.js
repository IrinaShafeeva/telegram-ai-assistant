import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import axios from 'axios';

const Analytics = ({ user }) => {
  const [analytics, setAnalytics] = useState({
    transactions: [],
    tasks: [],
    ideas: []
  });
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  const projects = ['all', 'GO', 'Glamping', 'Family', 'Cars'];
  const periods = [
    { value: 'week', label: 'Неделя' },
    { value: 'month', label: 'Месяц' },
    { value: 'quarter', label: 'Квартал' },
    { value: 'year', label: 'Год' }
  ];

  useEffect(() => {
    fetchAnalytics();
  }, [selectedProject, selectedPeriod, fetchAnalytics]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/analytics', {
        params: {
          project: selectedProject === 'all' ? undefined : selectedProject,
          period: selectedPeriod
        }
      });
      setAnalytics(response.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount) => {
    const num = parseFloat(amount.replace(/[^\d.-]/g, ''));
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB'
    }).format(Math.abs(num));
  };

  const calculateTotalIncome = () => {
    return analytics.transactions
      .filter(t => t.amount.startsWith('+'))
      .reduce((sum, t) => sum + parseFloat(t.amount.replace(/[^\d.-]/g, '')), 0);
  };

  const calculateTotalExpenses = () => {
    return analytics.transactions
      .filter(t => t.amount.startsWith('-'))
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount.replace(/[^\d.-]/g, ''))), 0);
  };

  const getProjectStats = () => {
    const stats = {};
    projects.filter(p => p !== 'all').forEach(project => {
      const projectTransactions = analytics.transactions.filter(t => t.project === project);
      const projectTasks = analytics.tasks.filter(t => t.project === project);
      const projectIdeas = analytics.ideas.filter(t => t.project === project);
      
      stats[project] = {
        transactions: projectTransactions.length,
        tasks: projectTasks.length,
        ideas: projectIdeas.length,
        income: projectTransactions
          .filter(t => t.amount.startsWith('+'))
          .reduce((sum, t) => sum + parseFloat(t.amount.replace(/[^\d.-]/g, '')), 0),
        expenses: projectTransactions
          .filter(t => t.amount.startsWith('-'))
          .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount.replace(/[^\d.-]/g, ''))), 0)
      };
    });
    return stats;
  };

  if (loading) {
    return (
      <div className="loading">
        <p>Загрузка аналитики...</p>
      </div>
    );
  }

  const projectStats = getProjectStats();
  const totalIncome = calculateTotalIncome();
  const totalExpenses = calculateTotalExpenses();

  return (
    <div>
      {/* Header */}
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Link to="/" className="btn btn-secondary" style={{ padding: '8px' }}>
            <ArrowLeft size={16} />
          </Link>
          <h1>Аналитика</h1>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <label>Проект</label>
            <select
              className="form-control"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              {projects.map(project => (
                <option key={project} value={project}>
                  {project === 'all' ? 'Все проекты' : project}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Период</label>
            <select
              className="form-control"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              {periods.map(period => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="stats">
        <div className="stat-card">
          <div className="stat-value positive">
            <TrendingUp size={16} />
            {formatAmount(`+${totalIncome}`)}
          </div>
          <div className="stat-label">Общий доход</div>
        </div>
        <div className="stat-card">
          <div className="stat-value negative">
            <TrendingDown size={16} />
            {formatAmount(`-${totalExpenses}`)}
          </div>
          <div className="stat-label">Общие расходы</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {analytics.transactions.length}
          </div>
          <div className="stat-label">Транзакций</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {analytics.tasks.length}
          </div>
          <div className="stat-label">Задач</div>
        </div>
      </div>

      {/* Project Breakdown */}
      <div className="card">
        <h3>По проектам</h3>
        <div className="list">
          {Object.entries(projectStats).map(([project, stats]) => (
            <div key={project} className="list-item">
              <div className="list-item-content">
                <div className="list-item-title">{project}</div>
                <div className="list-item-subtitle">
                  Транзакций: {stats.transactions} • 
                  Задач: {stats.tasks} • 
                  Идей: {stats.ideas}
                </div>
              </div>
              <div className="list-item-actions">
                <div style={{ textAlign: 'right' }}>
                  <div className="amount positive">
                    +{formatAmount(`+${stats.income}`)}
                  </div>
                  <div className="amount negative">
                    -{formatAmount(`-${stats.expenses}`)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card">
        <h3>Последние транзакции</h3>
        <div className="list">
          {analytics.transactions.slice(0, 5).map((transaction) => (
            <div key={transaction.id} className="list-item">
              <div className="list-item-content">
                <div className="list-item-title">{transaction.description}</div>
                <div className="list-item-subtitle">
                  {transaction.project} • {transaction.date}
                </div>
              </div>
              <div className="list-item-actions">
                <span className={`amount ${transaction.amount.startsWith('+') ? 'positive' : 'negative'}`}>
                  {formatAmount(transaction.amount)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Tasks */}
      <div className="card">
        <h3>Активные задачи</h3>
        <div className="list">
          {analytics.tasks.slice(0, 5).map((task) => (
            <div key={task.id} className="list-item">
              <div className="list-item-content">
                <div className="list-item-title">{task.description}</div>
                <div className="list-item-subtitle">
                  {task.project} • {task.person} • {task.date}
                </div>
              </div>
              <div className="list-item-actions">
                <span className="badge badge-task">Задача</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="card">
        <div className="btn-group">
          <Link to="/" className="btn btn-primary">
            Назад
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Analytics; 