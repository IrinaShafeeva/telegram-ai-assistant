'use client';

import { useState, useEffect } from 'react';
import Dashboard from '@/components/Dashboard';
import Reminders from '@/components/Reminders';
import Calendar from '@/components/Calendar';
import Team from '@/components/Team';
import Analytics from '@/components/Analytics';
import Settings from '@/components/Settings';

// Telegram WebApp types
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        colorScheme: 'light' | 'dark';
        onEvent: (event: string, callback: () => void) => void;
        MainButton: {
          setText: (text: string) => void;
          show: () => void;
          hide: () => void;
        };
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
        };
      };
    };
  }
}

const Icon = {
  Home: () => <span>🏠</span>,
  Bell: () => <span>🔔</span>,
  Calendar: () => <span>📅</span>,
  Users: () => <span>👥</span>,
  BarChart: () => <span>📊</span>,
  Settings: () => <span>⚙️</span>,
  Back: () => <span>←</span>,
  Menu: () => <span>☰</span>,
};

export default function Home() {
  const [theme, setTheme] = useState('light');
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isMobile, setIsMobile] = useState(false);

  // Detect Telegram theme and mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const wa = window.Telegram?.WebApp;
    if (wa) {
      try {
        wa.ready();
        const isDark = wa.colorScheme === 'dark';
        setTheme(isDark ? 'dark' : 'light');
        
        // Handle theme changes
        wa.onEvent('themeChanged', () => {
          setTheme(wa.colorScheme === 'dark' ? 'dark' : 'light');
        });

        // Handle back button
        wa.BackButton.onClick(() => {
          setActiveSection('dashboard');
        });
        
        if (activeSection !== 'dashboard') {
          wa.BackButton.show();
        } else {
          wa.BackButton.hide();
        }
      } catch (error) {
        console.log('Telegram WebApp not available:', error);
      }
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, [activeSection]);

  const navItems = [
    { id: 'dashboard', title: 'Dashboard', icon: Icon.Home, emoji: '🏠' },
    { id: 'reminders', title: 'Напоминания', icon: Icon.Bell, emoji: '🔔', badge: 5 },
    { id: 'calendar', title: 'Календарь', icon: Icon.Calendar, emoji: '📅' },
    { id: 'team', title: 'Команда', icon: Icon.Users, emoji: '👥', badge: 3 },
    { id: 'analytics', title: 'Аналитика', icon: Icon.BarChart, emoji: '📊' },
    { id: 'settings', title: 'Настройки', icon: Icon.Settings, emoji: '⚙️' },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <Dashboard />;
      case 'reminders':
        return <Reminders section={activeSection} />;
      case 'calendar':
        return <Calendar />;
      case 'team':
        return <Team section={activeSection} />;
      case 'analytics':
        return <Analytics />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  const getSectionTitle = () => {
    const item = navItems.find(item => item.id === activeSection);
    return item ? item.title : 'Dashboard';
  };

  if (isMobile) {
    // Mobile layout (like Telegram Mini App)
    return (
      <div className={theme === 'dark' ? 'dark' : ''}>
        <div className="wrap bg fg">
          {/* Top bar */}
          <div className="page-pad" style={{paddingBottom: 0}}>
            <div className="row" style={{gap: 8, height: 40}}>
              {activeSection !== 'dashboard' && (
                <button 
                  className="btn-ghost" 
                  onClick={() => setActiveSection('dashboard')}
                  aria-label="Back"
                >
                  <Icon.Back />
                </button>
              )}
              <div className="subtitle">{getSectionTitle()}</div>
              <div style={{marginLeft: 'auto'}} className="row">
                <button 
                  className="btn" 
                  onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                >
                  {theme === 'dark' ? '☀️' : '🌙'}
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div style={{height: 'calc(100vh - 140px)', overflow: 'auto'}}>
            {renderContent()}
          </div>

          <div className="divider" />

          {/* Bottom navigation */}
          <div style={{ 
            height: 60, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-around',
            padding: '0 8px',
            background: 'rgb(var(--bg))',
            borderTop: '1px solid rgb(var(--border))'
          }}>
            {navItems.slice(0, 5).map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                style={{ 
                  flexDirection: 'column', 
                  gap: 4, 
                  padding: '6px 8px',
                  fontSize: 10,
                  position: 'relative'
                }}
              >
                <span style={{ fontSize: 18 }}>{item.emoji}</span>
                <span>{item.title}</span>
                {item.badge && (
                  <span style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    background: 'rgb(239 68 68)',
                    color: 'white',
                    fontSize: 10,
                    borderRadius: 10,
                    padding: '2px 6px',
                    minWidth: 16,
                    textAlign: 'center'
                  }}>
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="bg fg" style={{ display: 'flex', height: '100vh' }}>
        {/* Sidebar */}
        <div className="sidebar">
          <div className="page-pad">
            <div className="row" style={{ gap: 8, marginBottom: 20 }}>
              <span style={{ fontSize: 24 }}>🤖</span>
              <div>
                <div style={{ fontWeight: 600 }}>AI Assistant</div>
                <div className="ghost" style={{ fontSize: 12 }}>Dashboard</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {navItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                  style={{ position: 'relative' }}
                >
                  <span>{item.emoji}</span>
                  <span>{item.title}</span>
                  {item.badge && (
                    <span style={{
                      marginLeft: 'auto',
                      background: 'rgb(239 68 68)',
                      color: 'white',
                      fontSize: 10,
                      borderRadius: 10,
                      padding: '2px 6px',
                      minWidth: 16,
                      textAlign: 'center'
                    }}>
                      {item.badge}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 20 }}>
              <button 
                className="btn" 
                onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                style={{ width: '100%' }}
              >
                {theme === 'dark' ? '☀️' : '🌙'} {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}