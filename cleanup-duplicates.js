require('dotenv').config();
const { supabase } = require('./src/services/supabase');

async function cleanupDuplicateProjects() {
  try {
    console.log('🔍 Поиск дубликатов проектов...');
    
    // Получаем все проекты пользователя
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .eq('owner_id', 182087110) // Твой user_id
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Ошибка получения проектов:', error);
      return;
    }
    
    console.log(`📋 Найдено проектов: ${projects.length}`);
    
    // Группируем по названию
    const grouped = projects.reduce((acc, project) => {
      if (!acc[project.name]) {
        acc[project.name] = [];
      }
      acc[project.name].push(project);
      return acc;
    }, {});
    
    for (const [name, projectsGroup] of Object.entries(grouped)) {
      if (projectsGroup.length > 1) {
        console.log(`\n🔥 Дубликаты "${name}": ${projectsGroup.length} шт.`);
        
        // Оставляем самый первый (или тот что с Google Sheets)
        const keepProject = projectsGroup.find(p => p.google_sheet_id) || projectsGroup[0];
        const toDelete = projectsGroup.filter(p => p.id !== keepProject.id);
        
        console.log(`✅ Оставляем: ${keepProject.id} (${keepProject.google_sheet_id ? 'с Google Sheets' : 'первый'})`);
        console.log(`🗑️  Удаляем: ${toDelete.length} проектов`);
        
        // Удаляем дубликаты
        for (const project of toDelete) {
          const { error: deleteError } = await supabase
            .from('projects')
            .delete()
            .eq('id', project.id);
            
          if (deleteError) {
            console.error(`Ошибка удаления ${project.id}:`, deleteError);
          } else {
            console.log(`  ✅ Удален: ${project.id}`);
          }
        }
      }
    }
    
    console.log('\n🎉 Очистка завершена!');
    
  } catch (err) {
    console.error('Exception:', err);
  }
  
  process.exit(0);
}

cleanupDuplicateProjects();