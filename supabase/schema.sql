-- Ampara · schema Supabase (PostgreSQL) com RLS
-- Espelha src/domain/types.ts. Colunas em snake_case (o adaptador converte camelCase).
-- IDs gerados no cliente (UUID) tornam o upsert do outbox idempotente.
-- Não aplicado automaticamente: rode no SQL Editor do seu projeto Supabase.

create table if not exists couples (
  id text primary key,
  invite_code text unique not null,
  paired_at timestamptz not null default now(),
  split_mode text not null check (split_mode in ('50_50', 'PROPORTIONAL')),
  ratio_a_bps integer not null default 5000 check (ratio_a_bps between 0 and 10000)
);

create table if not exists couple_members (
  couple_id text not null references couples (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  partner_id text not null check (partner_id in ('A', 'B')),
  primary key (couple_id, partner_id),
  unique (user_id)
);

create table if not exists profiles (
  id text not null check (id in ('A', 'B')),
  couple_id text not null references couples (id) on delete cascade,
  display_name text not null,
  pronoun text not null check (pronoun in ('ele', 'ela')),
  energy text not null check (energy in ('FULL', 'MEDIUM', 'OVERLOAD')),
  energy_updated_at timestamptz,
  share_personal_finances boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (couple_id, id)
);

create table if not exists tasks (
  id uuid primary key,
  couple_id text not null references couples (id) on delete cascade,
  created_by text not null,
  assigned_to text,
  title text not null,
  effort text not null check (effort in ('QUICK_5M', 'FOCUS')),
  status text not null check (status in ('PENDING', 'DONE', 'ARCHIVED')),
  due_date date,
  due_time text,
  visible_to_partner boolean not null default true,
  sent_by text,
  completed_at timestamptz,
  completed_by text,
  source_medication_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tasks_couple_date_status on tasks (couple_id, due_date, status);

create table if not exists events (
  id uuid primary key,
  couple_id text not null references couples (id) on delete cascade,
  title text not null,
  date date not null,
  start text not null,
  "end" text not null,
  kind text not null check (kind in ('COUPLE', 'HEALTH', 'PERSONAL')),
  owner_id text,
  updated_at timestamptz not null default now()
);

create table if not exists medications (
  id uuid primary key,
  couple_id text not null references couples (id) on delete cascade,
  kind text not null check (kind in ('MED', 'ROUTINE')),
  owner_id text,
  name text not null,
  dosage text not null,
  times jsonb not null,
  weekdays jsonb not null default '[]',
  stock_count integer,
  low_stock_threshold integer not null default 5,
  notify_partner_on_delay boolean not null default false,
  delay_minutes_threshold integer not null default 30,
  updated_at timestamptz not null default now()
);

create table if not exists medication_logs (
  id text primary key, -- medicationId@date@time: confirmar duas vezes não duplica
  couple_id text not null references couples (id) on delete cascade,
  medication_id uuid not null references medications (id) on delete cascade,
  scheduled_date date not null,
  scheduled_time text not null,
  status text not null check (status in ('PENDING', 'SNOOZED_WATER', 'TAKEN', 'SKIPPED')),
  taken_at timestamptz,
  confirmed_by text,
  snooze_count integer not null default 0,
  snooze_until timestamptz,
  skip_reason text,
  updated_at timestamptz not null default now()
);
create index if not exists idx_med_logs_date_status on medication_logs (scheduled_date, status);

create table if not exists transactions (
  id uuid primary key,
  couple_id text not null references couples (id) on delete cascade,
  created_by text not null,
  paid_by text not null,
  scope text not null check (scope in ('PERSONAL', 'COUPLE')),
  is_secret_gift boolean not null default false,
  type text not null check (type in ('EXPENSE', 'INCOME', 'SETTLEMENT')),
  status text not null check (status in ('PREDICTED_DASHED', 'CONFIRMED_SOLID')),
  amount_cents bigint not null check (amount_cents >= 0),
  category text not null,
  description text not null,
  split_rule text,
  partner_a_share_cents bigint not null default 0,
  partner_b_share_cents bigint not null default 0,
  competence_date date not null,
  updated_at timestamptz not null default now(),
  check (scope = 'PERSONAL' or partner_a_share_cents + partner_b_share_cents = amount_cents or type = 'SETTLEMENT')
);
create index if not exists idx_tx_couple_competence_scope on transactions (couple_id, competence_date, scope);

create table if not exists help_requests (
  id uuid primary key,
  couple_id text not null references couples (id) on delete cascade,
  requester_id text not null,
  target_task_id uuid,
  situation text not null,
  help_type text not null check (help_type in ('TAKE_OVER', 'BODY_DOUBLING', 'REMIND_ME')),
  urgency text not null check (urgency in ('NOW', 'TODAY', 'THIS_WEEK')),
  status text not null check (status in ('OPEN', 'ACCEPTED', 'RESOLVED')),
  response text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nudges (
  id uuid primary key,
  couple_id text not null references couples (id) on delete cascade,
  "from" text not null,
  "to" text not null,
  medication_log_id text not null,
  message text not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Helpers de identidade
create or replace function my_couple_id() returns text language sql stable security definer as $$
  select couple_id from couple_members where user_id = auth.uid()
$$;
create or replace function my_partner_id() returns text language sql stable security definer as $$
  select partner_id from couple_members where user_id = auth.uid()
$$;

-- RLS: tudo restrito ao próprio casal
do $$
declare t text;
begin
  foreach t in array array['couples','profiles','tasks','events','medications','medication_logs','help_requests','nudges','transactions'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy couple_rw on couples for all using (id = my_couple_id()) with check (id = my_couple_id());
create policy couple_rw on profiles for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
create policy couple_rw on events for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
create policy couple_rw on help_requests for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
create policy couple_rw on nudges for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
create policy couple_rw on medication_logs for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());

-- Tarefas: do casal, minhas, enviadas por mim ou visíveis pelo dono
create policy tasks_read on tasks for select using (
  couple_id = my_couple_id() and status <> 'ARCHIVED' and (
    assigned_to is null or assigned_to = my_partner_id() or sent_by = my_partner_id() or visible_to_partner
  )
);
create policy tasks_write on tasks for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());

-- Remédios: meus, rotinas da casa, ou do par com rede de apoio ligada
create policy meds_read on medications for select using (
  couple_id = my_couple_id() and (owner_id is null or owner_id = my_partner_id() or notify_partner_on_delay)
);
create policy meds_write on medications for all using (couple_id = my_couple_id() and (owner_id is null or owner_id = my_partner_id()))
  with check (couple_id = my_couple_id());

-- Privacidade financeira (doc 04, seção 4): espelho de src/domain/privacy.ts
create policy tx_read on transactions for select using (
  couple_id = my_couple_id() and (
    created_by = my_partner_id()
    or scope = 'COUPLE'
    or (
      scope = 'PERSONAL' and is_secret_gift = false and exists (
        select 1 from profiles p
        where p.couple_id = transactions.couple_id and p.id = transactions.created_by and p.share_personal_finances = true
      )
    )
  )
);
-- Só o autor grava lançamentos pessoais; gastos do casal qualquer um dos dois
create policy tx_write on transactions for all using (
  couple_id = my_couple_id() and (scope = 'COUPLE' or created_by = my_partner_id())
) with check (couple_id = my_couple_id() and (scope = 'COUPLE' or created_by = my_partner_id()));
