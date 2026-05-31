const { supabase, projectService, projectMemberService, userService } = require('./supabase');
const logger = require('../utils/logger');

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
    const payload = { ...row, created_by: userId };
    const { data, error } = await supabase.from('floating_incomes').insert(payload).select().single();
    if (error) throw error;
    await logChangelog({
      projectId: row.project_id,
      userId,
      entityType: 'floating_income',
      entityId: data.id,
      action: 'created',
      summary: `Плавающий доход: +${data.amount}`,
      newValue: data
    });
    return data;
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
  familyMemberStateService,
  familyProjectService,
  getFamilyParticipantIds,
  plannedPaymentService,
  plannedIncomeService,
  debtService,
  floatingIncomeService,
  changelogService,
  logChangelog,
  notifyPartners,
  partnerLabel
};
