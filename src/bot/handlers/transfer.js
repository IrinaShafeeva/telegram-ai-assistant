// Inter-project transfer wizard.
//
// Flow:
//   1. User taps "💸 Перевод" → startTransfer shows source project picker
//   2. User picks source via inline button (callback fb_xfer:src:<idx>)
//   3. Bot shows target picker (everything except the chosen source)
//   4. User picks target via fb_xfer:dst:<idx>
//   5. Bot asks for amount → user types a number (state TRANSFER_AMOUNT)
//   6. Bot asks for optional comment → user types or sends "-" to skip
//      (state TRANSFER_COMMENT)
//   7. transferService.create makes the linked expense + income pair.
//   8. notifyPartners pings co-participants of BOTH source and target projects.
//
// Cancellation: at any state the user can tap an inline "❌ Отмена" button
// or send /cancel.

const { projectService, transferService } = require('../../services/supabase');
const { notifyPartners, partnerLabel } = require('../../services/familyBudget');
const { stateManager, STATE_TYPES } = require('../../utils/stateManager');
const { getBot } = require('../../utils/bot');
const logger = require('../../utils/logger');

const STATE_TTL_MIN = 15;

function parseAmount(text) {
  if (!text) return NaN;
  const cleaned = String(text).trim().replace(/\s/g, '').replace(',', '.');
  const m = cleaned.match(/^-?[\d.]+/);
  return m ? parseFloat(m[0]) : NaN;
}

function projectPickerKeyboard(projects, excludeId = null, kind = 'src') {
  // Telegram callback_data is limited to 64 bytes; UUIDs fit but we use
  // an index-based scheme for safety and to keep payloads small.
  const rows = [];
  projects.forEach((p, idx) => {
    if (excludeId && p.id === excludeId) return;
    rows.push([{ text: `📋 ${p.name}`, callback_data: `fb_xfer:${kind}:${idx}` }]);
  });
  rows.push([{ text: '❌ Отмена', callback_data: 'fb_xfer:cancel' }]);
  return { inline_keyboard: rows };
}

async function loadUserProjects(userId) {
  return (await projectService.findByUserId(userId)) || [];
}

async function startTransfer(chatId, user) {
  const bot = getBot();
  const projects = await loadUserProjects(user.id);
  if (projects.length < 2) {
    await bot.sendMessage(
      chatId,
      'Для перевода нужно минимум два проекта. Сейчас доступен только один — создайте второй через «📋 Проекты».'
    );
    return;
  }
  stateManager.setState(
    chatId,
    STATE_TYPES.TRANSFER_PICK_SOURCE,
    { projects: projects.map((p) => ({ id: p.id, name: p.name })) },
    STATE_TTL_MIN
  );
  await bot.sendMessage(chatId, '💸 *Перевод между проектами*\n\nИз какого проекта переводим?', {
    parse_mode: 'Markdown',
    reply_markup: projectPickerKeyboard(projects, null, 'src')
  });
}

async function handleTransferCallback(callbackQuery) {
  const data = callbackQuery.data || '';
  if (!data.startsWith('fb_xfer:')) return false;
  const bot = getBot();
  const chatId = callbackQuery.message?.chat?.id;
  const user = callbackQuery.user;
  await bot.answerCallbackQuery(callbackQuery.id);

  const parts = data.split(':');
  const action = parts[1];

  const state = stateManager.getState(chatId);

  if (action === 'cancel') {
    stateManager.clearState(chatId);
    await bot.sendMessage(chatId, '❌ Перевод отменён.');
    return true;
  }

  if (action === 'src') {
    if (!state || state.type !== STATE_TYPES.TRANSFER_PICK_SOURCE) {
      await bot.sendMessage(chatId, 'Сессия перевода истекла. Нажмите «💸 Перевод» ещё раз.');
      return true;
    }
    const idx = parseInt(parts[2], 10);
    const projects = state.data.projects || [];
    const source = projects[idx];
    if (!source) {
      await bot.sendMessage(chatId, 'Проект не найден. Начните перевод заново.');
      stateManager.clearState(chatId);
      return true;
    }
    stateManager.setState(
      chatId,
      STATE_TYPES.TRANSFER_PICK_TARGET,
      { ...state.data, sourceProjectId: source.id, sourceName: source.name },
      STATE_TTL_MIN
    );
    await bot.sendMessage(chatId, `Источник: *${source.name}*\n\nКуда переводим?`, {
      parse_mode: 'Markdown',
      reply_markup: projectPickerKeyboard(projects, source.id, 'dst')
    });
    return true;
  }

  if (action === 'dst') {
    if (!state || state.type !== STATE_TYPES.TRANSFER_PICK_TARGET) {
      await bot.sendMessage(chatId, 'Сессия перевода истекла. Нажмите «💸 Перевод» ещё раз.');
      return true;
    }
    const idx = parseInt(parts[2], 10);
    const projects = state.data.projects || [];
    const target = projects[idx];
    if (!target || target.id === state.data.sourceProjectId) {
      await bot.sendMessage(chatId, 'Выберите другой проект-получатель.');
      return true;
    }
    stateManager.setState(
      chatId,
      STATE_TYPES.TRANSFER_AMOUNT,
      { ...state.data, targetProjectId: target.id, targetName: target.name },
      STATE_TTL_MIN
    );
    await bot.sendMessage(
      chatId,
      `Из «${state.data.sourceName}» → в «${target.name}».\n\nСумма перевода?` +
        '\n_Валюта берётся из бюджета проекта-источника (или EUR по умолчанию)._',
      { parse_mode: 'Markdown' }
    );
    return true;
  }

  return true;
}

