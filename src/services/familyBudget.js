const { supabase, projectService, projectMemberService, userService } = require('./supabase');
const logger = require('../utils/logger');
const { clampDayOfMonth } = require('../utils/budgetDates');

const FAMILY_KEYWORDS = 'семья, семейный, общак';
const FAMILY_PROJECT_NAME = 'Семейный бюджет';

function currentPlanMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const familyMemberStateService = {
  async get(projectId, userId) {
    const { data, error } = await supabase
      .from('family_budget_member_state')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async markOnboardingDone(projectId, userId) {
    const month = currentPlanMonth();
    const { data, error } = await supabase
      .from('family_budget_member_state')
      .upsert(
        {
          project_id: projectId,
          user_id: userId,
          last_onboarding_month: month,
          last_monthly_prompt_month: month,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'project_id,user_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async needsPlanReviewThisMonth(projectId, userId) {
    const state = await this.get(projectId, userId);
    const month = currentPlanMonth();
    return !state || state.last_onboarding_month !== month;
  },

  async shouldSendMonthlyPrompt(projectId, userId) {
    const state = await this.get(projectId, userId);
    const month = currentPlanMonth();
    if (!state) return true;
    return state.last_monthly_prompt_month !== month;
  },

  async markMonthlyPromptSent(projectId, userId) {
    const month = currentPlanMonth();
    const existing = await this.get(projectId, userId);
    await supabase.from('family_budget_member_state').upsert(
      {
        project_id: projectId,
        user_id: userId,
        last_onboarding_month: existing?.last_onboarding_month || null,
        last_monthly_prompt_month: month,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'project_id,user_id' }
    );
  }
};

async function logChangelog({ projectId, userId, entityType, entityId, action, summary, oldValue, newValue }) {
  const { error } = await supabase.from('budget_changelog').insert({
    project_id: projectId,
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    summary,
    old_value: oldValue || null,
    new_value: newValue || null
  });
  if (error) logger.warn('budget_changelog insert failed:', error);
}

function toDateOnly(date = new Date()) {
  if (typeof date === 'string') return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function toLocalDateOnly(date = new Date()) {
  if (typeof date === 'string') return date.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentWeekBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toLocalDateOnly(start), end: toLocalDateOnly(end) };
}

function normalizeGuideCategory(category) {
  return String(category || '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim()
    .toLowerCase();
}

function normalizeGuideCategories(categories) {
  const unique = new Map();
  for (const category of categories || []) {
    const label = String(category || '').trim();
    const key = normalizeGuideCategory(label);
    if (key && !unique.has(key)) unique.set(key, label);
  }
  return Array.from(unique.values());
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

function monthlyDueDate(dateString, dayOfMonth) {
  const date = new Date(`${dateString}T00:00:00`);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = clampDayOfMonth(year, month, dayOfMonth);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function nextMonthDueDate(dateString, dayOfMonth) {
  const date = new Date(`${dateString}T00:00:00`);
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const year = next.getFullYear();
  const month = next.getMonth() + 1;
  const day = clampDayOfMonth(year, month, dayOfMonth);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const familyProjectService = {
  async findOwnedFamilyProject(userId) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('owner_id', userId)
      .eq('is_family_budget', true)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /**
   * Единственный «победивший» семейный проект — кто первым завершил опросник.
   */
  async findCanonicalFamilyProject() {
    let { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('is_family_budget', true)
      .eq('is_active', true)
      .not('family_established_at', 'is', null)
      .order('family_established_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    if (data) return data;

    ({ data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('is_family_budget', true)
      .eq('onboarding_completed', true)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle());
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findFamilyProjectForUser(userId) {
    const canonical = await this.findCanonicalFamilyProject();
    if (canonical) {
      const access = await projectService.hasAccess(canonical.id, userId);
      if (access.access) {
        const role = canonical.owner_id === userId ? 'owner' : (access.role || 'editor');
        return { ...canonical, user_role: role };
      }
    }

    const owned = await this.findOwnedFamilyProject(userId);
    if (owned) return { ...owned, user_role: 'owner' };

    const { data: memberships, error } = await supabase
      .from('project_members')
      .select('project_id, role, project:projects(*)')
      .eq('user_id', userId);
    if (error) throw error;
    const row = (memberships || []).find((m) => m.project?.is_family_budget);
    if (!row) return null;
    return { ...row.project, user_role: row.role || 'editor' };
  },

  async canCreateFamilyProject(userId) {
    const canonical = await this.findCanonicalFamilyProject();
    if (canonical) {
      const access = await projectService.hasAccess(canonical.id, userId);
      if (access.access) return false;
    }
    const owned = await this.findOwnedFamilyProject(userId);
    return !owned;
  },

  async collectPlanSnapshot(projectId) {
    const [payments, incomes, debts] = await Promise.all([
      plannedPaymentService.list(projectId),
      plannedIncomeService.list(projectId),
      debtService.list(projectId)
    ]);
    return { payments, incomes, debts };
  },

  async establishAsCanonical(projectId, userId) {
    return projectService.update(projectId, {
      onboarding_completed: true,
      family_established_at: new Date().toISOString(),
      family_established_by: userId
    });
  },

  async resolveLoserToWinner(loserUserId, loserProjectId, winnerProject) {
    const snapshot = await this.collectPlanSnapshot(loserProjectId);
    const loserOwned = await this.findOwnedFamilyProject(loserUserId);

    if (loserOwned?.id === loserProjectId && loserProjectId !== winnerProject.id) {
      await this.deleteFamilyProjectPlanData(loserProjectId);
      await projectService.delete(loserProjectId);
      logger.info(`Removed duplicate family project ${loserProjectId} for user ${loserUserId}`);
    }

    if (loserUserId !== winnerProject.owner_id) {
      try {
        await projectService.addMember(winnerProject.id, loserUserId, 'editor');
      } catch (e) {
        if (!e.message?.includes('уже является')) {
          logger.warn('addMember on merge:', e.message);
        }
      }
    }

    await familyMemberStateService.markOnboardingDone(winnerProject.id, loserUserId);

    const winnerOwner = await userService.findById(winnerProject.family_established_by || winnerProject.owner_id);
    return { snapshot, winnerProject, winnerOwner };
  },

  async deleteFamilyProjectPlanData(projectId) {
    await Promise.all([
      supabase.from('planned_payments').delete().eq('project_id', projectId),
      supabase.from('planned_incomes').delete().eq('project_id', projectId),
      supabase.from('debts').delete().eq('project_id', projectId),
      supabase.from('debt_adjustments').delete().eq('project_id', projectId),
      supabase.from('floating_incomes').delete().eq('project_id', projectId),
      supabase.from('weekly_category_guides').delete().eq('project_id', projectId),
      supabase.from('budget_changelog').delete().eq('project_id', projectId),
      supabase.from('family_budget_member_state').delete().eq('project_id', projectId)
    ]);
  },

  async warnOtherFamilyProjectOwners(winnerProjectId, winnerUserId) {
    const { data: others, error } = await supabase
      .from('projects')
      .select('id, owner_id, onboarding_completed')
      .eq('is_family_budget', true)
      .eq('is_active', true)
      .neq('id', winnerProjectId);
    if (error) return;

    const winner = await projectService.findById(winnerProjectId);
    const { getBot } = require('../utils/bot');
    const bot = getBot();
    if (!bot) return;

    for (const p of others || []) {
      if (p.owner_id === winnerUserId) continue;
      try {
        const token = await projectMemberService.generateInviteLink(winnerProjectId, winner.owner_id);
        const me = await bot.getMe();
        const link = `https://t.me/${me.username}?start=${token}`;
        await bot.sendMessage(
          p.owner_id,
          '👫 Ваш партнёр уже первым заполнил общий семейный бюджет.\n\n' +
            'Если вы тоже начинали опросник — после завершения покажем ваши строки для правок, отдельный проект закроем.\n\n' +
            `Или присоединитесь к общему плану: ${link}`
        );
      } catch (e) {
        logger.warn('warnOtherFamilyProjectOwners:', e.message);
      }
    }
  },

  async createFamilyProject(userId, currency) {
    const can = await this.canCreateFamilyProject(userId);
    if (!can) throw new Error('У вас уже есть семейный бюджет (один на пользователя).');

    const project = await projectService.create({
      owner_id: userId,
      name: FAMILY_PROJECT_NAME,
      description: 'Совместный семейный бюджет',
      keywords: FAMILY_KEYWORDS,
      is_collaborative: true,
      is_family_budget: true,
      budget_currency: currency,
      onboarding_completed: false,
      is_active: true
    });
    return project;
  },

  async completeOnboarding(projectId) {
    return projectService.update(projectId, { onboarding_completed: true });
  },

  isFamilyCollaborativeAllowed(project) {
    return project?.is_family_budget === true;
  }
};

async function getFamilyParticipantIds(projectId) {
  const project = await projectService.findById(projectId);
  const members = await projectService.getMembers(projectId);
  const ids = new Set();
  if (project?.owner_id) ids.add(project.owner_id);
  for (const m of members || []) {
    if (m.user_id) ids.add(m.user_id);
  }
  return { project, ids: Array.from(ids) };
}

async function notifyPartners(bot, projectId, actorUserId, message, replyMarkup = null, useMarkdown = false) {
  if (!bot) return;
  try {
    const { ids } = await getFamilyParticipantIds(projectId);
    const opts = {};
    if (useMarkdown) opts.parse_mode = 'Markdown';
    if (replyMarkup) opts.reply_markup = replyMarkup;
    for (const uid of ids) {
      if (uid === actorUserId) continue;
      await bot.sendMessage(uid, message, opts);
    }
  } catch (e) {
    logger.warn('notifyPartners failed:', e);
  }
}

function partnerLabel(user) {
  if (!user) return 'партнёр';
  return user.username ? `@${user.username}` : (user.first_name || 'партнёр');
}

const plannedPaymentService = {
  async list(projectId) {
    const { data, error } = await supabase
      .from('planned_payments')
      .select('*')
      .eq('project_id', projectId)
      .order('day_of_month', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async create(row, userId) {
    const payload = { ...row, created_by: userId, updated_by: userId };
    const { data, error } = await supabase.from('planned_payments').insert(payload).select().single();
    if (error) throw error;
    await logChangelog({
      projectId: row.project_id,
      userId,
      entityType: 'planned_payment',
      entityId: data.id,
      action: 'created',
      summary: `Добавлен платёж: ${data.title} ${data.amount}`,
      newValue: data
    });
    return data;
  },

  async update(id, updates, userId, projectId) {
    const { data: old } = await supabase.from('planned_payments').select('*').eq('id', id).single();
    const { data, error } = await supabase
      .from('planned_payments')
      .update({ ...updates, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    await logChangelog({
      projectId,
      userId,
      entityType: 'planned_payment',
      entityId: id,
      action: 'updated',
      summary: `Изменён платёж: ${old?.title || id}`,
      oldValue: old,
      newValue: data
    });
    return data;
  },

  async delete(id, userId, projectId) {
    const { data: old } = await supabase.from('planned_payments').select('*').eq('id', id).single();
    const { error } = await supabase.from('planned_payments').delete().eq('id', id);
    if (error) throw error;
    await logChangelog({
      projectId,
      userId,
      entityType: 'planned_payment',
      entityId: id,
      action: 'deleted',
      summary: `Удалён платёж: ${old?.title}`,
      oldValue: old
    });
    return old;
  }
};

const plannedIncomeService = {
  async list(projectId) {
    const { data, error } = await supabase
      .from('planned_incomes')
      .select('*')
      .eq('project_id', projectId)
      .order('day_of_month', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async create(row, userId) {
    const payload = { ...row, created_by: userId, updated_by: userId };
    const { data, error } = await supabase.from('planned_incomes').insert(payload).select().single();
    if (error) throw error;
    await logChangelog({
      projectId: row.project_id,
      userId,
      entityType: 'planned_income',
      entityId: data.id,
      action: 'created',
      summary: `Добавлен доход: ${data.title} ${data.amount}`,
      newValue: data
    });
    return data;
  },

  async update(id, updates, userId, projectId) {
    const { data: old } = await supabase.from('planned_incomes').select('*').eq('id', id).single();
    const { data, error } = await supabase
      .from('planned_incomes')
      .update({ ...updates, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    await logChangelog({
      projectId,
      userId,
      entityType: 'planned_income',
      entityId: id,
      action: 'updated',
      summary: `Изменён доход: ${old?.title}`,
      oldValue: old,
      newValue: data
    });
    return data;
  },

  async delete(id, userId, projectId) {
    const { data: old } = await supabase.from('planned_incomes').select('*').eq('id', id).single();
    const { error } = await supabase.from('planned_incomes').delete().eq('id', id);
    if (error) throw error;
    await logChangelog({
      projectId,
      userId,
      entityType: 'planned_income',
      entityId: id,
      action: 'deleted',
      summary: `Удалён доход: ${old?.title}`,
      oldValue: old
    });
    return old;
  }
};

const debtService = {
  async list(projectId) {
    const { data, error } = await supabase.from('debts').select('*').eq('project_id', projectId);
    if (error) throw error;
    return data || [];
  },

  async create(row, userId) {
    const payload = { ...row, created_by: userId, updated_by: userId };
    const { data, error } = await supabase.from('debts').insert(payload).select().single();
    if (error) throw error;
    await logChangelog({
      projectId: row.project_id,
      userId,
      entityType: 'debt',
      entityId: data.id,
      action: 'created',
      summary: `Долг: ${data.description} ${data.amount}`,
      newValue: data
    });
    return data;
  },

  async update(id, updates, userId, projectId) {
    const { data: old } = await supabase.from('debts').select('*').eq('id', id).single();
    const { data, error } = await supabase
      .from('debts')
      .update({ ...updates, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    await logChangelog({
      projectId,
      userId,
      entityType: 'debt',
      entityId: id,
      action: 'updated',
      summary: `Изменён долг: ${old?.description}`,
      oldValue: old,
      newValue: data
    });
    return data;
  },

  async delete(id, userId, projectId) {
    const { data: old } = await supabase.from('debts').select('*').eq('id', id).single();
    const { error } = await supabase.from('debts').delete().eq('id', id);
    if (error) throw error;
    await logChangelog({
      projectId,
      userId,
      entityType: 'debt',
      entityId: id,
      action: 'deleted',
      summary: `Удалён долг: ${old?.description}`,
      oldValue: old
    });
    return old;
  },

  async addAdjustment({ projectId, amount, note }, userId) {
    const { data, error } = await supabase
      .from('debt_adjustments')
      .insert({ project_id: projectId, amount, note, created_by: userId })
      .select()
      .single();
    if (error) throw error;
    await logChangelog({
      projectId,
      userId,
      entityType: 'debt_adjustment',
      entityId: data.id,
      action: 'created',
      summary: `Пополнение долга: +${amount}`,
      newValue: data
    });
    return data;
  },

  async getTotalDebt(projectId) {
    const debts = await this.list(projectId);
    const { data: adjRows, error: adjErr } = await supabase
      .from('debt_adjustments')
      .select('amount')
      .eq('project_id', projectId);
    if (adjErr) logger.warn('debt_adjustments read failed:', adjErr);
    const sumDebts = debts.reduce((s, d) => s + parseFloat(d.amount), 0);
    const sumAdj = (adjRows || []).reduce((s, d) => s + parseFloat(d.amount), 0);
    return sumDebts + sumAdj;
  }
};

const floatingIncomeService = {
  async listForMonth(projectId, year, month) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0);
    const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    const { data, error } = await supabase
      .from('floating_incomes')
      .select('*')
      .eq('project_id', projectId)
      .gte('income_date', start)
      .lte('income_date', end)
      .order('income_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async sumForMonth(projectId, date = new Date()) {
    const rows = await this.listForMonth(projectId, date.getFullYear(), date.getMonth() + 1);
    return rows.reduce((s, r) => s + parseFloat(r.amount), 0);
  },

  async create(row, userId) {
    const project = await projectService.findById(row.project_id);
    const currency = project?.budget_currency || row.currency || 'RUB';
    const incomeDate = row.income_date || toDateOnly();
    const description = row.description || 'Плавающий доход';

    const { data: income, error: incomeError } = await supabase
      .from('incomes')
      .insert({
        user_id: userId,
        project_id: row.project_id,
        amount: row.amount,
        currency,
        category: row.category || 'Плавающий доход',
        description,
        income_date: incomeDate,
        source: 'floating_income'
      })
      .select()
      .single();
    if (incomeError) throw incomeError;

    const payload = { ...row, description, income_date: incomeDate, income_id: income.id, created_by: userId };
    const { data, error } = await supabase.from('floating_incomes').insert(payload).select().single();
    if (error) {
      try {
        await supabase.from('incomes').delete().eq('id', income.id);
      } catch (rollbackError) {
        logger.warn('floating income rollback failed:', rollbackError.message);
      }
      throw error;
    }
    await logChangelog({
      projectId: row.project_id,
      userId,
      entityType: 'floating_income',
      entityId: data.id,
      action: 'created',
      summary: `Плавающий доход: +${data.amount}`,
      newValue: data
    });
    return { ...data, income };
  }
};

const weeklyCategoryGuideService = {
  normalizeCategory: normalizeGuideCategory,

  async list(projectId, includeInactive = false) {
    let query = supabase
      .from('weekly_category_guides')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async create(row, userId) {
    const payload = {
      ...row,
      categories: normalizeGuideCategories(row.categories?.length ? row.categories : [row.title]),
      created_by: userId,
      updated_by: userId
    };
    const { data, error } = await supabase
      .from('weekly_category_guides')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    await logChangelog({
      projectId: row.project_id,
      userId,
      entityType: 'weekly_category_guide',
      entityId: data.id,
      action: 'created',
      summary: `Добавлен недельный ориентир: ${data.title} ${data.amount}`,
      newValue: data
    });
    return data;
  },

  async update(id, updates, userId, projectId) {
    const { data: old } = await supabase.from('weekly_category_guides').select('*').eq('id', id).single();
    const payload = {
      ...updates,
      updated_by: userId,
      updated_at: new Date().toISOString()
    };
    if (payload.categories) payload.categories = normalizeGuideCategories(payload.categories);
    const { data, error } = await supabase
      .from('weekly_category_guides')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    await logChangelog({
      projectId,
      userId,
      entityType: 'weekly_category_guide',
      entityId: id,
      action: 'updated',
      summary: `Изменён недельный ориентир: ${old?.title || id}`,
      oldValue: old,
      newValue: data
    });
    return data;
  },

  async delete(id, userId, projectId) {
    const { data: old } = await supabase.from('weekly_category_guides').select('*').eq('id', id).single();
    const { error } = await supabase.from('weekly_category_guides').delete().eq('id', id);
    if (error) throw error;
    await logChangelog({
      projectId,
      userId,
      entityType: 'weekly_category_guide',
      entityId: id,
      action: 'deleted',
      summary: `Удалён недельный ориентир: ${old?.title}`,
      oldValue: old
    });
    return old;
  },

  async getProgress(projectOrId, date = new Date()) {
    const project = typeof projectOrId === 'string'
      ? await projectService.findById(projectOrId)
      : projectOrId;
    const projectId = project?.id || projectOrId;
    const currency = project?.budget_currency || 'RUB';
    const bounds = currentWeekBounds(date);
    const guides = await this.list(projectId);
    if (!guides.length) return { bounds, currency, guides: [] };

    const { data: rows, error } = await supabase
      .from('expenses')
      .select('id, amount, currency, category, description, expense_date, transfer_id')
      .eq('project_id', projectId)
      .gte('expense_date', bounds.start)
      .lte('expense_date', bounds.end);
    if (error) throw error;

    const realRows = (rows || []).filter((row) => !row.transfer_id && (!row.currency || row.currency === currency));
    const progressGuides = guides.map((guide) => {
      const categoryKeys = (guide.categories || []).map(normalizeGuideCategory).filter(Boolean);
      const matchedRows = realRows.filter((row) => categoryKeys.includes(normalizeGuideCategory(row.category)));
      const spent = matchedRows.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount || 0)), 0);
      const amount = parseFloat(guide.amount || 0);
      return {
        ...guide,
        amount,
        spent,
        remaining: amount - spent,
        percent: amount > 0 ? Math.round((spent / amount) * 100) : 0,
        transactionCount: matchedRows.length,
        matchedExpenseIds: matchedRows.map((row) => row.id)
      };
    });

    return { bounds, currency, guides: progressGuides };
  },

  async findMatchingGuides(projectId, category) {
    const categoryKey = normalizeGuideCategory(category);
    if (!categoryKey) return [];
    const guides = await this.list(projectId);
    return guides.filter((guide) =>
      (guide.categories || []).map(normalizeGuideCategory).includes(categoryKey)
    );
  }
};

const plannedOccurrenceService = {
  async ensureForDate(projectId, date = new Date()) {
    const dateString = toDateOnly(date);
    const [payments, incomes] = await Promise.all([
      plannedPaymentService.list(projectId),
      plannedIncomeService.list(projectId)
    ]);

    const rows = [];
    for (const payment of payments) {
      const dueDate = monthlyDueDate(dateString, payment.day_of_month);
      if (dueDate === dateString) {
        rows.push({
          project_id: projectId,
          item_type: 'payment',
          item_id: payment.id,
          due_date: dueDate,
          scheduled_date: dueDate
        });
      }
    }
    for (const income of incomes) {
      const dueDate = monthlyDueDate(dateString, income.day_of_month);
      if (dueDate === dateString) {
        rows.push({
          project_id: projectId,
          item_type: 'income',
          item_id: income.id,
          due_date: dueDate,
          scheduled_date: dueDate
        });
      }
    }

    if (rows.length === 0) return [];
    const { error } = await supabase
      .from('planned_item_events')
      .upsert(rows, { onConflict: 'project_id,item_type,item_id,due_date', ignoreDuplicates: true });
    if (error) throw error;
    return rows;
  },

  async listDueForUser(projectId, userId, date = new Date()) {
    const dateString = toDateOnly(date);
    await this.ensureForDate(projectId, dateString);

    const { data: events, error } = await supabase
      .from('planned_item_events')
      .select('*')
      .eq('project_id', projectId)
      .in('status', ['pending', 'postponed'])
      .lte('scheduled_date', dateString)
      .order('scheduled_date', { ascending: true });
    if (error) throw error;

    const due = [];
    for (const event of events || []) {
      const { data: reminder, error: reminderError } = await supabase
        .from('planned_item_event_reminders')
        .select('id')
        .eq('event_id', event.id)
        .eq('user_id', userId)
        .eq('reminder_date', dateString)
        .maybeSingle();
      if (reminderError && reminderError.code !== 'PGRST116') throw reminderError;
      if (!reminder) due.push(event);
    }
    return due;
  },

  async markReminderSent(eventId, userId, date = new Date()) {
    const { error } = await supabase
      .from('planned_item_event_reminders')
      .upsert(
        { event_id: eventId, user_id: userId, reminder_date: toDateOnly(date) },
        { onConflict: 'event_id,user_id,reminder_date', ignoreDuplicates: true }
      );
    if (error) logger.warn('planned reminder mark failed:', error.message);
  },

  async getEventWithItem(eventId) {
    const { data: event, error } = await supabase
      .from('planned_item_events')
      .select('*')
      .eq('id', eventId)
      .single();
    if (error) throw error;

    const table = event.item_type === 'income' ? 'planned_incomes' : 'planned_payments';
    const { data: item, error: itemError } = await supabase
      .from(table)
      .select('*')
      .eq('id', event.item_id)
      .single();
    if (itemError) throw itemError;
    return { event, item };
  },

  async complete(eventId, userId) {
    const { event, item } = await this.getEventWithItem(eventId);
    if (event.status === 'done') return { event, item, alreadyDone: true };

    const project = await projectService.findById(event.project_id);
    const currency = project?.budget_currency || 'RUB';
    const date = event.scheduled_date || event.due_date;
    const isIncome = event.item_type === 'income';
    const table = isIncome ? 'incomes' : 'expenses';
    const dateField = isIncome ? 'income_date' : 'expense_date';
    const category = item.category || (isIncome ? 'Ожидаемые доходы' : 'Обязательные платежи');
    const source = isIncome ? 'planned_income' : 'planned_payment';

    let createdTransaction = false;
    let { data: transaction, error: existingTxError } = await supabase
      .from(table)
      .select('*')
      .eq('project_id', event.project_id)
      .eq('amount', item.amount)
      .eq('currency', currency)
      .eq('category', category)
      .eq('description', item.title)
      .eq(dateField, date)
      .eq('source', source)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingTxError && existingTxError.code !== 'PGRST116') throw existingTxError;

    if (!transaction) {
      const { data: inserted, error: txError } = await supabase
        .from(table)
        .insert({
          user_id: userId,
          project_id: event.project_id,
          amount: item.amount,
          currency,
          category,
          description: item.title,
          [dateField]: date,
          source
        })
        .select()
        .single();
      if (txError) throw txError;
      transaction = inserted;
      createdTransaction = true;
    }

    const { data: updated, error: updateError } = await supabase
      .from('planned_item_events')
      .update({
        status: 'done',
        transaction_id: transaction.id,
        completed_by: userId,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', eventId)
      .select()
      .single();
    if (updateError) {
      if (createdTransaction) {
        const rollbackId = transaction.id;
        const { error: rollbackError } = await supabase.from(table).delete().eq('id', rollbackId);
        if (rollbackError) {
          logger.warn('planned occurrence transaction rollback failed:', rollbackError.message);
        }
      }
      throw updateError;
    }

    await logChangelog({
      projectId: event.project_id,
      userId,
      entityType: 'planned_item_event',
      entityId: eventId,
      action: 'completed',
      summary: `${isIncome ? 'Доход пришёл' : 'Платёж оплачен'}: ${item.title} ${item.amount}`,
      oldValue: event,
      newValue: updated
    });

    return { event: updated, item, transaction, project };
  },

  async postpone(eventId, userId, targetDate) {
    const { event, item } = await this.getEventWithItem(eventId);
    if (event.status === 'done') return { event, item, alreadyDone: true };

    const { data: updated, error } = await supabase
      .from('planned_item_events')
      .update({
        scheduled_date: targetDate,
        status: 'postponed',
        postponed_by: userId,
        postponed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', eventId)
      .select()
      .single();
    if (error) throw error;

    await logChangelog({
      projectId: event.project_id,
      userId,
      entityType: 'planned_item_event',
      entityId: eventId,
      action: 'postponed',
      summary: `Перенос: ${item.title} на ${targetDate}`,
      oldValue: event,
      newValue: updated
    });

    return { event: updated, item };
  },

  nextPostponeDate(event, item, mode) {
    const base = event.scheduled_date || event.due_date || toDateOnly();
    if (mode === 'tomorrow') return addDays(base, 1);
    if (mode === '3d') return addDays(base, 3);
    if (mode === 'next_month') return nextMonthDueDate(base, item.day_of_month);
    return null;
  }
};

const changelogService = {
  async recent(projectId, days = 14) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data, error } = await supabase
      .from('budget_changelog')
      .select('*, user:users(id, username, first_name)')
      .eq('project_id', projectId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return data || [];
  }
};

module.exports = {
  FAMILY_KEYWORDS,
  FAMILY_PROJECT_NAME,
  currentPlanMonth,
  currentWeekBounds,
  familyMemberStateService,
  familyProjectService,
  getFamilyParticipantIds,
  plannedPaymentService,
  plannedIncomeService,
  debtService,
  floatingIncomeService,
  weeklyCategoryGuideService,
  plannedOccurrenceService,
  changelogService,
  logChangelog,
  notifyPartners,
  partnerLabel
};
