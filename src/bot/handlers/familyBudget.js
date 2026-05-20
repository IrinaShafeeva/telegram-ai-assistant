const { userService, projectService, projectMemberService } = require('../../services/supabase');
const {
  familyProjectService,
  plannedPaymentService,
  plannedIncomeService,
  debtService,
  floatingIncomeService,
  notifyPartners,
  partnerLabel
} = require('../../services/familyBudget');
const { getMonthReality, formatMonthRealityMessage } = require('../../services/monthReality');
const { formatDaysLeft, formatDateRu, sortByUpcoming } = require('../../utils/budgetDates');
const { stateManager, STATE_TYPES } = require('../../utils/stateManager');
const { getMainMenuKeyboard } = require('../keyboards/reply');
const {
  listsMenuKeyboard,
  listActionsKeyboard,
  listRowKeyboard,
  realityActionsKeyboard,
  updateBroadcastKeyboard,
  confirmDeleteKeyboard,
  onboardingSkipKeyboard
} = require('../keyboards/familyBudget');
const { LUMIK_UPDATE_MESSAGE } = require('../../config/constants');
const { getBot } = require('../../utils/bot');
const logger = require('../../utils/logger');

function parseAmount(text) {
  const cleaned = text.replace(/\s/g, '').replace(',', '.');
  const m = cleaned.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : NaN;
}

function parseDay(text) {
  const n = parseInt(text.replace(/\D/g, ''), 10);
  if (n >= 1 && n <= 31) return n;
  return null;
}

async function userHasFamilyMenu(userId) {
  const p = await familyProjectService.findFamilyProjectForUser(userId);
  return p && p.onboarding_completed;
}

async function getFamilyProjectOrReply(chatId, userId) {
  const project = await familyProjectService.findFamilyProjectForUser(userId);
  if (!project) {
    const bot = getBot();
    await bot.sendMessage(chatId, 'Семейный бюджет не создан. Нажмите /start и выберите «Создать семейный бюджет».');
    return null;
  }
  if (!project.onboarding_completed && project.user_role === 'owner') {
    const bot = getBot();
    await bot.sendMessage(chatId, 'Сначала завершите опросник семейного бюджета.');
    await startOnboarding(chatId, userId, project);
    return null;
  }
  return project;
}

async function showLumikUpdateIfNeeded(chatId, user) {
  if (user.lumik_update_seen) return false;
  const bot = getBot();
  await bot.sendMessage(chatId, LUMIK_UPDATE_MESSAGE, {
    reply_markup: updateBroadcastKeyboard()
  });
  await userService.update(user.id, { lumik_update_seen: true });
  return true;
}

async function startCreateFamilyBudget(chatId, user) {
  const bot = getBot();
  const can = await familyProjectService.canCreateFamilyProject(user.id);
  if (!can) {
    const existing = await familyProjectService.findOwnedFamilyProject(user.id);
    if (existing?.onboarding_completed) {
      await showMonthReality(chatId, user.id);
    } else if (existing) {
      await startOnboarding(chatId, user.id, existing);
    }
    return;
  }
  const currency = user.primary_currency || 'RUB';
  const project = await familyProjectService.createFamilyProject(user.id, currency);
  await bot.sendMessage(
    chatId,
    `✅ Проект «${project.name}» создан.\n\nВалюта бюджета: ${currency}\nКлючевые слова для операционных трат: семья, семейный, общак.\n\nОтветьте на несколько вопросов — так соберём «Реальность месяца».`,
    { reply_markup: getMainMenuKeyboard(true) }
  );
  await startOnboarding(chatId, user.id, project);
}

async function startOnboarding(chatId, userId, project) {
  stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, {
    projectId: project.id,
    step: 'payment_title',
    draft: {}
  }, 60);
  const bot = getBot();
  await bot.sendMessage(
    chatId,
    '💳 Шаг 1. Обязательные платежи\n\nЗа что платите каждый месяц? (например: аренда, коммуналка)\n\nИли используйте кнопки ниже.',
    { reply_markup: onboardingSkipKeyboard('payments') }
  );
}

