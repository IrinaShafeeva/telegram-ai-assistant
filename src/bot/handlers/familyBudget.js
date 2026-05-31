const { userService, projectService, projectMemberService } = require('../../services/supabase');
const {
  familyProjectService,
  familyMemberStateService,
  plannedPaymentService,
  plannedIncomeService,
  debtService,
  floatingIncomeService,
  notifyPartners,
  partnerLabel,
  currentPlanMonth
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
  onboardingSkipKeyboard,
  partnerPlanReviewKeyboard,
  editFieldKeyboard,
  monthlyReviewKeyboard
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

function isFamilySchemaError(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error?.code) ||
    /is_family_budget|budget_currency|onboarding_completed|family_established|planned_payments|planned_incomes|family_budget_member_state|budget_changelog|floating_incomes|debt_adjustments/i.test(message);
}

async function sendFamilySchemaError(chatId) {
  const bot = getBot();
  await bot.sendMessage(
    chatId,
    'Семейный бюджет пока не может стартовать: в Supabase не применена схема семейного бюджета.\n\n' +
      'Нужно выполнить SQL-миграции:\n' +
      '1. migrations/001_family_budget.sql\n' +
      '2. migrations/002_family_member_onboarding.sql\n' +
      '3. migrations/003_family_canonical_project.sql\n\n' +
      'После этого нажмите /start и снова выберите «Семейный бюджет».',
    { reply_markup: getMainMenuKeyboard(false) }
  );
}

async function userHasFamilyMenu(userId) {
  try {
    const p = await familyProjectService.findFamilyProjectForUser(userId);
    return p && p.onboarding_completed;
  } catch (error) {
    logger.warn('Could not check family budget menu state:', error.message);
    return false;
  }
}

function formatPlanSnapshot(snapshot, currency) {
  const lines = [];
  if (snapshot.payments?.length) {
    lines.push('📤 *Ваши платежи:*');
    for (const p of snapshot.payments) {
      lines.push(`• ${p.title} — ${p.amount} ${currency}, день ${p.day_of_month}`);
    }
  }
  if (snapshot.incomes?.length) {
    lines.push('\n📥 *Ваши доходы:*');
    for (const p of snapshot.incomes) {
      lines.push(`• ${p.title} — ${p.amount} ${currency}, день ${p.day_of_month}`);
    }
  }
  if (snapshot.debts?.length) {
    lines.push('\n🏦 *Ваши долги:*');
    for (const d of snapshot.debts) {
      lines.push(`• ${d.description} — ${d.amount} ${currency}`);
    }
  }
  return lines.length ? lines.join('\n') : '';
}

async function sendLoserMergedMessage(chatId, user, mergeResult) {
  const bot = getBot();
  const { snapshot, winnerProject, winnerOwner } = mergeResult;
  const currency = winnerProject.budget_currency || 'RUB';
  const reality = await getMonthReality(winnerProject);
  const partnerName = partnerLabel(winnerOwner);

  let text =
    `👫 Ваш партнёр (${partnerName}) уже заполнил семейный бюджет первым.\n\n` +
    `*Общий план:*\n\n${formatMonthRealityMessage(reality)}\n\n`;

  const ownLines = formatPlanSnapshot(snapshot, currency);
  if (ownLines) {
    text +=
      `*Ваши данные из опросника* (отдельный проект закрыт, строки только для ориентира):\n\n${ownLines}\n\n` +
      '_Скорректируйте общий план под своё видение — добавьте или измените позиции в «Редактировать план»._';
  } else {
    text += '_Дополните общий план со своей стороны — «Редактировать план»._';
  }

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: partnerPlanReviewKeyboard()
  });
  await bot.sendMessage(chatId, '✅ Вы в общем семейном бюджете.', {
    reply_markup: getMainMenuKeyboard(true)
  });
}

function buildPartnerPlanMessage(finisherUser, reality, isMonthly = false) {
  const who = partnerLabel(finisherUser);
  const header = isMonthly
    ? `📅 *Начало месяца* — ${who} обновил(а) семейный план:\n\n`
    : `👫 ${who} заполнил(а) опросник семейного бюджета:\n\n`;
  return (
    header +
    formatMonthRealityMessage(reality) +
    '\n\n_Проверьте цифры, добавьте свои платежи и доходы — кнопка «Редактировать план»._'
  );
}

