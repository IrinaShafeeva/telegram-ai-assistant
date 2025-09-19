#!/usr/bin/env node

/**
 * Простой скрипт для добавления поля keywords
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function addKeywords() {
  console.log('🔄 Добавление поля keywords...\n');

  try {
    // Проверяем категории
    console.log('📋 Тестирование записи в custom_categories...');
    const { data: testCategory, error: testError } = await supabase
      .from('custom_categories')
      .select('*')
      .limit(1);

    if (testError) {
      console.log('❌ Ошибка чтения categories:', testError.message);
    } else {
      console.log('✅ Чтение categories работает');

      // Пробуем обновить с keywords
      if (testCategory && testCategory.length > 0) {
        const { error: updateError } = await supabase
          .from('categories')
          .update({ keywords: 'test' })
          .eq('id', testCategory[0].id);

        if (updateError) {
          console.log('❌ Поле keywords отсутствует в categories:', updateError.message);
          console.log('📝 Нужно выполнить в Supabase Dashboard:');
          console.log('   ALTER TABLE categories ADD COLUMN keywords TEXT;');
        } else {
          console.log('✅ Поле keywords существует в categories');

          // Откатываем тестовое значение
          await supabase
            .from('categories')
            .update({ keywords: null })
            .eq('id', testCategory[0].id);
        }
      }
    }

    console.log('\n📁 Тестирование записи в projects...');
    const { data: testProject, error: testProjError } = await supabase
      .from('projects')
      .select('*')
      .limit(1);

    if (testProjError) {
      console.log('❌ Ошибка чтения projects:', testProjError.message);
    } else {
      console.log('✅ Чтение projects работает');

      // Пробуем обновить с keywords
      if (testProject && testProject.length > 0) {
        const { error: updateError } = await supabase
          .from('projects')
          .update({ keywords: 'test' })
          .eq('id', testProject[0].id);

        if (updateError) {
          console.log('❌ Поле keywords отсутствует в projects:', updateError.message);
          console.log('📝 Нужно выполнить в Supabase Dashboard:');
          console.log('   ALTER TABLE projects ADD COLUMN keywords TEXT;');
        } else {
          console.log('✅ Поле keywords существует в projects');

          // Откатываем тестовое значение
          await supabase
            .from('projects')
            .update({ keywords: null })
            .eq('id', testProject[0].id);
        }
      }
    }

    console.log('\n🎯 Тестирование завершено!');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

addKeywords().then(() => {
  console.log('\n📋 SQL команды для Supabase Dashboard:');
  console.log('ALTER TABLE categories ADD COLUMN keywords TEXT;');
  console.log('ALTER TABLE projects ADD COLUMN keywords TEXT;');
  console.log('\n✨ После выполнения команд функционал ключевых слов будет работать!');
  process.exit(0);
});