async function finishOnboarding(chatId, userId, projectId) {
  await familyProjectService.completeOnboarding(projectId);
  stateManager.clearState(chatId);
  const bot = getBot();
  const project = await projectService.findById(projectId);
  const reality = await getMonthReality(project);
  await bot.sendMessage(chatId, formatMonthRealityMessage(reality), {
    parse_mode: 'Markdown',
    reply_markup: realityActionsKeyboard()
  });
  await bot.sendMessage(
    chatId,
    'Готово! Операционные траты и доходы по-прежнему записывайте голосом или текстом — с словами «семья», «семейный», «общак» они попадут в этот проект.\n\nПригласить партнёра?',
    { reply_markup: realityActionsKeyboard() }
  );
}

async function showMonthReality(chatId, userId) {
  const project = await getFamilyProjectOrReply(chatId, userId);
  if (!project) return;
  const bot = getBot();
  const reality = await getMonthReality(project);
  await bot.sendMessage(chatId, formatMonthRealityMessage(reality), {
    parse_mode: 'Markdown',
    reply_markup: realityActionsKeyboard()
  });
}

async function showListsMenu(chatId) {
  const bot = getBot();
  await bot.sendMessage(chatId, '📝 Мои списки — выберите:', {
    reply_markup: listsMenuKeyboard()
  });
}

async function showList(chatId, userId, listType) {
  const project = await getFamilyProjectOrReply(chatId, userId);
  if (!project) return;
  const bot = getBot();
  const currency = project.budget_currency || 'RUB';
  const now = new Date();
  let lines = [];
  let items = [];

  if (listType === 'payments') {
    items = await plannedPaymentService.list(project.id);
    lines.push('📤 *Обязательные платежи*\n');
    for (const p of sortByUpcoming(items, now, 50)) {
      const changed = p.updated_by && p.updated_by !== p.created_by ? ' _(изм. партнёром)_' : '';
      lines.push(`• ${p.title} — ${p.amount} ${currency}, день ${p.day_of_month} (${formatDaysLeft(p.daysLeft)})${changed}`);
    }
  } else if (listType === 'incomes') {
    items = await plannedIncomeService.list(project.id);
    lines.push('📥 *Ожидаемые доходы*\n');
    for (const p of sortByUpcoming(items, now, 50)) {
      lines.push(`• ${p.title} — ${p.amount} ${currency}, день ${p.day_of_month}`);
    }
  } else if (listType === 'debts') {
    items = await debtService.list(project.id);
    const total = await debtService.getTotalDebt(project.id);
    lines.push(`🏦 *Долги* (всего: ${total} ${currency})\n`);
    for (const d of items) {
      lines.push(`• ${d.description} — ${d.amount} ${currency}`);
    }
    items = items.map((d) => ({ ...d, title: d.description }));
  }

  if (items.length === 0) lines.push('_Пока пусто._');

  if (items.length > 0 && items.length <= 15) {
    for (const item of items) {
      const label = item.title || item.description;
      await bot.sendMessage(chatId, `▫️ ${label}`, {
        reply_markup: listRowKeyboard(listType, item.id)
      });
    }
  }

  await bot.sendMessage(chatId, lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: listActionsKeyboard(listType)
  });
}

async function handleFamilyText(msg, userState) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const text = msg.text?.trim();
  const bot = getBot();
  const data = userState.data;

  if (userState.type === STATE_TYPES.FB_ONBOARDING) {
    return handleOnboardingInput(msg, data);
  }
  if (userState.type === STATE_TYPES.FB_LIST_ADD || userState.type === STATE_TYPES.FB_LIST_EDIT) {
    return handleListInput(msg, data);
  }
  if (userState.type === STATE_TYPES.FB_FLOATING_AMOUNT) {
    const amount = parseAmount(text);
    if (!amount || amount <= 0) {
      return bot.sendMessage(chatId, 'Введите сумму числом.');
    }
    await floatingIncomeService.create(
      { project_id: data.projectId, amount, description: data.description || 'Плавающий доход', income_date: new Date().toISOString().slice(0, 10) },
      user.id
    );
    stateManager.clearState(chatId);
    await notifyPartners(bot, data.projectId, user.id, `💫 ${partnerLabel(user)} добавил(а) плавающий доход: ${amount}`);
    await showMonthReality(chatId, user.id);
    return;
  }
  if (userState.type === STATE_TYPES.FB_DEBT_TOPUP) {
    const amount = parseAmount(text);
    if (!amount || amount <= 0) return bot.sendMessage(chatId, 'Введите сумму.');
    await debtService.addAdjustment({ projectId: data.projectId, amount, note: text }, user.id);
    stateManager.clearState(chatId);
    await notifyPartners(bot, data.projectId, user.id, `🏦 ${partnerLabel(user)} пополнил(а) счётчик долга: +${amount}`);
    await showMonthReality(chatId, user.id);
    return;
  }
}