async function sendFamilyInviteLink(chatId, user, project) {
  const bot = getBot();
  const full = await projectService.findById(project.id);
  const access = await projectService.hasAccess(project.id, user.id);
  if (!access.access) {
    await bot.sendMessage(chatId, '❌ Нет доступа к этому проекту.');
    return;
  }
  const token = await projectMemberService.generateInviteLink(project.id, full.owner_id);
  const me = await bot.getMe();
  const link = `https://t.me/${me.username}?start=${token}`;
  await bot.sendMessage(
    chatId,
    `👫 Ссылка для партнёра (7 дней):\n${link}\n\nОба можете приглашать и заполнять опросник.`
  );
}

async function promptMonthlyReviewIfNeeded(chatId, userId, project) {
  const needs = await familyMemberStateService.needsPlanReviewThisMonth(project.id, userId);
  if (!needs || !(project.onboarding_completed || project.family_established_at)) return;

  const state = await familyMemberStateService.get(project.id, userId);
  const month = currentPlanMonth();
  if (state?.last_monthly_prompt_month === month) return;

  const bot = getBot();
  const { formatPlanMonthLabel } = require('../../utils/budgetDates');
  await bot.sendMessage(
    chatId,
    `📅 *${formatPlanMonthLabel(month)}* — простройте план на месяц вместе с партнёром.`,
    { parse_mode: 'Markdown', reply_markup: monthlyReviewKeyboard() }
  );
  await familyMemberStateService.markMonthlyPromptSent(project.id, userId);
}

async function getFamilyProjectOrReply(chatId, userId) {
  const canonical = await familyProjectService.findCanonicalFamilyProject();
  const ownedDup = await familyProjectService.findOwnedFamilyProject(userId);
  if (canonical && ownedDup && ownedDup.id !== canonical.id) {
    const user = await userService.findById(userId);
    const mergeResult = await familyProjectService.resolveLoserToWinner(userId, ownedDup.id, canonical);
    await sendLoserMergedMessage(chatId, user, mergeResult);
    return null;
  }

  const project = await familyProjectService.findFamilyProjectForUser(userId);
  if (!project) {
    const bot = getBot();
    await bot.sendMessage(chatId, 'Семейный бюджет не создан. Нажмите /start и выберите «Семейный бюджет» в меню.');
    return null;
  }
  if (!project.onboarding_completed) {
    const needs = await familyMemberStateService.needsPlanReviewThisMonth(project.id, userId);
    if (needs) {
      const bot = getBot();
      await bot.sendMessage(
        chatId,
        'Заполните опросник или дождитесь партнёра. Можно пригласить его сейчас — кнопка ниже.',
        { reply_markup: onboardingSkipKeyboard('payments') }
      );
      await startOnboarding(chatId, userId, project);
      return null;
    }
  }
  return project;
}

async function sendPartnerWelcomeAfterJoin(chatId, user, project) {
  const bot = getBot();
  const full = await projectService.findById(project.id);
  const hasFamily = true;

  const ownedDuplicate = await familyProjectService.findOwnedFamilyProject(user.id);
  if (ownedDuplicate && ownedDuplicate.id !== full.id) {
    const mergeResult = await familyProjectService.resolveLoserToWinner(
      user.id,
      ownedDuplicate.id,
      full
    );
    await sendLoserMergedMessage(chatId, user, mergeResult);
    return;
  }

  await bot.sendMessage(
    chatId,
    `✅ Вы в общем семейном бюджете «${project.name}»!\n\n` +
      'Один общий план на пару. Можете редактировать все поля и дополнять свои строки.',
    { reply_markup: getMainMenuKeyboard(hasFamily) }
  );

  if (full.onboarding_completed || full.family_established_at) {
    const reality = await getMonthReality(full);
    const owner = await userService.findById(full.family_established_by || full.owner_id);
    await bot.sendMessage(
      chatId,
      `👫 ${partnerLabel(owner)} уже заполнил(а) план первым:\n\n${formatMonthRealityMessage(reality)}`,
      { parse_mode: 'Markdown', reply_markup: partnerPlanReviewKeyboard() }
    );
    await familyMemberStateService.markOnboardingDone(full.id, user.id);
    const needs = await familyMemberStateService.needsPlanReviewThisMonth(project.id, user.id);
    if (needs) {
      await bot.sendMessage(chatId, '📝 При необходимости обновите план на этот месяц:', {
        reply_markup: monthlyReviewKeyboard()
      });
    }
  } else {
    await bot.sendMessage(chatId, 'Партнёр ещё заполняет опросник — вы сможете дополнить план после него.', {
      reply_markup: partnerPlanReviewKeyboard()
    });
  }
}

