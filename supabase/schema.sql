-- Ampara · schema Supabase (PostgreSQL) com RLS
-- Espelha src/domain/types.ts. Colunas em snake_case (o adaptador converte camelCase).
-- IDs gerados no cliente (UUID) tornam o upsert do outbox idempotente.
-- Idempotente: pode rodar de novo (SQL Editor do Supabase ou `docker compose up`, que aplica sozinho).

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

drop policy if exists couple_rw on couples;
create policy couple_rw on couples for all using (id = my_couple_id()) with check (id = my_couple_id());
drop policy if exists couple_rw on profiles;
create policy couple_rw on profiles for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
-- events e medication_logs têm políticas próprias mais abaixo (privacidade); a antiga "couple_rw" sai
drop policy if exists couple_rw on events;
drop policy if exists couple_rw on help_requests;
create policy couple_rw on help_requests for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
drop policy if exists couple_rw on nudges;
create policy couple_rw on nudges for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
drop policy if exists couple_rw on medication_logs;

-- Compromissos: do casal (owner_id nulo) ou meus. "Meu · só você vê" não chega ao par nem pode ser
-- alterado por ele(a). Gravação por comando: "for all" também valeria para SELECT.
drop policy if exists events_read on events;
create policy events_read on events for select using (
  couple_id = my_couple_id() and (owner_id is null or owner_id = my_partner_id())
);
drop policy if exists events_insert on events;
create policy events_insert on events for insert with check (
  couple_id = my_couple_id() and (owner_id is null or owner_id = my_partner_id())
);
drop policy if exists events_update on events;
create policy events_update on events for update using (
  couple_id = my_couple_id() and (owner_id is null or owner_id = my_partner_id())
) with check (couple_id = my_couple_id() and (owner_id is null or owner_id = my_partner_id()));
drop policy if exists events_delete on events;
create policy events_delete on events for delete using (
  couple_id = my_couple_id() and (owner_id is null or owner_id = my_partner_id())
);

-- Tarefas: do casal, minhas, enviadas por mim ou visíveis pelo dono (arquivadas também descem, para o
-- arquivamento chegar ao outro aparelho; o app as esconde)
drop policy if exists tasks_read on tasks;
create policy tasks_read on tasks for select using (
  couple_id = my_couple_id() and (
    assigned_to is null or assigned_to = my_partner_id() or sent_by = my_partner_id() or visible_to_partner
  )
);
-- Gravação separada por comando: uma política "for all" também vale para SELECT (políticas permissivas
-- somam com OR) e vazaria as tarefas privadas do par. Alterar/apagar só o que a pessoa consegue ver.
drop policy if exists tasks_write on tasks;
drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert with check (couple_id = my_couple_id());
drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update using (
  couple_id = my_couple_id() and (
    assigned_to is null or assigned_to = my_partner_id() or sent_by = my_partner_id() or visible_to_partner
  )
) with check (couple_id = my_couple_id());
drop policy if exists tasks_delete on tasks;
create policy tasks_delete on tasks for delete using (
  couple_id = my_couple_id() and (
    assigned_to is null or assigned_to = my_partner_id() or sent_by = my_partner_id() or visible_to_partner
  )
);

-- Remédios: meus, rotinas da casa, ou do par com rede de apoio ligada
drop policy if exists meds_read on medications;
create policy meds_read on medications for select using (
  couple_id = my_couple_id() and (owner_id is null or owner_id = my_partner_id() or notify_partner_on_delay)
);
-- Gravar só o que é meu ou rotina da casa; o with check impede criar ou passar um remédio para o nome do par
drop policy if exists meds_write on medications;
drop policy if exists meds_insert on medications;
create policy meds_insert on medications for insert with check (
  couple_id = my_couple_id() and (owner_id is null or owner_id = my_partner_id())
);
drop policy if exists meds_update on medications;
create policy meds_update on medications for update using (
  couple_id = my_couple_id() and (owner_id is null or owner_id = my_partner_id())
) with check (couple_id = my_couple_id() and (owner_id is null or owner_id = my_partner_id()));
drop policy if exists meds_delete on medications;
create policy meds_delete on medications for delete using (
  couple_id = my_couple_id() and (owner_id is null or owner_id = my_partner_id())
);