async function handleOnboardingInput(msg, data) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const text = msg.text?.trim();
  const bot = getBot();
  const { projectId, step, draft } = data;

  if (step === 'payment_title') {
    data.draft = { ...draft, title: text };
    data.step = 'payment_amount';
    stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, data, 60);
    return bot.sendMessage(chatId, 'Сумма платежа в месяц?');
  }
  if (step === 'payment_amount') {
    const amount = parseAmount(text);
    if (!amount) return bot.sendMessage(chatId, 'Укажите сумму.');
    data.draft = { ...draft, amount };
    data.step = 'payment_day';
    stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, data, 60);
    return bot.sendMessage(chatId, 'В какой день месяца платите? (число 1–31)');
  }
  if (step === 'payment_day') {
    const day = parseDay(text);
    if (!day) return bot.sendMessage(chatId, 'День 1–31.');
    await plannedPaymentService.create(
      { project_id: projectId, title: draft.title, amount: draft.amount, day_of_month: day },
      user.id
    );
    data.draft = {};
    data.step = 'payment_title';
    stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, data, 60);
    return bot.sendMessage(chatId, 'Платёж добавлен. Ещё один обязательный платёж (название) или «Дальше».', {
      reply_markup: onboardingSkipKeyboard('payments')
    });
  }
  if (step === 'income_title') {
    data.draft = { title: text };
    data.step = 'income_amount';
    stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, data, 60);
    return bot.sendMessage(chatId, 'Сумма дохода?');
  }
  if (step === 'income_amount') {
    const amount = parseAmount(text);
    if (!amount) return bot.sendMessage(chatId, 'Укажите сумму.');
    data.draft.amount = amount;
    data.step = 'income_day';
    stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, data, 60);
    return bot.sendMessage(chatId, 'День поступления (1–31)?');
  }
  if (step === 'income_day') {
    const day = parseDay(text);
    if (!day) return bot.sendMessage(chatId, 'День 1–31.');
    await plannedIncomeService.create(
      { project_id: projectId, title: data.draft.title, amount: data.draft.amount, day_of_month: day },
      user.id
    );
    data.draft = {};
    data.step = 'income_title';
    stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, data, 60);
    return bot.sendMessage(chatId, 'Доход добавлен. Ещё один или «Дальше».', {
      reply_markup: onboardingSkipKeyboard('incomes')
    });
  }
  if (step === 'floating') {
    data.hasFloating = /да|yes|\+/i.test(text);
    data.step = 'debt_ask';
    stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, data, 60);
    return bot.sendMessage(chatId, 'Есть долги? Кому и сколько (например: банк 50000). Или «нет».', {
      reply_markup: onboardingSkipKeyboard('debts')
    });
  }
  if (step === 'debt_ask') {
    if (/нет|no|-/i.test(text)) {
      return finishOnboarding(chatId, user.id, projectId);
    }
    data.step = 'debt_amount';
    data.draft = { description: text };
    stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, data, 60);
    return bot.sendMessage(chatId, 'Сумма долга?');
  }
  if (step === 'debt_amount') {
    const amount = parseAmount(text);
    if (!amount) return bot.sendMessage(chatId, 'Сумма?');
    await debtService.create(
      { project_id: projectId, description: data.draft.description, amount },
      user.id
    );
    return finishOnboarding(chatId, user.id, projectId);
  }
}

