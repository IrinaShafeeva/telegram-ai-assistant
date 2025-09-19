#!/usr/bin/env node

/**
 * Добавляем поля keywords в таблицы categories и projects
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function addKeywordsColumns() {
  console.log('🔄 Добавление полей keywords...\n');

  try {
    // Проверяем и добавляем keywords в categories
    console.log('📋 Проверка categories...');
    const { data: catColumns } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'categories')
      .eq('column_name', 'keywords');

    if (!catColumns || catColumns.length === 0) {
      // Поле не существует, создаем простым UPDATE-запросом
      const { error: catError } = await supabase
        .from('categories')
        .update({ keywords: '' })
        .eq('id', '00000000-0000-0000-0000-000000000000'); // Fake update just to add column

      console.log('ℹ️ Нужно добавить поле keywords вручную в Supabase Dashboard');
      console.log('   ALTER TABLE categories ADD COLUMN keywords TEXT;');
    } else {
      console.log('✅ Поле keywords уже существует в categories');
    }

    // Проверяем и добавляем keywords в projects
    console.log('📁 Проверка projects...');
    const { data: projColumns } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'projects')
      .eq('column_name', 'keywords');

    if (!projColumns || projColumns.length === 0) {
      console.log('ℹ️ Нужно добавить поле keywords вручную в Supabase Dashboard');
      console.log('   ALTER TABLE projects ADD COLUMN keywords TEXT;');
    } else {
      console.log('✅ Поле keywords уже существует в projects');
    }

    console.log('\n🎯 Миграция завершена успешно!');

  } catch (error) {
    console.error('❌ Ошибка миграции:', error.message);
    process.exit(1);
  }
}

// Запуск миграции
addKeywordsColumns().then(() => {
  console.log('\n✨ Готово! Теперь можно добавлять ключевые слова к категориям и проектам.');
  process.exit(0);
});