'use client';

import { 
  Calendar, 
  Users, 
  Settings, 
  Bell, 
  BarChart3,
  Home,
  ChevronDown,
  ChevronRight,
  Plus
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

interface NavItem {
  id: string;
  title: string;
  icon: React.ElementType;
  badge?: number;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: Home,
  },
  {
    id: 'reminders',
    title: 'Напоминания',
    icon: Bell,
    badge: 5,
    children: [
      { id: 'reminders-all', title: 'Все напоминания', icon: Bell },
      { id: 'reminders-today', title: 'Сегодня', icon: Calendar },
      { id: 'reminders-upcoming', title: 'Предстоящие', icon: Calendar },
    ]
  },
  {
    id: 'calendar',
    title: 'Календарь',
    icon: Calendar,
  },
  {
    id: 'team',
    title: 'Команда',
    icon: Users,
    badge: 3,
    children: [
      { id: 'team-members', title: 'Участники', icon: Users },
      { id: 'team-add', title: 'Добавить', icon: Plus },
    ]
  },
  {
    id: 'analytics',
    title: 'Аналитика',
    icon: BarChart3,
  },
  {
    id: 'settings',
    title: 'Настройки',
    icon: Settings,
  },
];

export default function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(['reminders', 'team']));

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const renderNavItem = (item: NavItem, level: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.id);
    const isActive = activeSection === item.id;
    const Icon = item.icon;

    return (
      <div key={item.id} className="select-none">
        <div
          className={clsx(
            'group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-all duration-150',
            level === 0 ? 'pl-2' : 'pl-6',
            isActive 
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' 
              : 'hover:bg-[color:var(--hover)] text-[color:var(--foreground)]',
            'notion-card'
          )}
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(item.id);
            } else {
              onSectionChange(item.id);
            }
          }}
        >
          {hasChildren && (
            <div className="flex items-center justify-center w-4 h-4">
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-gray-500" />
              ) : (
                <ChevronRight className="w-3 h-3 text-gray-500" />
              )}
            </div>
          )}
          
          <Icon className={clsx(
            'w-4 h-4 flex-shrink-0',
            hasChildren ? '' : level === 0 ? 'ml-4' : '',
            isActive ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500'
          )} />
          
          <span className={clsx(
            'text-sm font-medium flex-1',
            isActive ? 'text-blue-700 dark:text-blue-300' : ''
          )}>
            {item.title}
          </span>
          
          {item.badge && (
            <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {item.badge}
            </span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="ml-2 mt-1 space-y-1 slide-in">
            {item.children!.map((child) => renderNavItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-64 h-screen bg-[color:var(--sidebar)] border-r border-[color:var(--border)] flex flex-col">
      {/* Header */}
      <div className="px-4 py-6 border-b border-[color:var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-md flex items-center justify-center">
            <Bell className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-[color:var(--foreground)]">AI Assistant</h1>
            <p className="text-xs text-gray-500">Dashboard</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-2 space-y-1">
          {navItems.map((item) => renderNavItem(item))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-[color:var(--border)]">
        <div className="flex items-center gap-3 p-2 rounded-md hover:bg-[color:var(--hover)] transition-colors cursor-pointer">
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
            И
          </div>
          <div className="text-sm">
            <div className="font-medium text-[color:var(--foreground)]">Ирина</div>
            <div className="text-gray-500 text-xs">Администратор</div>
          </div>
        </div>
      </div>
    </div>
  );
}