async function handleListInput(msg, data) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const text = msg.text?.trim();
  const bot = getBot();
  const { listType, projectId, step, draft, itemId } = data;

  const svc = listType === 'payments' ? plannedPaymentService
    : listType === 'incomes' ? plannedIncomeService : debtService;

  if (step === 'title') {
    data.draft = { title: text, description: text };
    data.step = 'amount';
    stateManager.setState(chatId, STATE_TYPES.FB_LIST_ADD, data, 30);
    return bot.sendMessage(chatId, 'Сумма?');
  }
  if (step === 'amount') {
    const amount = parseAmount(text);
    if (!amount) return bot.sendMessage(chatId, 'Сумма?');
    data.draft.amount = amount;
    if (listType === 'debts') {
      await svc.create({ project_id: projectId, description: draft.title || draft.description, amount }, user.id);
      stateManager.clearState(chatId);
      await notifyPartners(bot, projectId, user.id, `📝 ${partnerLabel(user)} обновил(а) список долгов`);
      return showList(chatId, user.id, listType);
    }
    data.step = 'day';
    stateManager.setState(chatId, STATE_TYPES.FB_LIST_ADD, data, 30);
    return bot.sendMessage(chatId, 'День месяца (1–31)?');
  }
  if (step === 'day') {
    const day = parseDay(text);
    if (!day) return bot.sendMessage(chatId, '1–31');
    const row = listType === 'payments'
      ? { project_id: projectId, title: draft.title, amount: draft.amount, day_of_month: day }
      : { project_id: projectId, title: draft.title, amount: draft.amount, day_of_month: day };
    if (itemId) {
      await svc.update(itemId, row, user.id, projectId);
    } else {
      await svc.create(row, user.id);
    }
    stateManager.clearState(chatId);
    await notifyPartners(bot, projectId, user.id, `📝 ${partnerLabel(user)} изменил(а) плановый список`);
    return showList(chatId, user.id, listType);
  }

  if (data.editField === 'amount') {
    const amount = parseAmount(text);
    const updates = listType === 'debts' ? { amount } : { amount };
    if (listType === 'debts') {
      await debtService.update(itemId, updates, user.id, projectId);
    } else {
      await svc.update(itemId, updates, user.id, projectId);
    }
    stateManager.clearState(chatId);
    await notifyPartners(bot, projectId, user.id, `✏️ ${partnerLabel(user)} изменил(а) запись в списке`);
    return showList(chatId, user.id, listType);
  }
}