-- Doses: seguem o remédio. Só existe dose visível de remédio visível (meu, da casa ou com rede de apoio);
-- a subconsulta passa pelo RLS de medications. Quem apoia confirma a dose do par, então grava também.
drop policy if exists logs_read on medication_logs;
create policy logs_read on medication_logs for select using (
  couple_id = my_couple_id() and exists (select 1 from medications m where m.id = medication_logs.medication_id)
);
drop policy if exists logs_insert on medication_logs;
create policy logs_insert on medication_logs for insert with check (
  couple_id = my_couple_id() and exists (select 1 from medications m where m.id = medication_logs.medication_id)
);
drop policy if exists logs_update on medication_logs;
create policy logs_update on medication_logs for update using (
  couple_id = my_couple_id() and exists (select 1 from medications m where m.id = medication_logs.medication_id)
) with check (couple_id = my_couple_id() and exists (select 1 from medications m where m.id = medication_logs.medication_id));
drop policy if exists logs_delete on medication_logs;
create policy logs_delete on medication_logs for delete using (
  couple_id = my_couple_id() and exists (select 1 from medications m where m.id = medication_logs.medication_id)
);

-- Privacidade financeira (doc 04, seção 4): espelho de src/domain/privacy.ts
drop policy if exists tx_read on transactions;
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
drop policy if exists tx_write on transactions;
drop policy if exists tx_insert on transactions;
create policy tx_insert on transactions for insert with check (
  couple_id = my_couple_id() and (scope = 'COUPLE' or created_by = my_partner_id())
);
drop policy if exists tx_update on transactions;
create policy tx_update on transactions for update using (
  couple_id = my_couple_id() and (scope = 'COUPLE' or created_by = my_partner_id())
) with check (couple_id = my_couple_id() and (scope = 'COUPLE' or created_by = my_partner_id()));
drop policy if exists tx_delete on transactions;
create policy tx_delete on transactions for delete using (
  couple_id = my_couple_id() and (scope = 'COUPLE' or created_by = my_partner_id())
);

-- =====================================================================
-- Iteração 3: nuvem entre aparelhos (pareamento por convite + exclusão lógica)
-- =====================================================================
-- No Supabase o pgcrypto fica no schema "extensions" (digest() não está em public): as funções
-- que usam digest() incluem "extensions" no search_path.
create extension if not exists pgcrypto;

-- Exclusão lógica: remoções (ex.: Desfazer) chegam ao outro aparelho pelo pull incremental
do $$
declare t text;
begin
  foreach t in array array['tasks','events','medications','medication_logs','transactions','help_requests','nudges'] loop
    execute format('alter table %I add column if not exists deleted boolean not null default false', t);
    execute format('create index if not exists %I on %I (couple_id, updated_at)', 'idx_' || t || '_pull', t);
  end loop;
end $$;
alter table couples add column if not exists updated_at timestamptz not null default now();
alter table couples add column if not exists invite_code text;
alter table couples alter column invite_code drop not null;

-- Convites guardam só o hash do código; valem 7 dias e uma vez
create table if not exists couple_invites (
  code_hash text primary key,
  couple_id text not null references couples (id) on delete cascade,
  partner_id text not null check (partner_id in ('A', 'B')),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz
);
alter table couple_invites enable row level security; -- sem política: só as funções abaixo acessam
alter table couple_members enable row level security;
drop policy if exists members_read on couple_members;
create policy members_read on couple_members for select using (couple_id = my_couple_id());

