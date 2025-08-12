'use client';

interface TeamProps {
  section: string;
}

export default function Team({ section }: TeamProps) {
  const getSectionTitle = () => {
    switch (section) {
      case 'team-add':
        return 'Добавить участника';
      default:
        return 'Команда';
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-[color:var(--foreground)] mb-6">
          {getSectionTitle()}
        </h1>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-[color:var(--border)] p-8 text-center">
          <p className="text-gray-500">Компонент команды в разработке...</p>
        </div>
      </div>
    </div>
  );
}