async function handleFamilyCallback(callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id;
  const user = callbackQuery.user;
  const data = callbackQuery.data;
  const bot = getBot();

  if (!data.startsWith('fb:')) return false;

  await bot.answerCallbackQuery(callbackQuery.id);

  if (data === 'fb:update:later') {
    await bot.editMessageText('Хорошо! Всё работает как раньше. Семейный бюджет можно создать в любой момент через /start.', {
      chat_id: chatId,
      message_id: callbackQuery.message.message_id
    });
    return true;
  }

  if (data === 'fb:create') {
    await startCreateFamilyBudget(chatId, user);
    return true;
  }

  if (data === 'fb:reality') {
    await showMonthReality(chatId, user.id);
    return true;
  }

  if (data === 'fb:close') {
    await bot.deleteMessage(chatId, callbackQuery.message.message_id).catch(() => {});
    return true;
  }

  if (data === 'fb:lists') {
    await showListsMenu(chatId);
    return true;
  }

  if (data.startsWith('fb:list:')) {
    const listType = data.split(':')[2];
    await showList(chatId, user.id, listType);
    return true;
  }

  if (data.startsWith('fb:add:')) {
    const listType = data.split(':')[2];
    const project = await getFamilyProjectOrReply(chatId, user.id);
    if (!project) return true;
    stateManager.setState(chatId, STATE_TYPES.FB_LIST_ADD, {
      listType,
      projectId: project.id,
      step: 'title',
      draft: {}
    }, 30);
    const label = listType === 'debts' ? 'Кому / описание долга?' : 'Название?';
    await bot.sendMessage(chatId, label);
    return true;
  }

  if (data.startsWith('fb:del:')) {
    const [, , listType, itemId] = data.split(':');
    const project = await familyProjectService.findFamilyProjectForUser(user.id);
    const item = listType === 'payments'
      ? (await plannedPaymentService.list(project.id)).find((x) => x.id === itemId)
      : listType === 'incomes'
        ? (await plannedIncomeService.list(project.id)).find((x) => x.id === itemId)
        : (await debtService.list(project.id)).find((x) => x.id === itemId);
    const name = item?.title || item?.description || 'запись';
    await bot.sendMessage(chatId, `Удалить «${name}»?`, {
      reply_markup: confirmDeleteKeyboard(listType, itemId)
    });
    return true;
  }

  if (data.startsWith('fb:delok:')) {
    const [, , listType, itemId] = data.split(':');
    const project = await familyProjectService.findFamilyProjectForUser(user.id);
    const svc = listType === 'payments' ? plannedPaymentService
      : listType === 'incomes' ? plannedIncomeService : debtService;
    await svc.delete(itemId, user.id, project.id);
    await notifyPartners(bot, project.id, user.id, `🗑 ${partnerLabel(user)} удалил(а) запись из списка`);
    await bot.sendMessage(chatId, 'Удалено.');
    await showList(chatId, user.id, listType);
    return true;
  }

  if (data.startsWith('fb:delno:')) {
    await bot.sendMessage(chatId, 'Отменено.');
    return true;
  }

  if (data === 'fb:float:add') {
    const project = await getFamilyProjectOrReply(chatId, user.id);
    if (!project) return true;
    stateManager.setState(chatId, STATE_TYPES.FB_FLOATING_AMOUNT, { projectId: project.id }, 15);
    await bot.sendMessage(chatId, 'Сумма плавающего дохода (разовый, за этот месяц):');
    return true;
  }

  if (data === 'fb:debt:topup') {
    const project = await getFamilyProjectOrReply(chatId, user.id);
    if (!project) return true;
    stateManager.setState(chatId, STATE_TYPES.FB_DEBT_TOPUP, { projectId: project.id }, 15);
    await bot.sendMessage(chatId, 'На сколько пополнить счётчик долга?');
    return true;
  }

  if (data === 'fb:invite') {
    const project = await getFamilyProjectOrReply(chatId, user.id);
    if (!project || project.user_role !== 'owner') {
      await bot.sendMessage(chatId, 'Пригласить может владелец проекта через /team или ссылку.');
      return true;
    }
    const token = await projectMemberService.generateInviteLink(project.id, user.id);
    const me = await bot.getMe();
    const link = `https://t.me/${me.username}?start=${token}`;
    await bot.sendMessage(chatId, `👫 Ссылка для партнёра (7 дней):\n${link}`);
    return true;
  }

  if (data.startsWith('fb:onb:')) {
    const parts = data.split(':');
    const action = parts[2];
    const section = parts[3];
    const st = stateManager.getState(chatId);
    if (!st || st.type !== STATE_TYPES.FB_ONBOARDING) return true;
    const { projectId } = st.data;

    if (action === 'skip' || action === 'next') {
      if (section === 'payments') {
        st.data.step = 'income_title';
        stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, st.data, 60);
        await bot.sendMessage(chatId, '📥 Шаг 2. Ожидаемые доходы — источник (зарплата, аренда…)?', {
          reply_markup: onboardingSkipKeyboard('incomes')
        });
      } else if (section === 'incomes') {
        st.data.step = 'floating';
        stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, st.data, 60);
        await bot.sendMessage(chatId, 'Шаг 3. Бывает нерегулярный доход? (да / нет)', {
          reply_markup: onboardingSkipKeyboard('floating')
        });
      } else if (section === 'floating') {
        st.data.step = 'debt_ask';
        stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, st.data, 60);
        await bot.sendMessage(chatId, 'Шаг 4. Есть долги? Опишите или «нет».', {
          reply_markup: onboardingSkipKeyboard('debts')
        });
      } else if (section === 'debts') {
        await finishOnboarding(chatId, user.id, projectId);
      }
    }
    if (action === 'more' && section === 'payments') {
      st.data.step = 'payment_title';
      stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, st.data, 60);
      await bot.sendMessage(chatId, 'Название следующего платежа?');
    }
    return true;
  }

  if (data.startsWith('fb:edit:')) {
    const [, , listType, itemId] = data.split(':');
    const project = await familyProjectService.findFamilyProjectForUser(user.id);
    stateManager.setState(chatId, STATE_TYPES.FB_LIST_EDIT, {
      listType,
      projectId: project.id,
      itemId,
      editField: 'amount'
    }, 20);
    await bot.sendMessage(chatId, 'Новая сумма?');
    return true;
  }

  return true;
}

async function handleFamilyMenuText(msg) {
  const text = msg.text;
  const chatId = msg.chat.id;
  const user = msg.user;

  if (text === '📊 Реальность месяца') {
    await showMonthReality(chatId, user.id);
    return true;
  }
  if (text === '📝 Мои списки') {
    await showListsMenu(chatId);
    return true;
  }
  return false;
}

module.exports = {
  userHasFamilyMenu,
  showLumikUpdateIfNeeded,
  startCreateFamilyBudget,
  showMonthReality,
  handleFamilyText,
  handleFamilyCallback,
  handleFamilyMenuText,
  getFamilyProjectOrReply
};