async function handleTransferText(msg, userState) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const text = (msg.text || '').trim();
  const bot = getBot();

  if (text === '/cancel' || text === '❌ Отменить') {
    stateManager.clearState(chatId);
    await bot.sendMessage(chatId, '❌ Перевод отменён.');
    return;
  }

  if (userState.type === STATE_TYPES.TRANSFER_AMOUNT) {
    const amount = parseAmount(text);
    if (!Number.isFinite(amount) || amount <= 0) {
      await bot.sendMessage(chatId, 'Введите сумму числом (например: 5000 или 1200,50).');
      return;
    }
    stateManager.setState(
      chatId,
      STATE_TYPES.TRANSFER_COMMENT,
      { ...userState.data, amount },
      STATE_TTL_MIN
    );
    await bot.sendMessage(
      chatId,
      'Комментарий к переводу? Напишите кратко (например: «доля прибыли», «возврат долга») или отправьте «-», чтобы пропустить.'
    );
    return;
  }

  if (userState.type === STATE_TYPES.TRANSFER_COMMENT) {
    const data = userState.data;
    const comment = text === '-' || text === '' ? null : text;
    try {
      const source = await projectService.findById(data.sourceProjectId);
      const currency = source?.budget_currency || 'EUR';
      const result = await transferService.create({
        sourceProjectId: data.sourceProjectId,
        targetProjectId: data.targetProjectId,
        amount: data.amount,
        currency,
        comment,
        userId: user.id
      });
      stateManager.clearState(chatId);

      const confirmation =
        `✅ *Перевод выполнен*\n\n` +
        `💸 ${data.amount} ${currency}\n` +
        `📤 Из: ${data.sourceName}\n` +
        `📥 В: ${data.targetName}` +
        (comment ? `\n📝 ${comment}` : '') +
        `\n\n_Записан как расход в источнике и доход в получателе. В аналитике помечен как внутренний перевод и не считается за «настоящий» доход или расход._`;
      await bot.sendMessage(chatId, confirmation, { parse_mode: 'Markdown' });

      // Notify partners of both projects. notifyPartners skips the actor.
      const note = `💸 ${partnerLabel(user)} перевёл(а) ${data.amount} ${currency} из «${data.sourceName}» → в «${data.targetName}»${comment ? ` (${comment})` : ''}`;
      try {
        await notifyPartners(bot, data.sourceProjectId, user.id, note);
        if (data.targetProjectId !== data.sourceProjectId) {
          await notifyPartners(bot, data.targetProjectId, user.id, note);
        }
      } catch (notifyErr) {
        logger.warn('Transfer partner notify failed:', notifyErr);
      }

      // Best-effort Google Sheets sync for both halves.
      try {
        const googleSheetsService = require('../../services/googleSheets');
        if (result.sourceProject?.google_sheet_id) {
          await googleSheetsService.addExpenseToSheet(result.expense, data.sourceProjectId).catch((e) =>
            logger.warn('Transfer source sheet sync failed:', e.message)
          );
        }
        if (result.targetProject?.google_sheet_id) {
          await googleSheetsService.addIncomeToSheet(result.income, data.targetProjectId).catch((e) =>
            logger.warn('Transfer target sheet sync failed:', e.message)
          );
        }
      } catch (sheetErr) {
        logger.warn('Transfer sheets sync wrapper failed:', sheetErr.message);
      }
    } catch (err) {
      logger.error('Transfer create failed:', err);
      stateManager.clearState(chatId);
      const friendly = /transfer_id/i.test(err?.message || '')
        ? 'В базе нет колонки `transfer_id`. Примените миграцию `migrations/005_inter_project_transfers.sql` и попробуйте снова.'
        : `Не удалось выполнить перевод: ${err.message || err}`;
      await bot.sendMessage(chatId, `❌ ${friendly}`, { parse_mode: 'Markdown' });
    }
    return;
  }
}

module.exports = {
  startTransfer,
  handleTransferCallback,
  handleTransferText
};
