-- RLS guardrails for direct Supabase access.
--
-- The Telegram bot backend currently uses the service-role key; service-role
-- bypasses RLS by design. Keep that key server-only. These policies protect
-- the database if an anon/authenticated key is ever used directly from a
-- client or a leaked non-service key reaches the browser.
--
-- For direct client access, pass the Telegram id as a JWT claim named
-- telegram_id. Requests without that claim are denied by these policies.

create schema if not exists app;

create or replace function app.current_telegram_user_id()
returns bigint
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'telegram_id', '')::bigint;
$$;

create or replace function app.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
    from projects p
    where p.id = target_project_id
      and (
        p.owner_id = app.current_telegram_user_id()
        or exists (
          select 1
          from project_members pm
          where pm.project_id = p.id
            and pm.user_id = app.current_telegram_user_id()
        )
      )
  );
$$;

alter table if exists users enable row level security;
alter table if exists projects enable row level security;
alter table if exists project_members enable row level security;
alter table if exists expenses enable row level security;
alter table if exists incomes enable row level security;
alter table if exists user_patterns enable row level security;
alter table if exists custom_categories enable row level security;
alter table if exists planned_payments enable row level security;
alter table if exists planned_incomes enable row level security;
alter table if exists debts enable row level security;
alter table if exists debt_adjustments enable row level security;
alter table if exists floating_incomes enable row level security;
alter table if exists planned_item_events enable row level security;
alter table if exists planned_item_event_reminders enable row level security;
alter table if exists budget_changelog enable row level security;
alter table if exists project_invites enable row level security;
alter table if exists project_sheets enable row level security;
alter table if exists project_sheet_access enable row level security;
alter table if exists weekly_category_guides enable row level security;

drop policy if exists users_own_row on users;
create policy users_own_row on users
  for all
  using (id = app.current_telegram_user_id())
  with check (id = app.current_telegram_user_id());

drop policy if exists projects_accessible on projects;
create policy projects_accessible on projects
  for all
  using (
    owner_id = app.current_telegram_user_id()
    or exists (
      select 1 from project_members pm
      where pm.project_id = projects.id
        and pm.user_id = app.current_telegram_user_id()
    )
  )
  with check (owner_id = app.current_telegram_user_id());

drop policy if exists project_members_accessible on project_members;
create policy project_members_accessible on project_members
  for all
  using (
    user_id = app.current_telegram_user_id()
    or app.can_access_project(project_id)
  )
  with check (app.can_access_project(project_id));

drop policy if exists expenses_accessible on expenses;
create policy expenses_accessible on expenses
  for all
  using (
    user_id = app.current_telegram_user_id()
    or app.can_access_project(project_id)
  )
  with check (
    user_id = app.current_telegram_user_id()
    and app.can_access_project(project_id)
  );

drop policy if exists incomes_accessible on incomes;
create policy incomes_accessible on incomes
  for all
  using (
    user_id = app.current_telegram_user_id()
    or app.can_access_project(project_id)
  )
  with check (
    user_id = app.current_telegram_user_id()
    and app.can_access_project(project_id)
  );

drop policy if exists user_patterns_own_rows on user_patterns;
create policy user_patterns_own_rows on user_patterns
  for all
  using (user_id = app.current_telegram_user_id())
  with check (user_id = app.current_telegram_user_id());

drop policy if exists custom_categories_own_rows on custom_categories;
create policy custom_categories_own_rows on custom_categories
  for all
  using (user_id = app.current_telegram_user_id())
  with check (user_id = app.current_telegram_user_id());

drop policy if exists planned_payments_project_access on planned_payments;
create policy planned_payments_project_access on planned_payments
  for all
  using (app.can_access_project(project_id))
  with check (app.can_access_project(project_id));

drop policy if exists planned_incomes_project_access on planned_incomes;
create policy planned_incomes_project_access on planned_incomes
  for all
  using (app.can_access_project(project_id))
  with check (app.can_access_project(project_id));

drop policy if exists debts_project_access on debts;
create policy debts_project_access on debts
  for all
  using (app.can_access_project(project_id))
  with check (app.can_access_project(project_id));

drop policy if exists debt_adjustments_project_access on debt_adjustments;
create policy debt_adjustments_project_access on debt_adjustments
  for all
  using (app.can_access_project(project_id))
  with check (app.can_access_project(project_id));

drop policy if exists floating_incomes_project_access on floating_incomes;
create policy floating_incomes_project_access on floating_incomes
  for all
  using (app.can_access_project(project_id))
  with check (app.can_access_project(project_id));

drop policy if exists planned_item_events_project_access on planned_item_events;
create policy planned_item_events_project_access on planned_item_events
  for all
  using (app.can_access_project(project_id))
  with check (app.can_access_project(project_id));

drop policy if exists planned_item_event_reminders_access on planned_item_event_reminders;
create policy planned_item_event_reminders_access on planned_item_event_reminders
  for all
  using (
    user_id = app.current_telegram_user_id()
    or exists (
      select 1
      from planned_item_events e
      where e.id = planned_item_event_reminders.event_id
        and app.can_access_project(e.project_id)
    )
  )
  with check (user_id = app.current_telegram_user_id());

drop policy if exists budget_changelog_project_access on budget_changelog;
create policy budget_changelog_project_access on budget_changelog
  for all
  using (app.can_access_project(project_id))
  with check (app.can_access_project(project_id));

drop policy if exists project_invites_project_access on project_invites;
create policy project_invites_project_access on project_invites
  for all
  using (app.can_access_project(project_id))
  with check (app.can_access_project(project_id));

drop policy if exists project_sheets_project_access on project_sheets;
create policy project_sheets_project_access on project_sheets
  for all
  using (
    owner_user_id = app.current_telegram_user_id()
    or connected_by_user_id = app.current_telegram_user_id()
    or app.can_access_project(project_id)
  )
  with check (app.can_access_project(project_id));

drop policy if exists project_sheet_access_accessible on project_sheet_access;
create policy project_sheet_access_accessible on project_sheet_access
  for all
  using (
    user_id = app.current_telegram_user_id()
    or exists (
      select 1
      from project_sheets ps
      where ps.id = project_sheet_access.project_sheet_id
        and app.can_access_project(ps.project_id)
    )
  )
  with check (
    user_id = app.current_telegram_user_id()
    or exists (
      select 1
      from project_sheets ps
      where ps.id = project_sheet_access.project_sheet_id
        and app.can_access_project(ps.project_id)
    )
  );

drop policy if exists weekly_category_guides_project_access on weekly_category_guides;
create policy weekly_category_guides_project_access on weekly_category_guides
  for all
  using (app.can_access_project(project_id))
  with check (app.can_access_project(project_id));