async function showLumikUpdateIfNeeded(chatId, user) {
  if (user.lumik_update_seen) return false;
  const bot = getBot();
  try {
    await bot.sendMessage(chatId, LUMIK_UPDATE_MESSAGE, {
      reply_markup: updateBroadcastKeyboard()
    });
    try {
      await userService.update(user.id, { lumik_update_seen: true });
    } catch (updateError) {
      logger.warn('Could not mark Lumik update as seen:', updateError.message);
    }
    return true;
  } catch (error) {
    logger.warn('Could not show Lumik update broadcast:', error.message);
    return false;
  }
}

async function startCreateFamilyBudget(chatId, user) {
  const bot = getBot();

  try {
    const canonical = await familyProjectService.findCanonicalFamilyProject();
    if (canonical) {
      const access = await projectService.hasAccess(canonical.id, user.id);
      if (access.access) {
        await showMonthReality(chatId, user.id);
        return;
      }
      await bot.sendMessage(
        chatId,
        '👫 Семейный бюджет уже создан вашим партнёром.\n\nПопросите ссылку «Пригласить партнёра» или откройте приглашение /start …'
      );
      return;
    }

    const owned = await familyProjectService.findOwnedFamilyProject(user.id);
    if (owned) {
      if (owned.onboarding_completed) {
        await showMonthReality(chatId, user.id);
      } else {
        await startOnboarding(chatId, user.id, owned);
      }
      return;
    }

    const can = await familyProjectService.canCreateFamilyProject(user.id);
    if (!can) {
      await bot.sendMessage(chatId, 'Семейный бюджет уже есть — откройте «Реальность месяца».');
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
  } catch (error) {
    logger.error('Start family budget error:', error);
    stateManager.clearState(chatId);
    if (isFamilySchemaError(error)) {
      await sendFamilySchemaError(chatId);
      return;
    }
    await bot.sendMessage(chatId, 'Не удалось открыть семейный бюджет. Попробуйте ещё раз через /start.');
  }
}

async function startOnboarding(chatId, userId, project, isMonthly = false) {
  if (!isMonthly) {
    const canonical = await familyProjectService.findCanonicalFamilyProject();
    if (canonical && canonical.id !== project.id) {
      const mergeResult = await familyProjectService.resolveLoserToWinner(userId, project.id, canonical);
      stateManager.clearState(chatId);
      const loser = await userService.findById(userId);
      await sendLoserMergedMessage(chatId, loser, mergeResult);
      return;
    }
  }

  stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, {
    projectId: project.id,
    step: 'payment_title',
    draft: {},
    isMonthly
  }, 60);
  const bot = getBot();
  const intro = isMonthly
    ? `📅 План на ${currentPlanMonth()} — обновите платежи и доходы (можно только добавить новые или пропустить шаги).\n\n`
    : '';
  await bot.sendMessage(
    chatId,
    `${intro}💳 Шаг 1. Обязательные платежи\n\nЗа что платите каждый месяц? (например: аренда, коммуналка)\n\nМожно пригласить партнёра в любой момент.`,
    { reply_markup: onboardingSkipKeyboard('payments') }
  );
}

