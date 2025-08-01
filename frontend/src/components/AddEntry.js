import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  DollarSign, 
  CheckSquare, 
  Lightbulb, 
  ArrowLeft,
  Save
} from 'lucide-react';
import axios from 'axios';

const AddEntry = ({ user }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('transaction');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    type: 'transaction',
    project: 'Family',
    description: '',
    amount: '',
    budgetFrom: '',
    person: '',
    date: new Date().toISOString().slice(0, 10),
    repeatType: '',
    repeatUntil: ''
  });

  const projects = ['GO', 'Glamping', 'Family', 'Cars'];
  const persons = ['Саша', 'Ира'];

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setFormData(prev => ({ ...prev, type: tab }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await axios.post('/api/submit', {
        ...formData,
        telegramChatId: user?.id?.toString() || 'web-app'
      });

      if (response.data.success) {
        setMessage('Запись успешно добавлена!');
        setTimeout(() => {
          navigate('/');
        }, 1500);
      } else {
        setError(response.data.message || 'Ошибка при сохранении');
      }
    } catch (error) {
      console.error('Submit error:', error);
      setError('Ошибка при отправке данных');
    } finally {
      setLoading(false);
    }
  };

  const renderTransactionForm = () => (
    <>
      <div className="form-group">
        <label>Сумма</label>
        <input
          type="text"
          name="amount"
          className="form-control"
          placeholder="+1000 или -500"
          value={formData.amount}
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="form-group">
        <label>Источник бюджета (опционально)</label>
        <input
          type="text"
          name="budgetFrom"
          className="form-control"
          placeholder="Карта, наличные, и т.д."
          value={formData.budgetFrom}
          onChange={handleInputChange}
        />
      </div>
    </>
  );

  const renderTaskForm = () => (
    <>
      <div className="form-group">
        <label>Ответственный</label>
        <select
          name="person"
          className="form-control"
          value={formData.person}
          onChange={handleInputChange}
        >
          <option value="">Выберите ответственного</option>
          {persons.map(person => (
            <option key={person} value={person}>{person}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>Дата выполнения</label>
        <input
          type="date"
          name="date"
          className="form-control"
          value={formData.date}
          onChange={handleInputChange}
        />
      </div>
      <div className="form-group">
        <label>Повторение</label>
        <select
          name="repeatType"
          className="form-control"
          value={formData.repeatType}
          onChange={handleInputChange}
        >
          <option value="">Без повторения</option>
          <option value="ежедневно">Ежедневно</option>
          <option value="еженедельно">Еженедельно</option>
          <option value="ежемесячно">Ежемесячно</option>
        </select>
      </div>
      {formData.repeatType && (
        <div className="form-group">
          <label>Повторять до</label>
          <input
            type="date"
            name="repeatUntil"
            className="form-control"
            value={formData.repeatUntil}
            onChange={handleInputChange}
          />
        </div>
      )}
    </>
  );

  const renderIdeaForm = () => (
    <div className="form-group">
      <label>Описание идеи</label>
      <textarea
        name="description"
        className="form-control"
        placeholder="Опишите вашу идею..."
        value={formData.description}
        onChange={handleInputChange}
        rows="4"
        required
      />
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Link to="/" className="btn btn-secondary" style={{ padding: '8px' }}>
            <ArrowLeft size={16} />
          </Link>
          <h1>Добавить запись</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'transaction' ? 'active' : ''}`}
          onClick={() => handleTabChange('transaction')}
        >
          <DollarSign size={16} />
          Транзакция
        </button>
        <button
          className={`tab ${activeTab === 'task' ? 'active' : ''}`}
          onClick={() => handleTabChange('task')}
        >
          <CheckSquare size={16} />
          Задача
        </button>
        <button
          className={`tab ${activeTab === 'idea' ? 'active' : ''}`}
          onClick={() => handleTabChange('idea')}
        >
          <Lightbulb size={16} />
          Идея
        </button>
      </div>

      {/* Form */}
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Проект</label>
            <select
              name="project"
              className="form-control"
              value={formData.project}
              onChange={handleInputChange}
              required
            >
              {projects.map(project => (
                <option key={project} value={project}>{project}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Описание</label>
            <input
              type="text"
              name="description"
              className="form-control"
              placeholder="Введите описание..."
              value={formData.description}
              onChange={handleInputChange}
              required
            />
          </div>

          {/* Type-specific fields */}
          {activeTab === 'transaction' && renderTransactionForm()}
          {activeTab === 'task' && renderTaskForm()}
          {activeTab === 'idea' && renderIdeaForm()}

          {/* Messages */}
          {error && <div className="error">{error}</div>}
          {message && <div className="success">{message}</div>}

          {/* Submit Button */}
          <div className="btn-group">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              <Save size={16} />
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
            <Link to="/" className="btn btn-secondary">
              Отмена
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEntry; 