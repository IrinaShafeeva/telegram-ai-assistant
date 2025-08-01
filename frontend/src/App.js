import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { 
  Plus, 
  DollarSign, 
  CheckSquare, 
  Lightbulb, 
  Calendar,
  BarChart3,
  Settings,
  User,
  Home
} from 'lucide-react';

// Components
import Dashboard from './components/Dashboard';
import AddEntry from './components/AddEntry';
import Analytics from './components/Analytics';
import Settings from './components/Settings';

// Telegram WebApp integration
let tg = null;
if (window.Telegram && window.Telegram.WebApp) {
  tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (tg) {
      setUser({
        id: tg.initDataUnsafe?.user?.id,
        username: tg.initDataUnsafe?.user?.username,
        first_name: tg.initDataUnsafe?.user?.first_name,
        last_name: tg.initDataUnsafe?.user?.last_name
      });
    }
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="app">
        <div className="container">
          <div className="loading">
            <p>Загрузка...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="container">
        <Router>
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route path="/add" element={<AddEntry user={user} />} />
            <Route path="/analytics" element={<Analytics user={user} />} />
            <Route path="/settings" element={<Settings user={user} />} />
          </Routes>
        </Router>
      </div>
    </div>
  );
}

export default App; 