async function finishOnboarding(chatId, userId, projectId, isMonthly = false) {
  const bot = getBot();

  if (!isMonthly) {
    const canonical = await familyProjectService.findCanonicalFamilyProject();
    if (canonical && canonical.id !== projectId) {
      const mergeResult = await familyProjectService.resolveLoserToWinner(userId, projectId, canonical);
      stateManager.clearState(chatId);
      const loser = await userService.findById(userId);
      await sendLoserMergedMessage(chatId, loser, mergeResult);
      return;
    }

    if (!canonical) {
      await familyProjectService.establishAsCanonical(projectId, userId);
      await familyProjectService.warnOtherFamilyProjectOwners(projectId, userId);
    }
    await familyMemberStateService.markOnboardingDone(projectId, userId);
  } else {
    await familyMemberStateService.markOnboardingDone(projectId, userId);
  }

  const project = await projectService.findById(projectId);
  stateManager.clearState(chatId);
  const finisher = await userService.findById(userId);
  const reality = await getMonthReality(project);
  const doneText = isMonthly
    ? `✅ Ваш план на ${currentPlanMonth()} сохранён. Партнёр получит уведомление с цифрами.`
    : '✅ Опросник готов! Партнёр увидит ваши данные и сможет всё отредактировать.';

  await bot.sendMessage(chatId, doneText);
  await bot.sendMessage(chatId, formatMonthRealityMessage(reality), {
    parse_mode: 'Markdown',
    reply_markup: realityActionsKeyboard()
  });
  await bot.sendMessage(
    chatId,
    'Голосом/текстом: «семья», «семейный», «общак» — операционные траты в этот проект.',
    { reply_markup: realityActionsKeyboard() }
  );

  const partnerMsg = buildPartnerPlanMessage(finisher, reality, isMonthly);
  await notifyPartners(bot, projectId, userId, partnerMsg, partnerPlanReviewKeyboard(), true);
}