-- Cria o espaço na nuvem: quem chama vira o Parceiro A
create or replace function create_couple(p_couple_id text, p_split_mode text, p_ratio_a_bps integer)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from couple_members where user_id = auth.uid()) then raise exception 'already paired'; end if;
  insert into couples (id, split_mode, ratio_a_bps) values (p_couple_id, p_split_mode, p_ratio_a_bps);
  insert into couple_members (couple_id, user_id, partner_id) values (p_couple_id, auth.uid(), 'A');
  return p_couple_id;
end $$;

-- Registra o convite do par (o código em texto claro nunca é gravado)
create or replace function create_invite(p_code text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_couple text := my_couple_id(); v_partner text;
begin
  if v_couple is null then raise exception 'not paired'; end if;
  v_partner := case my_partner_id() when 'A' then 'B' else 'A' end;
  if exists (select 1 from couple_members where couple_id = v_couple and partner_id = v_partner) then raise exception 'partner already joined'; end if;
  delete from couple_invites where couple_id = v_couple;
  insert into couple_invites (code_hash, couple_id, partner_id)
  values (encode(digest(upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex'), v_couple, v_partner);
end $$;

-- Entra no espaço com o convite: devolve o casal e qual parceiro a pessoa é
create or replace function join_couple(p_code text)
returns table (couple_id text, partner_id text) language plpgsql security definer set search_path = public, extensions as $$
declare v_inv couple_invites;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_inv from couple_invites
   where code_hash = encode(digest(upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex')
     and used_at is null and expires_at > now()
   for update;
  if not found then raise exception 'invalid invite'; end if;
  insert into couple_members (couple_id, user_id, partner_id) values (v_inv.couple_id, auth.uid(), v_inv.partner_id);
  update couple_invites set used_at = now() where code_hash = v_inv.code_hash;
  return query select v_inv.couple_id, v_inv.partner_id;
end $$;

-- Quem sou eu no espaço (usado ao entrar em um aparelho novo)
create or replace function my_membership()
returns table (couple_id text, partner_id text) language sql stable security definer set search_path = public as $$
  select couple_id, partner_id from couple_members where user_id = auth.uid()
$$;

revoke all on function create_couple(text, text, integer), create_invite(text), join_couple(text), my_membership() from public, anon;
grant execute on function create_couple(text, text, integer), create_invite(text), join_couple(text), my_membership() to authenticated;

-- Cursor de pull carimbado pelo servidor: relógios diferentes entre aparelhos não fazem perder alterações.
-- updated_at continua sendo o relógio de quem editou (usado para "última edição vence").
create or replace function touch_synced_at() returns trigger language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['couples','profiles','tasks','events','medications','medication_logs','transactions','help_requests','nudges'] loop
    execute format('alter table %I add column if not exists synced_at timestamptz not null default clock_timestamp()', t);
    execute format('drop trigger if exists trg_%I_synced on %I', t, t);
    execute format('create trigger trg_%I_synced before insert or update on %I for each row execute function touch_synced_at()', t, t);
  end loop;
end $$;

-- =====================================================================
-- Iteração 5: cadastro de remédios, rotinas e compromissos pelo app
-- =====================================================================
-- Compromisso pode ser "conta que vence" (marcador triangular no calendário)
alter table events drop constraint if exists events_kind_check;
alter table events add constraint events_kind_check check (kind in ('COUPLE', 'HEALTH', 'PERSONAL', 'BILL'));
-- Rotina da casa continua confirmável por qualquer um (owner_id nulo); "responsável" é só referência
alter table medications add column if not exists assignee text check (assignee in ('A', 'B'));
-- Unidade do estoque (comprimidos, unidades, sachês...)
alter table medications add column if not exists stock_unit text;

-- =====================================================================
-- Iteração 9: ciclo menstrual (dado de saúde; espelho de src/domain/cycle.ts)
-- =====================================================================
-- Ajustes: um por pessoa, legíveis pelo casal para o par saber na hora que o compartilhamento mudou
-- (uma linha que some não avisa ninguém). Com share NONE a linha não diz nada: janela nula (check abaixo)
-- e durações mascaradas pelo app. GENTLE = o par vê só a janela publicada; FULL = vê também os registros.
-- Só a dona grava.
create table if not exists cycle_settings (
  id text not null check (id in ('A', 'B')),
  couple_id text not null references couples (id) on delete cascade,
  share text not null default 'NONE' check (share in ('NONE', 'GENTLE', 'FULL')),
  cycle_days integer not null default 28 check (cycle_days between 20 and 45),
  period_days integer not null default 5 check (period_days between 2 and 10),
  suggest_calm boolean not null default true,
  sensitive_from date,
  sensitive_to date,
  updated_at timestamptz not null default now(),
  primary key (couple_id, id),
  -- "Só eu vejo" nunca publica a janela
  check (share <> 'NONE' or (sensitive_from is null and sensitive_to is null))
);

create table if not exists cycle_logs (
  id uuid primary key,
  couple_id text not null references couples (id) on delete cascade,
  owner_id text not null check (owner_id in ('A', 'B')),
  start_date date not null,
  end_date date,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  check (end_date is null or end_date >= start_date)
);
create index if not exists idx_cycle_logs_pull on cycle_logs (couple_id, updated_at);

alter table cycle_settings enable row level security;
alter table cycle_logs enable row level security;

drop policy if exists cycle_settings_read on cycle_settings;
create policy cycle_settings_read on cycle_settings for select using (couple_id = my_couple_id());
drop policy if exists cycle_settings_insert on cycle_settings;
create policy cycle_settings_insert on cycle_settings for insert with check (couple_id = my_couple_id() and id = my_partner_id());
drop policy if exists cycle_settings_update on cycle_settings;
create policy cycle_settings_update on cycle_settings for update using (couple_id = my_couple_id() and id = my_partner_id())
  with check (couple_id = my_couple_id() and id = my_partner_id());
drop policy if exists cycle_settings_delete on cycle_settings;
create policy cycle_settings_delete on cycle_settings for delete using (couple_id = my_couple_id() and id = my_partner_id());

-- Registros: da dona, ou do par só com "Tudo" (a subconsulta passa pelo RLS de cycle_settings)
drop policy if exists cycle_logs_read on cycle_logs;
create policy cycle_logs_read on cycle_logs for select using (
  couple_id = my_couple_id() and (
    owner_id = my_partner_id() or exists (
      select 1 from cycle_settings s where s.couple_id = cycle_logs.couple_id and s.id = cycle_logs.owner_id and s.share = 'FULL'
    )
  )
);
drop policy if exists cycle_logs_insert on cycle_logs;
create policy cycle_logs_insert on cycle_logs for insert with check (couple_id = my_couple_id() and owner_id = my_partner_id());
drop policy if exists cycle_logs_update on cycle_logs;
create policy cycle_logs_update on cycle_logs for update using (couple_id = my_couple_id() and owner_id = my_partner_id())
  with check (couple_id = my_couple_id() and owner_id = my_partner_id());
drop policy if exists cycle_logs_delete on cycle_logs;
create policy cycle_logs_delete on cycle_logs for delete using (couple_id = my_couple_id() and owner_id = my_partner_id());

do $$
declare t text;
begin
  foreach t in array array['cycle_settings','cycle_logs'] loop
    execute format('alter table %I add column if not exists synced_at timestamptz not null default clock_timestamp()', t);
    execute format('drop trigger if exists trg_%I_synced on %I', t, t);
    execute format('create trigger trg_%I_synced before insert or update on %I for each row execute function touch_synced_at()', t, t);
  end loop;
end $$;

-- =====================================================================
-- Iteração 10: anticoncepcional em cartela (comprimidos + pausa); null = remédio comum
-- =====================================================================
alter table medications add column if not exists pack jsonb;

-- =====================================================================
-- Iteração 11: lista de compras do casal (qualquer um dos dois adiciona, marca e tira)
-- =====================================================================
create table if not exists shopping_items (
  id uuid primary key,
  couple_id text not null references couples (id) on delete cascade,
  title text not null check (length(title) between 1 and 60),
  quantity text check (quantity is null or length(quantity) <= 20),
  category text not null check (category in ('MARKET', 'PHARMACY', 'HOME', 'OTHER')),
  added_by text not null check (added_by in ('A', 'B')),
  checked boolean not null default false,
  checked_by text check (checked_by in ('A', 'B')),
  source_medication_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);
create index if not exists idx_shopping_items_pull on shopping_items (couple_id, updated_at);
alter table shopping_items enable row level security;

drop policy if exists shopping_read on shopping_items;
create policy shopping_read on shopping_items for select using (couple_id = my_couple_id());
drop policy if exists shopping_insert on shopping_items;
create policy shopping_insert on shopping_items for insert with check (couple_id = my_couple_id() and added_by in ('A', 'B'));
drop policy if exists shopping_update on shopping_items;
create policy shopping_update on shopping_items for update using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
drop policy if exists shopping_delete on shopping_items;
create policy shopping_delete on shopping_items for delete using (couple_id = my_couple_id());
drop trigger if exists trg_shopping_items_synced on shopping_items;
create trigger trg_shopping_items_synced before insert or update on shopping_items for each row execute function touch_synced_at();

-- =====================================================================
-- Iteração 12: datas especiais (do casal) e ideias de presente (só de quem anotou: é surpresa)
-- =====================================================================
create table if not exists special_dates (
  id uuid primary key,
  couple_id text not null references couples (id) on delete cascade,
  title text not null check (length(title) between 1 and 60),
  date date not null,
  kind text not null check (kind in ('ANNIVERSARY', 'BIRTHDAY', 'OTHER')),
  person_id text check (person_id in ('A', 'B')),
  created_by text not null check (created_by in ('A', 'B')),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);
create index if not exists idx_special_dates_pull on special_dates (couple_id, updated_at);

create table if not exists gift_ideas (
  id uuid primary key,
  couple_id text not null references couples (id) on delete cascade,
  owner_id text not null check (owner_id in ('A', 'B')),
  title text not null check (length(title) between 1 and 80),
  note text not null default '' check (length(note) <= 280),
  special_date_id uuid,
  status text not null check (status in ('IDEA', 'BOUGHT', 'GIVEN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);
create index if not exists idx_gift_ideas_pull on gift_ideas (couple_id, updated_at);

alter table special_dates enable row level security;
alter table gift_ideas enable row level security;

drop policy if exists special_dates_read on special_dates;
create policy special_dates_read on special_dates for select using (couple_id = my_couple_id());
drop policy if exists special_dates_insert on special_dates;
create policy special_dates_insert on special_dates for insert with check (couple_id = my_couple_id());
drop policy if exists special_dates_update on special_dates;
create policy special_dates_update on special_dates for update using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
drop policy if exists special_dates_delete on special_dates;
create policy special_dates_delete on special_dates for delete using (couple_id = my_couple_id());

-- Presente: o par não lê, não grava e nem fica sabendo que existe
drop policy if exists gift_ideas_read on gift_ideas;
create policy gift_ideas_read on gift_ideas for select using (couple_id = my_couple_id() and owner_id = my_partner_id());
drop policy if exists gift_ideas_insert on gift_ideas;
create policy gift_ideas_insert on gift_ideas for insert with check (couple_id = my_couple_id() and owner_id = my_partner_id());
drop policy if exists gift_ideas_update on gift_ideas;
create policy gift_ideas_update on gift_ideas for update using (couple_id = my_couple_id() and owner_id = my_partner_id())
  with check (couple_id = my_couple_id() and owner_id = my_partner_id());
drop policy if exists gift_ideas_delete on gift_ideas;
create policy gift_ideas_delete on gift_ideas for delete using (couple_id = my_couple_id() and owner_id = my_partner_id());

do $$
declare t text;
begin
  foreach t in array array['special_dates','gift_ideas'] loop
    execute format('drop trigger if exists trg_%I_synced on %I', t, t);
    execute format('create trigger trg_%I_synced before insert or update on %I for each row execute function touch_synced_at()', t, t);
  end loop;
end $$;

-- =====================================================================
-- Iteração 13: check-in do dia e "o que me acalma" (cada um grava o seu; o casal lê)
-- =====================================================================
create table if not exists mood_checkins (
  id text primary key, -- ownerId@data: um por pessoa por dia
  couple_id text not null references couples (id) on delete cascade,
  owner_id text not null check (owner_id in ('A', 'B')),
  date date not null,
  mood text not null check (mood in ('GOOD', 'LOW_ENERGY', 'NEED_CARE', 'NEED_SPACE', 'OVERWHELMED')),
  note text not null default '' check (length(note) <= 120),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);
create index if not exists idx_mood_checkins_pull on mood_checkins (couple_id, updated_at);

create table if not exists comfort_items (
  id uuid primary key,
  couple_id text not null references couples (id) on delete cascade,
  owner_id text not null check (owner_id in ('A', 'B')),
  text text not null check (length(text) between 3 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);
create index if not exists idx_comfort_items_pull on comfort_items (couple_id, updated_at);

do $$
declare t text;
begin
  foreach t in array array['mood_checkins','comfort_items'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (couple_id = my_couple_id())', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('create policy %I on %I for insert with check (couple_id = my_couple_id() and owner_id = my_partner_id())', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('create policy %I on %I for update using (couple_id = my_couple_id() and owner_id = my_partner_id()) with check (couple_id = my_couple_id() and owner_id = my_partner_id())', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format('create policy %I on %I for delete using (couple_id = my_couple_id() and owner_id = my_partner_id())', t || '_delete', t);
    execute format('drop trigger if exists trg_%I_synced on %I', t, t);
    execute format('create trigger trg_%I_synced before insert or update on %I for each row execute function touch_synced_at()', t, t);
  end loop;
end $$;

-- =====================================================================
-- Iteração 14: fazer junto (body doubling) e caixinhas (metas do casal; os dois gravam)
-- =====================================================================
create table if not exists focus_sessions (
  id uuid primary key,
  couple_id text not null references couples (id) on delete cascade,
  started_by text not null check (started_by in ('A', 'B')),
  title text not null check (length(title) between 1 and 80),
  task_id uuid,
  duration_min integer not null check (duration_min between 5 and 120),
  started_at timestamptz not null,
  ends_at timestamptz not null,
  joined_by text check (joined_by in ('A', 'B')),
  status text not null check (status in ('RUNNING', 'DONE', 'CANCELLED')),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);
create index if not exists idx_focus_sessions_pull on focus_sessions (couple_id, updated_at);

create table if not exists savings_goals (
  id uuid primary key,
  couple_id text not null references couples (id) on delete cascade,
  title text not null check (length(title) between 1 and 60),
  target_cents bigint not null check (target_cents > 0),
  saved_cents bigint not null default 0 check (saved_cents >= 0),
  deadline date,
  created_by text not null check (created_by in ('A', 'B')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);
create index if not exists idx_savings_goals_pull on savings_goals (couple_id, updated_at);

do $$
declare t text;
begin
  foreach t in array array['focus_sessions','savings_goals'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (couple_id = my_couple_id())', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('create policy %I on %I for insert with check (couple_id = my_couple_id())', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('create policy %I on %I for update using (couple_id = my_couple_id()) with check (couple_id = my_couple_id())', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format('create policy %I on %I for delete using (couple_id = my_couple_id())', t || '_delete', t);
    execute format('drop trigger if exists trg_%I_synced on %I', t, t);
    execute format('create trigger trg_%I_synced before insert or update on %I for each row execute function touch_synced_at()', t, t);
  end loop;
end $$;