async function showMonthReality(chatId, userId) {
  const project = await familyProjectService.findFamilyProjectForUser(userId);
  const bot = getBot();
  if (!project) {
    await bot.sendMessage(chatId, 'Семейный бюджет не создан.');
    return;
  }
  if (!project.onboarding_completed) {
    await bot.sendMessage(chatId, 'Сначала кто-то из пары должен завершить опросник.');
    await startOnboarding(chatId, userId, project);
    return;
  }
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
  const project = await familyProjectService.findFamilyProjectForUser(userId);
  const bot = getBot();
  if (!project) {
    await bot.sendMessage(chatId, 'Семейный бюджет не создан.');
    return;
  }
  if (!project.onboarding_completed) {
    await bot.sendMessage(chatId, 'Списки появятся после первого заполненного опросника.');
    return;
  }
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
      return finishOnboarding(chatId, user.id, projectId, data.isMonthly);
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
    return finishOnboarding(chatId, user.id, projectId, data.isMonthly);
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

  const field = data.editField;
  if (field === 'amount') {
    const amount = parseAmount(text);
    if (!amount) return bot.sendMessage(chatId, 'Введите сумму.');
    const updates = { amount };
    await svc.update(itemId, updates, user.id, projectId);
    stateManager.clearState(chatId);
    await notifyPartners(bot, projectId, user.id, `✏️ ${partnerLabel(user)} изменил(а) сумму в плане`);
    return showList(chatId, user.id, listType);
  }
  if (field === 'title') {
    const updates = listType === 'debts' ? { description: text } : { title: text };
    await svc.update(itemId, updates, user.id, projectId);
    stateManager.clearState(chatId);
    await notifyPartners(bot, projectId, user.id, `✏️ ${partnerLabel(user)} изменил(а) название в плане`);
    return showList(chatId, user.id, listType);
  }
  if (field === 'day') {
    const day = parseDay(text);
    if (!day) return bot.sendMessage(chatId, 'День 1–31.');
    await svc.update(itemId, { day_of_month: day }, user.id, projectId);
    stateManager.clearState(chatId);
    await notifyPartners(bot, projectId, user.id, `✏️ ${partnerLabel(user)} изменил(а) дату в плане`);
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
    await bot.editMessageText('Хорошо! Всё работает как раньше. Когда будете готовы, нажмите кнопку «Семейный бюджет» в меню ниже.', {
      chat_id: chatId,
      message_id: callbackQuery.message.message_id
    });
    await bot.sendMessage(chatId, 'Кнопка для создания семейного бюджета теперь в главном меню.', {
      reply_markup: getMainMenuKeyboard(false)
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
    const project = await familyProjectService.findFamilyProjectForUser(user.id);
    if (!project?.onboarding_completed) {
      await bot.sendMessage(chatId, 'Сначала кто-то из пары должен заполнить опросник.');
      return true;
    }
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
    const project = await familyProjectService.findFamilyProjectForUser(user.id);
    if (!project?.onboarding_completed) {
      await bot.sendMessage(chatId, 'Сначала заполните семейный план.');
      return true;
    }
    stateManager.setState(chatId, STATE_TYPES.FB_FLOATING_AMOUNT, { projectId: project.id }, 15);
    await bot.sendMessage(chatId, 'Сумма плавающего дохода (разовый, за этот месяц):');
    return true;
  }

  if (data === 'fb:debt:topup') {
    const project = await familyProjectService.findFamilyProjectForUser(user.id);
    if (!project?.onboarding_completed) {
      await bot.sendMessage(chatId, 'Сначала заполните семейный план.');
      return true;
    }
    stateManager.setState(chatId, STATE_TYPES.FB_DEBT_TOPUP, { projectId: project.id }, 15);
    await bot.sendMessage(chatId, 'На сколько пополнить счётчик долга?');
    return true;
  }

  if (data === 'fb:invite') {
    const project = await familyProjectService.findFamilyProjectForUser(user.id);
    if (!project) {
      await bot.sendMessage(chatId, 'Сначала создайте семейный бюджет.');
      return true;
    }
    await sendFamilyInviteLink(chatId, user, project);
    return true;
  }

  if (data === 'fb:onb:start') {
    const project = await familyProjectService.findFamilyProjectForUser(user.id);
    if (!project) {
      await bot.sendMessage(chatId, 'Семейный бюджет не найден.');
      return true;
    }
    const isMonthly = project.onboarding_completed;
    await startOnboarding(chatId, user.id, project, isMonthly);
    return true;
  }

  if (data === 'fb:month:done') {
    const project = await familyProjectService.findFamilyProjectForUser(user.id);
    if (!project) return true;
    await familyMemberStateService.markOnboardingDone(project.id, user.id);
    const finisher = user;
    const reality = await getMonthReality(project);
    await bot.sendMessage(chatId, `✅ План на ${currentPlanMonth()} отмечен как готовый.`);
    const partnerMsg = buildPartnerPlanMessage(finisher, reality, true);
    await notifyPartners(bot, project.id, user.id, partnerMsg, partnerPlanReviewKeyboard(), true);
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
        await finishOnboarding(chatId, user.id, projectId, st.data.isMonthly);
      }
    }
    if (action === 'more' && section === 'payments') {
      st.data.step = 'payment_title';
      stateManager.setState(chatId, STATE_TYPES.FB_ONBOARDING, st.data, 60);
      await bot.sendMessage(chatId, 'Название следующего платежа?');
    }
    return true;
  }

  if (data.startsWith('fb:editpick:')) {
    const [, , listType, itemId] = data.split(':');
    await bot.sendMessage(chatId, 'Что изменить?', {
      reply_markup: editFieldKeyboard(listType, itemId)
    });
    return true;
  }

  if (data.startsWith('fb:editf:')) {
    const [, , listType, itemId, field] = data.split(':');
    const project = await familyProjectService.findFamilyProjectForUser(user.id);
    if (!project) return true;
    const prompts = {
      amount: 'Новая сумма?',
      title: listType === 'debts' ? 'Новое описание долга?' : 'Новое название?',
      day: 'Новый день месяца (1–31)?'
    };
    stateManager.setState(chatId, STATE_TYPES.FB_LIST_EDIT, {
      listType,
      projectId: project.id,
      itemId,
      editField: field
    }, 20);
    await bot.sendMessage(chatId, prompts[field] || 'Введите значение:');
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
  if (text === '👨‍👩‍👧 Семейный бюджет') {
    await startCreateFamilyBudget(chatId, user);
    return true;
  }
  return false;
}

module.exports = {
  userHasFamilyMenu,
  showLumikUpdateIfNeeded,
  startCreateFamilyBudget,
  showMonthReality,
  sendPartnerWelcomeAfterJoin,
  sendFamilyInviteLink,
  promptMonthlyReviewIfNeeded,
  handleFamilyText,
  handleFamilyCallback,
  handleFamilyMenuText,
  getFamilyProjectOrReply
};
