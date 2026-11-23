-- Ampara · validação do schema num Postgres/Supabase real
-- Roda tudo numa transação e desfaz no final (o banco fica como estava).
--   docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/tests/validate.sql
-- Qualquer regra quebrada interrompe com ERROR e a mensagem "FALHOU: ...".

\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
begin;

-- ---------------------------------------------------------------- 1. estrutura
do $$
declare missing text;
begin
  select string_agg(t, ', ') into missing
    from unnest(array['couples','couple_members','couple_invites','profiles','tasks','events','medications',
                      'medication_logs','transactions','help_requests','nudges','cycle_settings','cycle_logs','shopping_items','special_dates','gift_ideas','mood_checkins','comfort_items','focus_sessions','savings_goals','push_subscriptions','push_config','push_sent','recurrences',
                      'idea_areas','idea_topics','ideas','idea_captures','idea_notes','idea_links','idea_actions','idea_ai_log']) t
   where to_regclass('public.' || t) is null;
  assert missing is null, 'FALHOU: tabelas ausentes: ' || coalesce(missing, '');

  select string_agg(c.relname, ', ') into missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  assert missing is null, 'FALHOU: tabelas sem RLS: ' || coalesce(missing, '');

  select string_agg(f, ', ') into missing
    from unnest(array['create_couple','create_invite','join_couple','my_membership','my_couple_id','my_partner_id','push_public_key','save_push_subscription','delete_push_subscription','convert_to_solo','restore_couple']) f
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f);
  assert missing is null, 'FALHOU: funções ausentes: ' || coalesce(missing, '');

  select string_agg(v.tbl || '.' || v.col, ', ') into missing
    from (values ('couples','mode'), ('couples','solo_owner_id'), ('couple_members','revoked_at'), ('profiles','monthly_budget_cents'), ('profiles','enabled_modules'),
                 ('tasks','steps'), ('tasks','postpone_count')) v(tbl, col)
   where not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = v.tbl and c.column_name = v.col);
  assert missing is null, 'FALHOU: colunas do modo dual ausentes: ' || coalesce(missing, '');

  -- regra 11: política "for all" também libera SELECT; tabelas com privacidade só têm política por comando
  select string_agg(tablename || '.' || policyname, ', ') into missing
    from pg_policies
   where schemaname = 'public' and cmd = 'ALL'
     and tablename in ('couples','profiles','help_requests','nudges','tasks','events','medications','medication_logs','transactions','cycle_settings','cycle_logs','shopping_items','special_dates','gift_ideas','recurrences','focus_sessions',
                       'idea_areas','idea_topics','ideas','idea_captures','idea_notes','idea_links','idea_actions','idea_ai_log');
  assert missing is null, 'FALHOU: política "for all" em tabela com privacidade: ' || coalesce(missing, '');
end $$;
\echo 'ok  estrutura: 32 tabelas, RLS ligado em todas, 11 funções'

-- ---------------------------------------------------------------- 2. três contas (Lucas, ela e alguém de fora)
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'lucas@teste.local', '', now(), now(), now()),
       ('bbbbbbbb-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'ela@teste.local',   '', now(), now(), now()),
       ('cccccccc-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'fora@teste.local',  '', now(), now(), now());

-- ---------------------------------------------------------------- 3. Lucas cria o espaço, o convite e os dados
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset

select create_couple('space-teste', '50_50', 5000) as _ \gset
select create_invite('abcde-fghjk') as _ \gset

insert into profiles (id, couple_id, display_name, pronoun, energy, share_personal_finances) values
  ('A', 'space-teste', 'Lucas', 'ele', 'FULL', false),
  ('B', 'space-teste', 'Ela', 'ela', 'MEDIUM', false);

insert into tasks (id, couple_id, created_by, assigned_to, title, effort, status, due_date, visible_to_partner) values
  ('11111111-0000-4000-8000-000000000001', 'space-teste', 'A', null, 'Comprar pão', 'QUICK_5M', 'PENDING', current_date, true),
  ('11111111-0000-4000-8000-000000000002', 'space-teste', 'A', 'A', 'Surpresa de aniversário', 'FOCUS', 'PENDING', current_date, false);

insert into events (id, couple_id, title, date, start, "end", kind) values
  ('22222222-0000-4000-8000-000000000001', 'space-teste', 'Jantar', current_date, '20:00', '22:00', 'COUPLE');
insert into events (id, couple_id, title, date, start, "end", kind, owner_id) values
  ('22222222-0000-4000-8000-000000000002', 'space-teste', 'Terapia do Lucas', current_date, '18:00', '19:00', 'HEALTH', 'A');

insert into medications (id, couple_id, kind, owner_id, name, dosage, times, stock_count, notify_partner_on_delay) values
  ('33333333-0000-4000-8000-000000000001', 'space-teste', 'MED', 'A', 'Remédio do Lucas', '30 mg', '["08:00"]', 20, false),
  ('33333333-0000-4000-8000-000000000002', 'space-teste', 'MED', 'A', 'Remédio com apoio', '10 mg', '["21:00"]', 3, true);

insert into medication_logs (id, couple_id, medication_id, scheduled_date, scheduled_time, status) values
  ('33333333-0000-4000-8000-000000000002@hoje@21:00', 'space-teste', '33333333-0000-4000-8000-000000000002', current_date, '21:00', 'PENDING'),
  ('33333333-0000-4000-8000-000000000001@hoje@08:00', 'space-teste', '33333333-0000-4000-8000-000000000001', current_date, '08:00', 'TAKEN');

insert into transactions (id, couple_id, created_by, paid_by, scope, is_secret_gift, type, status, amount_cents, category, description,
                          partner_a_share_cents, partner_b_share_cents, competence_date) values
  ('44444444-0000-4000-8000-000000000001', 'space-teste', 'A', 'A', 'COUPLE',   false, 'EXPENSE', 'CONFIRMED_SOLID', 32000, 'mercado', 'Supermercado', 16000, 16000, current_date),
  ('44444444-0000-4000-8000-000000000002', 'space-teste', 'A', 'A', 'PERSONAL', false, 'EXPENSE', 'CONFIRMED_SOLID',  1800, 'lazer',   'Café do Lucas',    0,     0, current_date),
  ('44444444-0000-4000-8000-000000000003', 'space-teste', 'A', 'A', 'PERSONAL', true,  'EXPENSE', 'CONFIRMED_SOLID', 25000, 'presente','Colar surpresa',  0,     0, current_date);

do $$ begin
  assert (select count(*) from transactions) = 3, 'FALHOU: o autor deveria ver os 3 lançamentos dele';
  assert (select my_partner_id()) = 'A', 'FALHOU: quem cria o espaço deveria ser o Parceiro A';
  assert (select mode from couples) = 'COUPLE', 'FALHOU: assinatura antiga não criou espaço de casal';
  assert not exists (select 1 from tasks where steps <> '[]'::jsonb or postpone_count <> 0), 'FALHOU: tarefas antigas perderam os padrões';
end $$;
\echo 'ok  Lucas criou espaço, convite, perfis, tarefas, evento, remédios, dose e 3 lançamentos'

-- dinheiro do casal precisa fechar a divisão (check do schema)
do $$ begin
  begin
    insert into transactions (id, couple_id, created_by, paid_by, scope, type, status, amount_cents, category, description,
                              partner_a_share_cents, partner_b_share_cents, competence_date)
    values (gen_random_uuid(), 'space-teste', 'A', 'A', 'COUPLE', 'EXPENSE', 'CONFIRMED_SOLID', 1000, 'x', 'divisão errada', 100, 100, current_date);
    raise exception 'FALHOU: gasto do casal com divisão que não fecha foi aceito';
  exception when check_violation then null;
  end;
end $$;
\echo 'ok  gasto do casal com divisão que não soma o total é recusado'

-- ---------------------------------------------------------------- 4. convite guardado só como hash
reset role;
do $$ begin
  assert (select count(*) from couple_invites where couple_id = 'space-teste' and partner_id = 'B') = 1, 'FALHOU: convite não registrado';
  assert not exists (select 1 from couple_invites where code_hash ilike '%ABCDE%'), 'FALHOU: convite em texto claro';
  assert (select invite_code from couples where id = 'space-teste') is null, 'FALHOU: couples.invite_code deveria ficar vazio';
end $$;
\echo 'ok  convite gravado só como SHA-256'

-- ---------------------------------------------------------------- 5. ela entra pelo convite
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset

select couple_id as joined_couple, partner_id as joined_partner from join_couple(' Abcde fghjk ') \gset
do $$ begin
  assert current_setting('request.jwt.claims')::jsonb->>'sub' = 'bbbbbbbb-0000-4000-8000-00000000000b';
  assert (select my_couple_id()) = 'space-teste' and (select my_partner_id()) = 'B', 'FALHOU: join_couple não ligou ela como B';
end $$;
\echo 'ok  ela entrou no espaço como Parceiro B (código com espaços e minúsculas normalizado)'

-- privacidade financeira: só o gasto do casal
do $$ begin
  assert (select count(*) from transactions) = 1, 'FALHOU: ela deveria ver só o gasto do casal, viu ' || (select count(*) from transactions);
  assert (select description from transactions) = 'Supermercado', 'FALHOU: lançamento visível errado';
end $$;
\echo 'ok  aba pessoal fechada: ela vê 1 de 3 lançamentos (só o do casal)'

-- perfil e espaço: ela não abre a aba pessoal do Lucas nem apaga o casal
do $$ declare n int; begin
  update profiles set share_personal_finances = true, display_name = 'mexido' where id = 'A';
  get diagnostics n = row_count;
  assert n = 0, 'FALHOU: ela alterou o perfil do Lucas';
  assert (select count(*) from transactions) = 1, 'FALHOU: ela abriu a aba pessoal do Lucas pelo perfil';
  insert into profiles (id, couple_id, display_name, pronoun, energy, share_personal_finances)
    values ('A', 'space-teste', 'x', 'ele', 'FULL', true) on conflict (couple_id, id) do nothing;
  assert (select share_personal_finances from profiles where id = 'A') = false, 'FALHOU: insert mudou o perfil do Lucas';
  update profiles set energy = 'OVERLOAD' where id = 'B';
  get diagnostics n = row_count;
  assert n = 1, 'FALHOU: ela não conseguiu mudar o próprio perfil';
  update profiles set energy = 'MEDIUM' where id = 'B';
  delete from couples where id = 'space-teste';
  delete from profiles where id = 'A';
  assert (select count(*) from couples) = 1 and (select count(*) from profiles) = 2, 'FALHOU: ela apagou o espaço ou um perfil';
  update couples set ratio_a_bps = 5000 where id = 'space-teste';
  get diagnostics n = row_count;
  assert n = 1, 'FALHOU: ela não conseguiu ajustar a divisão do casal';
end $$;
\echo 'ok  perfil do Lucas não muda pelo aparelho dela (aba pessoal fica fechada); o espaço não é apagado pela API'

-- tarefa privada do Lucas some; tarefa do casal aparece
do $$ declare n int; begin
  assert (select count(*) from tasks) = 1 and (select title from tasks) = 'Comprar pão', 'FALHOU: tarefa privada vazou';
  update tasks set title = 'mexido' where id = '11111111-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'FALHOU: ela alterou a tarefa privada do Lucas';
  update tasks set status = 'DONE', completed_by = 'B' where id = '11111111-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  assert n = 1, 'FALHOU: ela não conseguiu concluir a tarefa do casal';
end $$;
\echo 'ok  tarefa privada do Lucas não aparece nem muda para ela; a do casal ela conclui'

-- remédios: só o que tem rede de apoio ligada
do $$ declare n int; begin
  assert (select count(*) from medications) = 1 and (select name from medications) = 'Remédio com apoio', 'FALHOU: remédio sem rede de apoio vazou';
  update medications set stock_count = 0 where id = '33333333-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'FALHOU: ela alterou remédio do Lucas';
end $$;
\echo 'ok  remédios: vê só o que tem rede de apoio e não altera o do Lucas'

-- doses seguem o remédio: a dose do remédio sem rede de apoio não aparece
do $$ begin
  assert (select count(*) from medication_logs) = 1, 'FALHOU: dose de remédio privado vazou, viu ' || (select count(*) from medication_logs);
  assert (select medication_id from medication_logs) = '33333333-0000-4000-8000-000000000002', 'FALHOU: dose visível errada';
end $$;
\echo 'ok  doses: só as do remédio com rede de apoio'

-- ela não cria remédio nem compromisso em nome do Lucas
do $$ begin
  begin
    insert into medications (id, couple_id, kind, owner_id, name, dosage, times)
    values (gen_random_uuid(), 'space-teste', 'MED', 'A', 'forjado', '1', '["09:00"]');
    raise exception 'FALHOU: ela criou remédio em nome do Lucas';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into events (id, couple_id, title, date, start, "end", kind, owner_id)
    values (gen_random_uuid(), 'space-teste', 'forjado', current_date, '10:00', '11:00', 'PERSONAL', 'A');
    raise exception 'FALHOU: ela criou compromisso em nome do Lucas';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo 'ok  RLS recusa remédio e compromisso forjados em nome do par'

-- pedido de ajuda e lembrete carinhoso: ela não cria em nome do Lucas; o dela os dois atualizam; ninguém apaga
do $$ declare n int; begin
  begin
    insert into help_requests (id, couple_id, requester_id, situation, help_type, urgency, status)
    values (gen_random_uuid(), 'space-teste', 'A', 'forjado', 'TAKE_OVER', 'NOW', 'OPEN');
    raise exception 'FALHOU: ela criou pedido de ajuda em nome do Lucas';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into nudges (id, couple_id, "from", "to", medication_log_id, message)
    values (gen_random_uuid(), 'space-teste', 'A', 'B', 'x', 'forjado');
    raise exception 'FALHOU: ela mandou lembrete em nome do Lucas';
  exception when insufficient_privilege then null;
  end;
  insert into help_requests (id, couple_id, requester_id, situation, help_type, urgency, status)
  values ('55555555-0000-4000-8000-000000000001', 'space-teste', 'B', 'Lavar a louça', 'TAKE_OVER', 'TODAY', 'OPEN');
  insert into help_requests (id, couple_id, requester_id, situation, help_type, urgency, status)
  values ('55555555-0000-4000-8000-000000000001', 'space-teste', 'B', 'Lavar a louça', 'TAKE_OVER', 'TODAY', 'RESOLVED')
  on conflict (id) do update set status = excluded.status;
  assert (select status from help_requests where id = '55555555-0000-4000-8000-000000000001') = 'RESOLVED', 'FALHOU: upsert do próprio pedido';
  delete from help_requests where id = '55555555-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'FALHOU: pedido de ajuda apagado pela API';
  update help_requests set status = 'OPEN' where id = '55555555-0000-4000-8000-000000000001';
end $$;
\echo 'ok  pedido de ajuda e lembrete: ninguém cria em nome do par nem apaga pela API'

-- compromisso "Meu · só você vê" do Lucas: não aparece, não muda, não some
do $$ declare n int; begin
  assert (select count(*) from events) = 1 and (select title from events) = 'Jantar', 'FALHOU: compromisso privado vazou';
  update events set title = 'mexido' where id = '22222222-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'FALHOU: ela alterou o compromisso privado do Lucas';
  delete from events where id = '22222222-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'FALHOU: ela apagou o compromisso privado do Lucas';
  -- e o do casal ela edita normalmente
  update events set start = '20:30' where id = '22222222-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  assert n = 1, 'FALHOU: ela não conseguiu editar o compromisso do casal';
end $$;
\echo 'ok  compromisso privado do Lucas não aparece nem muda para ela; o do casal ela edita'

-- ela não grava lançamento pessoal em nome do Lucas
do $$ begin
  begin
    insert into transactions (id, couple_id, created_by, paid_by, scope, type, status, amount_cents, category, description, competence_date)
    values (gen_random_uuid(), 'space-teste', 'A', 'A', 'PERSONAL', 'EXPENSE', 'CONFIRMED_SOLID', 999, 'x', 'forjado', current_date);
    raise exception 'FALHOU: ela gravou lançamento pessoal do Lucas';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo 'ok  RLS recusa lançamento pessoal forjado em nome do par'

-- ela confirma a dose do Lucas (apoio) e grava um gasto do casal
update medication_logs set status = 'TAKEN', taken_at = now(), confirmed_by = 'B' where couple_id = 'space-teste';
insert into transactions (id, couple_id, created_by, paid_by, scope, type, status, amount_cents, category, description,
                          partner_a_share_cents, partner_b_share_cents, competence_date)
values ('44444444-0000-4000-8000-000000000004', 'space-teste', 'B', 'B', 'COUPLE', 'EXPENSE', 'CONFIRMED_SOLID', 8000, 'casa', 'Pizza de sexta', 4000, 4000, current_date);
\echo 'ok  ela confirmou a dose e lançou um gasto do casal'

-- o convite não serve duas vezes
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000c","role":"authenticated"}', true) as _ \gset
do $$ begin
  begin
    perform join_couple('ABCDE-FGHJK');
    raise exception 'FALHOU: convite usado duas vezes';
  exception when raise_exception then
    if sqlerrm not like '%invalid invite%' then raise; end if;
  end;
  -- quem é de fora não vê nada
  assert (select count(*) from couples) + (select count(*) from transactions) + (select count(*) from tasks)
       + (select count(*) from profiles) + (select count(*) from medications) + (select count(*) from couple_members) = 0,
         'FALHOU: conta de fora enxergou dados do casal';
  begin
    perform create_invite('ZZZZZ-ZZZZZ');
    raise exception 'FALHOU: conta sem espaço gerou convite';
  exception when raise_exception then
    if sqlerrm not like '%not paired%' then raise; end if;
  end;
end $$;
\echo 'ok  convite é de uso único; conta de fora não vê nada nem gera convite'

-- ---------------------------------------------------------------- 6. Lucas abre a aba pessoal
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
select synced_at as before_sync from profiles where id = 'A' \gset
update profiles set share_personal_finances = true, updated_at = now() where id = 'A';
do $$ begin
  assert (select count(*) from transactions) = 4, 'FALHOU: Lucas deveria ver os 4 lançamentos';
  assert (select status from medication_logs where medication_id = '33333333-0000-4000-8000-000000000002') = 'TAKEN', 'FALHOU: dose confirmada pela parceira não chegou';
  assert (select count(*) from events) = 2, 'FALHOU: Lucas deveria ver o próprio compromisso privado';
end $$;
select (synced_at > :'before_sync'::timestamptz) as cursor_moved from profiles where id = 'A' \gset
\if :cursor_moved
\echo 'ok  synced_at avança a cada gravação (cursor do pull)'
\else
select 1/0 as "FALHOU: synced_at não avançou";
\endif

-- ele aceita o pedido de ajuda dela pelo mesmo upsert do app ("Deixa comigo")
do $$ begin
  insert into help_requests (id, couple_id, requester_id, situation, help_type, urgency, status, response)
  values ('55555555-0000-4000-8000-000000000001', 'space-teste', 'B', 'Lavar a louça', 'TAKE_OVER', 'TODAY', 'ACCEPTED', 'TAKE_OVER')
  on conflict (id) do update set status = excluded.status, response = excluded.response;
  assert (select status from help_requests where id = '55555555-0000-4000-8000-000000000001') = 'ACCEPTED', 'FALHOU: ele não conseguiu aceitar o pedido dela';
end $$;
\echo 'ok  ele aceita o pedido de ajuda dela'

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
do $$ begin
  assert (select count(*) from transactions) = 3, 'FALHOU: com a aba aberta ela deveria ver 3 (casal x2 + pessoal), viu ' || (select count(*) from transactions);
  assert not exists (select 1 from transactions where is_secret_gift), 'FALHOU: presente secreto vazou';
end $$;
\echo 'ok  aba pessoal aberta: ela vê o café do Lucas, mas nunca o presente secreto'

-- Lucas desliga a rede de apoio: o remédio e as doses somem para ela; e ele não passa o remédio para o nome dela
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
update medications set notify_partner_on_delay = false where id = '33333333-0000-4000-8000-000000000002';
do $$ begin
  begin
    update medications set owner_id = 'B' where id = '33333333-0000-4000-8000-000000000001';
    raise exception 'FALHOU: Lucas passou o remédio para o nome dela';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
do $$ begin
  assert (select count(*) from medications) = 0, 'FALHOU: remédio continuou visível depois de desligar a rede de apoio';
  assert (select count(*) from medication_logs) = 0, 'FALHOU: doses continuaram visíveis depois de desligar a rede de apoio';
end $$;
\echo 'ok  rede de apoio desligada: remédio e doses somem para ela; dono não troca de pessoa'

-- ---------------------------------------------------------------- 6b. ciclo menstrual (dado de saúde)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
insert into cycle_settings (id, couple_id, share) values ('B', 'space-teste', 'NONE');
insert into cycle_logs (id, couple_id, owner_id, start_date, end_date) values
  ('55555555-0000-4000-8000-000000000001', 'space-teste', 'B', current_date - 22, current_date - 18);
do $$ begin
  begin
    update cycle_settings set sensitive_from = current_date, sensitive_to = current_date + 6 where id = 'B';
    raise exception 'FALHOU: "Só eu vejo" publicou a janela';
  exception when check_violation then null;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
do $$ begin
  assert (select count(*) from cycle_settings where share <> 'NONE' or sensitive_from is not null) = 0, 'FALHOU: Lucas leu algo do ciclo com "Só eu vejo"';
  assert (select count(*) from cycle_logs) = 0, 'FALHOU: Lucas leu registros do ciclo dela';
  begin
    insert into cycle_logs (id, couple_id, owner_id, start_date) values ('55555555-0000-4000-8000-000000000009', 'space-teste', 'B', current_date);
    raise exception 'FALHOU: Lucas gravou registro de ciclo em nome dela';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
update cycle_settings set share = 'GENTLE', sensitive_from = current_date, sensitive_to = current_date + 6 where id = 'B';

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
do $$ begin
  assert (select count(*) from cycle_settings where sensitive_from is not null) = 1, 'FALHOU: com aviso Lucas não vê a semana de cuidado';
  assert (select count(*) from cycle_logs) = 0, 'FALHOU: com aviso Lucas viu as datas da menstruação';
end $$;
-- tentativa de mudar os ajustes dela: o RLS filtra (0 linhas), sem erro
update cycle_settings set share = 'NONE', sensitive_from = null, sensitive_to = null where id = 'B';

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
do $$ begin
  assert (select share from cycle_settings where id = 'B') = 'GENTLE', 'FALHOU: Lucas alterou os ajustes do ciclo dela';
end $$;
update cycle_settings set share = 'FULL' where id = 'B';

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
do $$ begin
  assert (select count(*) from cycle_logs) = 1, 'FALHOU: com "Tudo" Lucas não vê o registro';
end $$;
\echo 'ok  ciclo: "Só eu vejo" esconde tudo, aviso mostra só a janela, "Tudo" mostra os registros; só a dona grava'

-- ---------------------------------------------------------------- 6c. lista de compras do casal
-- (Lucas continua logado) adiciona; ela marca no carrinho; alguém de fora não vê nem altera
insert into shopping_items (id, couple_id, title, category, added_by) values
  ('66666666-0000-4000-8000-000000000001', 'space-teste', 'Leite', 'MARKET', 'A');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
update shopping_items set checked = true, checked_by = 'B' where id = '66666666-0000-4000-8000-000000000001';
do $$ begin
  assert (select checked from shopping_items where id = '66666666-0000-4000-8000-000000000001'), 'FALHOU: ela não marcou o item do casal';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000c","role":"authenticated"}', true) as _ \gset
update shopping_items set title = 'invadido';
do $$ begin
  assert (select count(*) from shopping_items) = 0, 'FALHOU: conta de fora viu a lista de compras';
  begin
    insert into shopping_items (id, couple_id, title, category, added_by) values ('66666666-0000-4000-8000-000000000002', 'space-teste', 'x', 'OTHER', 'A');
    raise exception 'FALHOU: conta de fora gravou na lista do casal';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  assert (select title from shopping_items where id = '66666666-0000-4000-8000-000000000001') = 'Leite', 'FALHOU: conta de fora alterou a lista';
end $$;
\echo 'ok  lista de compras: os dois editam; conta de fora não vê nem grava'

-- ---------------------------------------------------------------- 6d. datas especiais e presentes (surpresa)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
insert into special_dates (id, couple_id, title, date, kind, created_by) values
  ('77777777-0000-4000-8000-000000000001', 'space-teste', 'Aniversário de namoro', '2023-11-10', 'ANNIVERSARY', 'A');
insert into gift_ideas (id, couple_id, owner_id, title, status) values
  ('77777777-0000-4000-8000-000000000002', 'space-teste', 'A', 'Colar de lua', 'IDEA');
do $$ begin
  begin
    insert into gift_ideas (id, couple_id, owner_id, title, status) values ('77777777-0000-4000-8000-000000000003', 'space-teste', 'B', 'forjado', 'IDEA');
    raise exception 'FALHOU: Lucas gravou ideia de presente em nome dela';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
update gift_ideas set status = 'GIVEN';
delete from gift_ideas;
do $$ begin
  assert (select count(*) from special_dates) = 1, 'FALHOU: ela não vê a data do casal';
  assert (select count(*) from gift_ideas) = 0, 'FALHOU: ela viu a ideia de presente do Lucas';
end $$;

reset role;
do $$ begin
  assert (select status from gift_ideas where id = '77777777-0000-4000-8000-000000000002') = 'IDEA', 'FALHOU: ela alterou ou apagou o presente dele';
end $$;
\echo 'ok  datas do casal: os dois veem; presente: só quem anotou vê, altera ou apaga'

-- ---------------------------------------------------------------- 6e. check-in e "o que me acalma"
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
insert into mood_checkins (id, couple_id, owner_id, date, mood) values ('B@hoje', 'space-teste', 'B', current_date, 'NEED_CARE');
insert into comfort_items (id, couple_id, owner_id, text) values ('88888888-0000-4000-8000-000000000001', 'space-teste', 'B', 'Chá de camomila');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
update mood_checkins set mood = 'GOOD';
update comfort_items set text = 'trocado';
do $$ begin
  assert (select mood from mood_checkins where id = 'B@hoje') = 'NEED_CARE', 'FALHOU: Lucas alterou o check-in dela';
  assert (select text from comfort_items where owner_id = 'B') = 'Chá de camomila', 'FALHOU: Lucas alterou a lista dela';
  begin
    insert into mood_checkins (id, couple_id, owner_id, date, mood) values ('B@forjado', 'space-teste', 'B', current_date, 'GOOD');
    raise exception 'FALHOU: Lucas gravou check-in em nome dela';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo 'ok  check-in e "o que me acalma": o par lê, só a própria pessoa grava'

-- check-in com o mesmo id em outro casal: a chave é (couple_id, id), "A@hoje" de um não colide com o do outro
insert into mood_checkins (id, couple_id, owner_id, date, mood) values ('A@hoje', 'space-teste', 'A', current_date, 'GOOD');
reset role;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('dddddddd-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 'outro-casal@teste.local', '', now(), now(), now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-00000000000d","role":"authenticated"}', true) as _ \gset
select create_couple('space-outro', '50_50', 5000) as _ \gset
insert into mood_checkins (id, couple_id, owner_id, date, mood) values ('A@hoje', 'space-outro', 'A', current_date, 'OVERWHELMED')
on conflict (couple_id, id) do update set mood = excluded.mood;
do $$ begin
  assert (select count(*) from mood_checkins) = 1 and (select mood from mood_checkins) = 'OVERWHELMED', 'FALHOU: outro casal não gravou o próprio A@hoje';
end $$;
reset role;
do $$ begin
  assert (select mood from mood_checkins where couple_id = 'space-teste' and id = 'A@hoje') = 'GOOD', 'FALHOU: A@hoje de outro casal sobrescreveu o do Lucas';
  assert (select count(*) from mood_checkins where id = 'A@hoje') = 2, 'FALHOU: os dois A@hoje deveriam existir';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
\echo 'ok  check-in: outro casal grava o mesmo A@hoje sem colidir (chave couple_id + id)'

-- ---------------------------------------------------------------- 6f. fazer junto e caixinhas
-- (Lucas continua logado) cria a caixinha e começa uma sessão; ela entra e guarda dinheiro
insert into savings_goals (id, couple_id, title, target_cents, created_by) values ('99999999-0000-4000-8000-000000000001', 'space-teste', 'Viagem', 600000, 'A');
insert into focus_sessions (id, couple_id, started_by, title, duration_min, started_at, ends_at, status) values
  ('99999999-0000-4000-8000-000000000002', 'space-teste', 'A', 'Louça', 25, now(), now() + interval '25 minutes', 'RUNNING');
insert into tasks (id, couple_id, created_by, assigned_to, title, effort, status, visible_to_partner)
  values ('99999999-0000-4000-8000-000000000003', 'space-teste', 'A', 'A', 'Tarefa privada no foco', 'FOCUS', 'PENDING', false);
insert into focus_sessions (id, couple_id, started_by, title, task_id, duration_min, started_at, ends_at, joined_by, status) values
  ('99999999-0000-4000-8000-000000000004', 'space-teste', 'A', 'Micro-passo privado individual', '99999999-0000-4000-8000-000000000003', 5, now(), now() + interval '5 minutes', 'A', 'RUNNING'),
  ('99999999-0000-4000-8000-000000000005', 'space-teste', 'A', 'Foco conjunto antigo ligado a tarefa privada', '99999999-0000-4000-8000-000000000003', 25, now(), now() + interval '25 minutes', null, 'RUNNING');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
update savings_goals set saved_cents = 15000 where id = '99999999-0000-4000-8000-000000000001';
update focus_sessions set joined_by = 'B' where id = '99999999-0000-4000-8000-000000000002';
do $$ begin
  assert (select saved_cents from savings_goals) = 15000, 'FALHOU: ela não guardou na caixinha do casal';
  assert (select joined_by from focus_sessions) = 'B', 'FALHOU: ela não entrou na sessão';
  assert (select count(*) from focus_sessions) = 1, 'FALHOU: foco individual ou tarefa privada vazou para o par';
  update focus_sessions set title = 'Indevido', status = 'DONE' where id = '99999999-0000-4000-8000-000000000004';
  delete from focus_sessions where id in ('99999999-0000-4000-8000-000000000004', '99999999-0000-4000-8000-000000000005');
  begin
    update focus_sessions set started_by = 'B' where id = '99999999-0000-4000-8000-000000000002';
    raise exception 'FALHOU: par alterou autoria do foco conjunto';
  exception when insufficient_privilege then null;
  end;
  begin
    update focus_sessions set joined_by = 'A' where id = '99999999-0000-4000-8000-000000000002';
    raise exception 'FALHOU: par converteu foco conjunto em individual do outro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into focus_sessions (id, couple_id, started_by, title, duration_min, started_at, ends_at, status)
      values ('99999999-0000-4000-8000-000000000006', 'space-teste', 'A', 'Convite forjado pelo par', 5, now(), now() + interval '5 minutes', 'RUNNING');
    raise exception 'FALHOU: par criou foco em nome da outra pessoa';
  exception when insufficient_privilege then null;
  end;
  begin
    update savings_goals set saved_cents = -1;
    raise exception 'FALHOU: caixinha ficou negativa';
  exception when check_violation then null;
  end;
end $$;
-- O adaptador usa upsert também para entrar em um foco que o autor já subiu.
insert into focus_sessions (id, couple_id, started_by, title, duration_min, started_at, ends_at, joined_by, status)
  values ('99999999-0000-4000-8000-000000000002', 'space-teste', 'A', 'Louça juntos', 25, now(), now() + interval '25 minutes', 'B', 'RUNNING')
  on conflict (id) do update set title = excluded.title, joined_by = excluded.joined_by;
reset role;
do $$ begin
  assert (select title from focus_sessions where id = '99999999-0000-4000-8000-000000000004') = 'Micro-passo privado individual', 'FALHOU: par alterou ou apagou foco individual';
  assert exists(select 1 from focus_sessions where id = '99999999-0000-4000-8000-000000000005'), 'FALHOU: par apagou foco ligado a tarefa privada';
  assert (select title from focus_sessions where id = '99999999-0000-4000-8000-000000000002') = 'Louça juntos', 'FALHOU: upsert do par não atualizou o foco conjunto';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000c","role":"authenticated"}', true) as _ \gset
do $$ begin
  assert (select count(*) from savings_goals) + (select count(*) from focus_sessions) = 0, 'FALHOU: conta de fora viu caixinha ou sessão';
end $$;
\echo 'ok  fazer junto e caixinhas: os dois editam, sem saldo negativo; conta de fora não vê'

-- ---------------------------------------------------------------- 6g. ideias (segundo cérebro): privadas de quem escreveu
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
insert into idea_areas (id, couple_id, owner_id, name, sort_order) values ('A:saude', 'space-teste', 'A', 'Saúde', 3);
insert into idea_topics (id, couple_id, owner_id, area_id, name, origin) values
  ('88880000-0000-4000-8000-000000000001', 'space-teste', 'A', 'A:saude', 'Corrida', 'IA');
insert into ideas (id, couple_id, owner_id, topic_id, title, nature) values
  ('88880000-0000-4000-8000-000000000002', 'space-teste', 'A', '88880000-0000-4000-8000-000000000001', 'Correr de manhã', 'PLANO'),
  ('88880000-0000-4000-8000-000000000003', 'space-teste', 'A', '88880000-0000-4000-8000-000000000001', 'Dormir cedo', 'DESEJO');
insert into idea_captures (id, couple_id, owner_id, text, source) values
  ('88880000-0000-4000-8000-000000000004', 'space-teste', 'A', 'quero correr de manhã e dormir cedo', 'VOZ');
insert into idea_notes (id, couple_id, owner_id, capture_id, idea_id, text, start_pos, end_pos) values
  ('88880000-0000-4000-8000-000000000005', 'space-teste', 'A', '88880000-0000-4000-8000-000000000004', '88880000-0000-4000-8000-000000000002', 'quero correr de manhã', 0, 21),
  ('88880000-0000-4000-8000-000000000009', 'space-teste', 'A', '88880000-0000-4000-8000-000000000004', null, 'e dormir cedo', 22, 35);
insert into idea_links (id, couple_id, owner_id, from_idea_id, to_idea_id, type, reason, origin) values
  ('88880000-0000-4000-8000-000000000006', 'space-teste', 'A', '88880000-0000-4000-8000-000000000002', '88880000-0000-4000-8000-000000000003', 'DEPENDE_DE', 'acordar cedo pede dormir cedo', 'IA');
insert into idea_actions (id, couple_id, owner_id, idea_id, target_type, target_id) values
  ('88880000-0000-4000-8000-000000000007', 'space-teste', 'A', '88880000-0000-4000-8000-000000000002', 'TASK', '88880000-0000-4000-8000-0000000000aa');
insert into idea_ai_log (id, couple_id, owner_id, capture_id, provider, model, prompt_version, result) values
  ('88880000-0000-4000-8000-000000000008', 'space-teste', 'A', '88880000-0000-4000-8000-000000000004', 'claude-assinatura', 'claude-opus-5-5', 'organizador@1', '{"aplicadas": 2}');

do $$ begin
  begin
    insert into ideas (id, couple_id, owner_id, topic_id, title, nature) values
      ('88880000-0000-4000-8000-0000000000b1', 'space-teste', 'B', '88880000-0000-4000-8000-000000000001', 'forjada', 'PLANO');
    raise exception 'FALHOU: Lucas gravou ideia em nome dela';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into idea_captures (id, couple_id, owner_id, text, source) values ('88880000-0000-4000-8000-0000000000b2', 'space-teste', 'B', 'forjada', 'TEXTO');
    raise exception 'FALHOU: Lucas gravou captura em nome dela';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into idea_areas (id, couple_id, owner_id, name) values ('B:saude', 'space-teste', 'A', 'Saúde');
    raise exception 'FALHOU: área com id de outra pessoa';
  exception when check_violation then null;
  end;
  begin
    insert into idea_topics (id, couple_id, owner_id, area_id, name, origin) values ('88880000-0000-4000-8000-0000000000b3', 'space-teste', 'A', 'B:saude', 'x', 'IA');
    raise exception 'FALHOU: assunto numa área de outra pessoa';
  exception when check_violation then null;
  end;
  begin
    insert into ideas (id, couple_id, owner_id, topic_id, title, nature) values ('88880000-0000-4000-8000-0000000000b4', 'space-teste', 'A', '88880000-0000-4000-8000-000000000001', 'x', 'SONHO');
    raise exception 'FALHOU: natureza fora do vocabulário';
  exception when check_violation then null;
  end;
  begin
    insert into idea_notes (id, couple_id, owner_id, capture_id, text) values ('88880000-0000-4000-8000-0000000000b5', 'space-teste', 'A', '88880000-0000-4000-8000-000000000004', repeat('x', 4001));
    raise exception 'FALHOU: anotação maior que 4000 caracteres';
  exception when check_violation then null;
  end;
  begin
    insert into idea_links (id, couple_id, owner_id, from_idea_id, to_idea_id, type, reason, origin) values
      ('88880000-0000-4000-8000-0000000000b6', 'space-teste', 'A', '88880000-0000-4000-8000-000000000002', '88880000-0000-4000-8000-000000000002', 'RELACIONA', 'x', 'IA');
    raise exception 'FALHOU: ligação de uma ideia com ela mesma';
  exception when check_violation then null;
  end;
  begin
    insert into idea_ai_log (id, couple_id, owner_id, capture_id, provider, prompt_version) values
      ('88880000-0000-4000-8000-0000000000b7', 'space-teste', 'A', '88880000-0000-4000-8000-000000000004', 'x', 'livre');
    raise exception 'FALHOU: registro da IA sem versão do contrato';
  exception when check_violation then null;
  end;
end $$;

-- "a versão mais nova vence": um aparelho atrasado não desfaz o que o outro gravou
update ideas set title = 'antigo', updated_at = '2000-01-01' where id = '88880000-0000-4000-8000-000000000002';
update ideas set state = 'AMADURECENDO', updated_at = now() + interval '1 second' where id = '88880000-0000-4000-8000-000000000003';

-- ela (mesmo espaço) não vê, não altera e não apaga nada das ideias do Lucas
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
update ideas set title = 'invadido';
update idea_areas set name = 'invadido';
delete from idea_notes;
delete from idea_links;
do $$ begin
  assert (select count(*) from idea_areas) + (select count(*) from idea_topics) + (select count(*) from ideas) + (select count(*) from idea_captures)
       + (select count(*) from idea_notes) + (select count(*) from idea_links) + (select count(*) from idea_actions) + (select count(*) from idea_ai_log) = 0,
    'FALHOU: ela viu ideias do Lucas';
end $$;

-- alguém de fora também não
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000c","role":"authenticated"}', true) as _ \gset
do $$ begin
  assert (select count(*) from ideas) + (select count(*) from idea_captures) + (select count(*) from idea_notes) = 0, 'FALHOU: conta de fora viu ideias';
end $$;

reset role;
do $$ begin
  assert (select title from ideas where id = '88880000-0000-4000-8000-000000000002') = 'Correr de manhã', 'FALHOU: versão antiga desfez a ideia (ou ela alterou)';
  assert (select state from ideas where id = '88880000-0000-4000-8000-000000000003') = 'AMADURECENDO', 'FALHOU: atualização nova não entrou';
  assert (select name from idea_areas where id = 'A:saude' and couple_id = 'space-teste') = 'Saúde', 'FALHOU: ela alterou a área do Lucas';
  assert (select count(*) from idea_notes where couple_id = 'space-teste') = 2, 'FALHOU: ela apagou anotações do Lucas';
  assert (select count(*) from idea_links where couple_id = 'space-teste') = 1, 'FALHOU: ela apagou a ligação do Lucas';
end $$;
\echo 'ok  ideias: só quem escreveu vê, altera ou apaga; vocabulários, limites e "mais nova vence" no banco'

-- ---------------------------------------------------------------- 6g. Web Push
reset role;
insert into push_config (id, public_key, private_key) values (1, 'chave-publica-teste', 'chave-privada-teste') on conflict (id) do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
select save_push_subscription('https://push.exemplo.test/ela-1', 'p256dh-dela', 'auth-dela', 'America/Sao_Paulo', false, '{"off":["home"]}'::jsonb) as _ \gset
do $$ begin
  assert (select count(*) from push_subscriptions) = 1, 'FALHOU: ela não vê a própria inscrição';
  assert (select prefs->'off'->>0 from push_subscriptions) = 'home', 'FALHOU: preferências de aviso não gravadas';
  begin
    perform save_push_subscription('https://push.exemplo.test/ela-1', 'p256dh-dela', 'auth-dela', '', false, '[1,2]'::jsonb);
    raise exception 'FALHOU: aceitou preferências que não são objeto';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  assert push_public_key() is not null, 'FALHOU: chave pública indisponível para quem está logado';
  begin
    perform private_key from push_config;
    assert (select count(*) from push_config) = 0, 'FALHOU: chave privada VAPID legível pelo app';
  exception when insufficient_privilege then null;
  end;
  begin
    perform save_push_subscription('http://inseguro.test/x', 'a', 'b', '', false, '{}'::jsonb);
    raise exception 'FALHOU: aceitou endpoint sem https';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
select delete_push_subscription('https://push.exemplo.test/ela-1') as _ \gset
do $$ begin
  assert (select count(*) from push_subscriptions) = 0, 'FALHOU: Lucas viu a inscrição dela';
  assert (select count(*) from push_sent) = 0, 'FALHOU: registro de envios legível pelo app';
end $$;
reset role;
do $$ begin
  assert (select count(*) from push_subscriptions where endpoint = 'https://push.exemplo.test/ela-1') = 1, 'FALHOU: Lucas apagou a inscrição dela';
end $$;
\echo 'ok  push: cada um vê e apaga só as próprias inscrições; chave privada e envios fora do alcance do app'

-- ---------------------------------------------------------------- 6h. contas fixas, parcelas e "a mais nova vence"
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
insert into recurrences (id, couple_id, created_by, scope, description, category, amount_cents, paid_by, day_of_month, start_month) values
  ('aaaa1111-0000-4000-8000-000000000001', 'space-teste', 'A', 'COUPLE', 'Aluguel', 'HOME', 240000, 'A', 5, '2026-11'),
  ('aaaa1111-0000-4000-8000-000000000002', 'space-teste', 'A', 'PERSONAL', 'Streaming do Lucas', 'LEISURE', 3990, 'A', 12, '2026-11');
insert into transactions (id, couple_id, created_by, paid_by, scope, is_secret_gift, type, status, amount_cents, category, description,
                          partner_a_share_cents, partner_b_share_cents, competence_date, installment_group, installment_n, installment_total, updated_at) values
  ('aaaa2222-0000-4000-8000-000000000001', 'space-teste', 'A', 'A', 'COUPLE', false, 'EXPENSE', 'PREDICTED_DASHED', 10000, 'HOME', 'Geladeira',
   5000, 5000, current_date, 'aaaa3333-0000-4000-8000-000000000001', 2, 10, '2026-11-06T12:00:00Z');
do $$ begin
  begin
    insert into transactions (id, couple_id, created_by, paid_by, scope, is_secret_gift, type, status, amount_cents, category, description,
                              partner_a_share_cents, partner_b_share_cents, competence_date, installment_group, installment_n, installment_total) values
      ('aaaa2222-0000-4000-8000-000000000002', 'space-teste', 'A', 'A', 'COUPLE', false, 'EXPENSE', 'PREDICTED_DASHED', 10000, 'HOME', 'x',
       5000, 5000, current_date, 'aaaa3333-0000-4000-8000-000000000001', 11, 10);
    raise exception 'FALHOU: aceitou parcela 11 de 10';
  exception when check_violation then null;
  end;
end $$;

-- baixa feita (mais nova); um aparelho atrasado tenta regravar como previsto (mais velho): o servidor ignora
update transactions set status = 'CONFIRMED_SOLID', paid_at = current_date, updated_at = '2026-11-07T09:00:00Z' where id = 'aaaa2222-0000-4000-8000-000000000001';
update transactions set status = 'PREDICTED_DASHED', paid_at = null, updated_at = '2000-01-01T00:00:00Z' where id = 'aaaa2222-0000-4000-8000-000000000001';
do $$ begin
  assert (select status from transactions where id = 'aaaa2222-0000-4000-8000-000000000001') = 'CONFIRMED_SOLID', 'FALHOU: versão velha desfez a baixa';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
update recurrences set amount_cents = 1 where id = 'aaaa1111-0000-4000-8000-000000000002';
do $$ begin
  assert (select count(*) from recurrences) = 1, 'FALHOU: ela viu a conta fixa pessoal do Lucas';
  assert (select description from recurrences) = 'Aluguel', 'FALHOU: ela não vê a conta fixa do casal';
  begin
    insert into recurrences (id, couple_id, created_by, scope, description, category, amount_cents, paid_by, day_of_month, start_month) values
      ('aaaa1111-0000-4000-8000-000000000003', 'space-teste', 'A', 'PERSONAL', 'forjada', 'OTHER', 100, 'A', 1, '2026-11');
    raise exception 'FALHOU: ela criou conta fixa pessoal em nome do Lucas';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  assert (select amount_cents from recurrences where id = 'aaaa1111-0000-4000-8000-000000000002') = 3990, 'FALHOU: ela alterou a conta fixa pessoal dele';
end $$;
\echo 'ok  contas fixas com a privacidade dos lançamentos; parcela validada; versão velha não desfaz a baixa'

-- ---------------------------------------------------------------- 6i. papel do worker: só o que os lembretes precisam
reset role;
insert into transactions (id, couple_id, created_by, paid_by, scope, type, status, amount_cents, category, description, partner_a_share_cents, partner_b_share_cents, competence_date)
values ('cccc1111-0000-4000-8000-000000000001', 'space-teste', 'B', 'B', 'PERSONAL', 'EXPENSE', 'PREDICTED_DASHED', 3500, 'HEALTH', 'Conta pessoal inscrita', 0, 3500, current_date),
       ('cccc1111-0000-4000-8000-000000000002', 'space-teste', 'A', 'A', 'PERSONAL', 'EXPENSE', 'PREDICTED_DASHED', 3500, 'HEALTH', 'Conta sem inscrição', 3500, 0, current_date);
insert into events (id, couple_id, title, date, start, "end", kind, owner_id)
values ('cccc2222-0000-4000-8000-000000000001', 'space-teste', 'Consulta da pessoa inscrita', current_date, '09:00', '10:00', 'HEALTH', 'B');
set local role ampara_worker;
do $$ begin
  assert (select count(*) from medications) >= 2, 'FALHOU: worker não lê os remédios de todos os casais';
  assert (select count(*) from profiles) >= 2, 'FALHOU: worker não lê os nomes';
  perform 1 from medication_logs; perform 1 from help_requests; perform 1 from push_subscriptions;
  perform 1 from nudges; perform 1 from focus_sessions;
  assert exists(select 1 from focus_sessions where id = '99999999-0000-4000-8000-000000000002'), 'FALHOU: worker deixou de ler foco compartilhado';
  assert not exists(select 1 from focus_sessions where id in ('99999999-0000-4000-8000-000000000004', '99999999-0000-4000-8000-000000000005')), 'FALHOU: worker leu foco individual ou título de tarefa privada';
  begin
    perform 1 from mood_checkins;
    raise exception 'FALHOU: worker leu o check-in';
  exception when insufficient_privilege then null;
  end;
  insert into push_sent (key) values ('teste-worker');
  delete from push_sent where key = 'teste-worker';
  assert (select mode from couples where id = 'space-teste') = 'COUPLE', 'FALHOU: worker não leu modo do espaço inscrito';
  assert exists (select 1 from transactions where id = 'cccc1111-0000-4000-8000-000000000001'), 'FALHOU: worker não leu vencimento pessoal da pessoa inscrita';
  assert not exists (select 1 from transactions where status <> 'PREDICTED_DASHED' or type <> 'EXPENSE'), 'FALHOU: worker viu histórico financeiro confirmado ou receita';
  assert not exists (select 1 from transactions where id = 'cccc1111-0000-4000-8000-000000000002'), 'FALHOU: worker leu conta pessoal sem inscrição';
  assert exists (select 1 from events where id = 'cccc2222-0000-4000-8000-000000000001'), 'FALHOU: worker não leu compromisso da pessoa inscrita';
  assert not exists (select 1 from events where id = '22222222-0000-4000-8000-000000000002'), 'FALHOU: worker leu compromisso privado sem inscrição';
  begin
    perform amount_cents from transactions;
    raise exception 'FALHOU: worker leu valores financeiros';
  exception when insufficient_privilege then null;
  end;
  begin
    perform monthly_budget_cents from profiles;
    raise exception 'FALHOU: worker leu teto mensal pessoal';
  exception when insufficient_privilege then null;
  end;
  begin
    perform invite_code from couples;
    raise exception 'FALHOU: worker leu convite do espaço';
  exception when insufficient_privilege then null;
  end;
  begin
    update events set title = 'invadido';
    raise exception 'FALHOU: worker alterou compromisso';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from cycle_logs;
    raise exception 'FALHOU: worker leu o ciclo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from gift_ideas;
    raise exception 'FALHOU: worker leu presentes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from ideas;
    raise exception 'FALHOU: worker leu ideias';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from idea_captures;
    raise exception 'FALHOU: worker leu capturas';
  exception when insufficient_privilege then null;
  end;
  begin
    update medications set name = 'invadido';
    raise exception 'FALHOU: worker alterou remédio';
  exception when insufficient_privilege then null;
  end;
  begin
    update push_subscriptions set p256dh = 'troca';
    raise exception 'FALHOU: worker trocou a chave de uma inscrição';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo 'ok  worker: lê somente lembretes necessários, vencimentos sem valores e compromissos inscritos; não lê histórico, ciclo, presentes nem check-in; não altera dados do espaço'

-- ---------------------------------------------------------------- 6j. Solo, campos novos e promoção preservando dados
reset role;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('eeeeeeee-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'solo@teste.local', '', now(), now(), now()),
       ('ffffffff-0000-4000-8000-00000000000f', 'authenticated', 'authenticated', 'par-solo@teste.local', '', now(), now(), now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000e","role":"authenticated"}', true) as _ \gset
select create_couple('space-solo', '50_50', 5000, 'SOLO') as _ \gset
insert into profiles (id, couple_id, display_name, pronoun, energy, monthly_budget_cents, enabled_modules)
values ('A', 'space-solo', 'Pessoa Solo', 'ele', 'FULL', 180000, '{"cycle":false,"shopping":true,"goals":true}');
insert into tasks (id, couple_id, created_by, assigned_to, title, effort, status, due_date, visible_to_partner, steps, postpone_count)
values ('eeee1111-0000-4000-8000-000000000001', 'space-solo', 'A', 'A', 'Separar documentos', 'FOCUS', 'PENDING', current_date, false,
        '[{"id":"passo-1","text":"Abrir a pasta","done":true}]', 3);
insert into transactions (id, couple_id, created_by, paid_by, scope, type, status, amount_cents, category, description,
                          partner_a_share_cents, partner_b_share_cents, competence_date)
values ('eeee2222-0000-4000-8000-000000000001', 'space-solo', 'A', 'A', 'PERSONAL', 'EXPENSE', 'PREDICTED_DASHED', 3500, 'HEALTH', 'Farmácia', 3500, 0, current_date);
do $$ begin
  assert (select mode from couples) = 'SOLO' and (select count(*) from couple_members) = 1, 'FALHOU: Solo não ficou com apenas a pessoa A';
  assert (select monthly_budget_cents from profiles) = 180000 and (select enabled_modules->>'cycle' from profiles) = 'false', 'FALHOU: preferências Solo não foram persistidas';
  assert (select postpone_count from tasks) = 3 and (select steps->0->>'done' from tasks) = 'true', 'FALHOU: micro-passos ou contagem não persistiram';
  begin
    perform create_invite('SOLOA-TESTE');
    raise exception 'FALHOU: Solo publicou convite antes da promoção';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    update couples set mode = 'INVALID';
    raise exception 'FALHOU: aceitou modo inválido';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000c","role":"authenticated"}', true) as _ \gset
do $$ begin
  assert (select count(*) from couples where id = 'space-solo') = 0, 'FALHOU: conta de fora viu espaço Solo';
  assert (select count(*) from profiles where couple_id = 'space-solo') + (select count(*) from tasks where couple_id = 'space-solo') +
         (select count(*) from transactions where couple_id = 'space-solo') = 0, 'FALHOU: conta de fora viu dados Solo';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-00000000000e","role":"authenticated"}', true) as _ \gset
select count(*) as _ from restore_couple() \gset
insert into profiles (id, couple_id, display_name, pronoun, energy) values ('B', 'space-solo', 'Par', 'ela', 'MEDIUM');
select create_invite('SOLOB-TESTE') as _ \gset
do $$ begin
  assert (select count(*) from tasks) = 1 and (select postpone_count from tasks) = 3, 'FALHOU: promoção perdeu a tarefa Solo';
  assert (select amount_cents from transactions) = 3500, 'FALHOU: promoção perdeu o lançamento pessoal';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-4000-8000-00000000000f","role":"authenticated"}', true) as _ \gset
select * from join_couple('SOLOB-TESTE') \gset
update profiles set monthly_budget_cents = 1, enabled_modules = '{}'::jsonb where id = 'A';
do $$ begin
  assert (select mode from couples) = 'COUPLE' and (select my_partner_id()) = 'B', 'FALHOU: par não entrou no espaço promovido';
  assert (select count(*) from transactions) = 0 and (select count(*) from tasks) = 0, 'FALHOU: promoção expôs dados pessoais fechados';
  assert (select monthly_budget_cents from profiles where id = 'A') = 180000 and
         (select enabled_modules->>'shopping' from profiles where id = 'A') = 'true', 'FALHOU: par alterou preferências de A';
end $$;
reset role;
\echo 'ok  Solo: dados novos persistem; RLS isola; convite exige promoção; Casal preserva tarefas, orçamento e privacidade'

-- ---------------------------------------------------------------- 6k. Casal inteiro vira Solo, com dono B ou A, sem reatribuir nem apagar histórico
reset role;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('99999999-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'outro-par@teste.local', '', now(), now(), now());
update profiles set share_personal_finances = false where couple_id = 'space-teste';
update profiles set monthly_budget_cents = 92345 where couple_id = 'space-teste' and id = 'B';
insert into tasks (id, couple_id, created_by, assigned_to, title, effort, status, visible_to_partner)
values ('abab1111-0000-4000-8000-000000000001', 'space-teste', 'B', 'B', 'Tarefa privada de B', 'QUICK_5M', 'PENDING', false);
insert into transactions (id, couple_id, created_by, paid_by, scope, type, status, amount_cents, category, description, competence_date)
values ('abab4444-0000-4000-8000-000000000001', 'space-teste', 'B', 'B', 'PERSONAL', 'EXPENSE', 'CONFIRMED_SOLID', 9876, 'HEALTH', 'Privado de B', current_date);
insert into push_subscriptions (endpoint, couple_id, partner_id, p256dh, auth) values
  ('https://push.test/solo-a', 'space-teste', 'A', 'teste', 'teste'),
  ('https://push.test/solo-b', 'space-teste', 'B', 'teste', 'teste');
insert into couple_invites (code_hash, couple_id, partner_id)
values (encode(digest('STALESOLO', 'sha256'), 'hex'), 'space-teste', 'A');

-- Compara todas as colunas de todas as entidades, inclusive linhas excluídas logicamente e dados privados.
create temporary table solo_entity_snapshot (table_name text primary key, payload jsonb not null) on commit drop;
do $$ declare v_table text; v_payload jsonb; begin
  foreach v_table in array array['profiles','tasks','events','medications','medication_logs','transactions','help_requests','nudges',
    'cycle_settings','cycle_logs','shopping_items','special_dates','gift_ideas','mood_checkins','comfort_items','focus_sessions','savings_goals','recurrences',
    'idea_areas','idea_topics','ideas','idea_captures','idea_notes','idea_links','idea_actions','idea_ai_log'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by t.id), ''[]''::jsonb) from %I t where t.couple_id = %L', v_table, 'space-teste') into v_payload;
    insert into solo_entity_snapshot values (v_table, v_payload);
  end loop;
end $$;
create function pg_temp.assert_solo_entity_snapshot() returns void language plpgsql as $$
declare v_row record; v_actual jsonb;
begin
  for v_row in select * from solo_entity_snapshot loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by t.id), ''[]''::jsonb) from %I t where t.couple_id = %L', v_row.table_name, 'space-teste') into v_actual;
    assert v_actual = v_row.payload, 'FALHOU: conversão alterou ou apagou entidades de ' || v_row.table_name;
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
select solo_owner_id as converted_owner, updated_at as converted_at from convert_to_solo() \gset
do $$ declare v_before timestamptz; v_after timestamptz; v_count int; begin
  assert (select mode = 'SOLO' and solo_owner_id = 'B' from couples), 'FALHOU: B não virou dona Solo sem remapeamento';
  assert (select my_partner_id()) = 'B', 'FALHOU: conversão mudou B para A';
  assert (select monthly_budget_cents from profiles where id = 'B') = 92345, 'FALHOU: conversão perdeu orçamento de B';
  select updated_at into v_before from couples;
  select updated_at into v_after from convert_to_solo();
  assert v_before = v_after, 'FALHOU: conversão repetida não foi idempotente';
  assert not exists (select 1 from tasks where id = '11111111-0000-4000-8000-000000000002'), 'FALHOU: Solo de B abriu tarefa privada de A';
  assert not exists (select 1 from transactions where id in ('44444444-0000-4000-8000-000000000002','44444444-0000-4000-8000-000000000003')), 'FALHOU: Solo de B abriu finanças privadas de A';
  assert exists (select 1 from transactions where id = '44444444-0000-4000-8000-000000000001'), 'FALHOU: Solo perdeu leitura do histórico compartilhado';
  assert partner_joined('space-teste', 'A'), 'FALHOU: revogação esqueceu vínculo histórico de A';
  update profiles set share_personal_finances = true where id = 'A';
  get diagnostics v_count = row_count;
  assert v_count = 0, 'FALHOU: revogação reabriu edição do perfil de A';
  begin
    insert into profiles (id,couple_id,display_name,pronoun,energy,share_personal_finances)
    values ('A','space-teste','forjado','ele','FULL',true)
    on conflict (couple_id,id) do update set share_personal_finances = true;
    raise exception 'FALHOU: upsert abriu finanças do membro revogado';
  exception when insufficient_privilege then null;
  end;
  begin
    update couples set mode = 'COUPLE', solo_owner_id = null;
    raise exception 'FALHOU: REST reverteu Solo para Casal';
  exception when insufficient_privilege then null;
  end;
  begin
    update couples set solo_owner_id = 'A';
    raise exception 'FALHOU: REST trocou dono Solo';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into couples (id,mode,solo_owner_id,split_mode,ratio_a_bps) values ('space-teste','COUPLE',null,'50_50',5000)
    on conflict (id) do update set mode = excluded.mode, solo_owner_id = excluded.solo_owner_id;
    raise exception 'FALHOU: upsert antigo reverteu Solo';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select pg_temp.assert_solo_entity_snapshot() as _ \gset
do $$ begin
  assert (select count(*) from couple_members where couple_id = 'space-teste') = 2, 'FALHOU: apagou vínculo histórico';
  assert (select count(*) from couple_members where couple_id = 'space-teste' and revoked_at is null) = 1, 'FALHOU: Solo manteve dois vínculos ativos';
  assert exists (select 1 from couple_members where couple_id = 'space-teste' and partner_id = 'A' and revoked_at is not null), 'FALHOU: A não foi revogado';
  assert not exists (select 1 from push_subscriptions where couple_id = 'space-teste' and partner_id = 'A'), 'FALHOU: push revogado permaneceu';
  assert exists (select 1 from push_subscriptions where endpoint = 'https://push.test/solo-b'), 'FALHOU: removeu push do dono';
  assert not exists (select 1 from couple_invites where couple_id = 'space-teste'), 'FALHOU: conversão manteve convite antigo';
end $$;

-- O token de A continua criptograficamente válido, mas já não autoriza nenhuma leitura ou gravação.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
do $$ begin
  assert my_couple_id() is null and my_partner_id() is null and not exists (select 1 from my_membership()), 'FALHOU: identidade revogada continuou ativa';
  assert (select count(*) from couples) + (select count(*) from profiles) + (select count(*) from tasks) + (select count(*) from transactions) = 0, 'FALHOU: JWT antigo leu dados após revogação';
  begin
    perform convert_to_solo();
    raise exception 'FALHOU: revogado tomou posse por conversão';
  exception when insufficient_privilege then null;
  end;
  begin
    perform restore_couple();
    raise exception 'FALHOU: revogado restaurou Casal';
  exception when insufficient_privilege then null;
  end;
  begin
    perform save_push_subscription('https://push.test/revogado','teste','teste','America/Sao_Paulo',false);
    raise exception 'FALHOU: revogado recriou inscrição';
  exception when raise_exception or insufficient_privilege then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
end $$;
-- Mesmo um convite residual não entra num Solo (defesa contra chamadas antigas em voo).
reset role;
insert into couple_invites (code_hash, couple_id, partner_id)
values (encode(digest('RESIDUALSOLO', 'sha256'), 'hex'), 'space-teste', 'A');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
do $$ begin
  begin
    perform join_couple('RESIDUALSOLO');
    raise exception 'FALHOU: convite residual entrou em Solo';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
end $$;

-- Restauração só abre o modo: o slot continua reservado à conta original e exige novo convite.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
select count(*) as _ from convert_to_solo() \gset
select count(*) as _ from restore_couple() \gset
select create_invite('RETORNA-A1') as _ \gset
do $$ begin
  assert (select mode = 'COUPLE' and solo_owner_id is null from couples), 'FALHOU: dona B não restaurou Casal';
  assert (select count(*) from couple_members) = 1, 'FALHOU: restauração reativou par sem convite';
  begin
    update couples set mode = 'SOLO', solo_owner_id = 'B';
    raise exception 'FALHOU: REST converteu Casal sem revogar vínculo';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99999999-0000-4000-8000-000000000009","role":"authenticated"}', true) as _ \gset
do $$ begin
  begin
    perform join_couple('RETORNA-A1');
    raise exception 'FALHOU: conta nova assumiu privados históricos de A';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true) as _ \gset
select * from join_couple('RETORNA-A1') \gset
do $$ begin
  assert (select my_partner_id()) = 'A', 'FALHOU: conta histórica não voltou ao próprio slot';
  assert not exists (select 1 from transactions where id = 'abab4444-0000-4000-8000-000000000001'), 'FALHOU: retorno abriu privado de B';
end $$;
select count(*) as _ from convert_to_solo() \gset
do $$ begin
  assert (select mode = 'SOLO' and solo_owner_id = 'A' from couples), 'FALHOU: A não virou dono Solo';
  assert not exists (select 1 from tasks where id = 'abab1111-0000-4000-8000-000000000001'), 'FALHOU: Solo de A abriu tarefa privada de B';
  assert not exists (select 1 from transactions where id = 'abab4444-0000-4000-8000-000000000001'), 'FALHOU: Solo de A abriu finanças privadas de B';
end $$;
reset role;
select pg_temp.assert_solo_entity_snapshot() as _ \gset
\echo 'ok  Casal para Solo: A ou B preserva todas as entidades; revoga acesso, convites e push do par; REST não reverte e retorno preserva autoria'

-- ---------------------------------------------------------------- 6l. O vínculo histórico não impede um Solo novo de B, sem remapear para A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true) as _ \gset
select create_couple('space-solo-b-new','50_50',5000,'SOLO','B') as _ \gset
insert into profiles (id,couple_id,display_name,pronoun,energy) values ('B','space-solo-b-new','B Solo','ela','MEDIUM');
insert into tasks (id,couple_id,created_by,assigned_to,title,effort,status,visible_to_partner)
values ('abab1111-0000-4000-8000-000000000002','space-solo-b-new','B','B','Continuar como B','QUICK_5M','PENDING',false);
do $$ begin
  assert my_partner_id() = 'B' and my_couple_id() = 'space-solo-b-new', 'FALHOU: novo Solo remapeou B ou bloqueou vínculo ativo novo';
  assert (select solo_owner_id from couples) = 'B', 'FALHOU: novo Solo não guardou dona B';
  assert exists (select 1 from tasks where created_by = 'B' and assigned_to = 'B'), 'FALHOU: novo Solo mudou autoria B';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99999999-0000-4000-8000-000000000009","role":"authenticated"}', true) as _ \gset
select create_couple('space-couple-b-new','50_50',5000,'COUPLE','B') as _ \gset
do $$ begin
  assert my_partner_id() = 'B' and my_couple_id() = 'space-couple-b-new', 'FALHOU: Casal retomado antes da nuvem remapeou B';
  assert (select mode = 'COUPLE' and solo_owner_id is null from couples), 'FALHOU: Casal criado por B guardou modo ou dono incorreto';
  begin
    perform create_couple('invalid-owner','50_50',5000,'COUPLE','C');
    raise exception 'FALHOU: espaço aceitou dono inválido';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
\echo 'ok  Solo B: cria espaço e retoma Casal antes da primeira nuvem sem remapear; vínculo histórico fica reservado'

-- ---------------------------------------------------------------- 6m. Um perfil nunca enviado não permite abrir privados históricos por INSERT
reset role;
delete from profiles where couple_id = 'space-solo' and id = 'A';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-4000-8000-00000000000f","role":"authenticated"}', true) as _ \gset
select count(*) as _ from convert_to_solo() \gset
do $$ begin
  assert not exists (select 1 from transactions where id = 'eeee2222-0000-4000-8000-000000000001'), 'FALHOU: conversão expôs pessoal sem perfil';
  begin
    insert into profiles (id,couple_id,display_name,pronoun,energy,share_personal_finances)
    values ('A','space-solo','forjado','ele','FULL',true);
    raise exception 'FALHOU: INSERT de perfil ausente abriu privados históricos';
  exception when insufficient_privilege then null;
  end;
  assert not exists (select 1 from profiles where id = 'A'), 'FALHOU: criou perfil do membro revogado';
  assert not exists (select 1 from transactions where id = 'eeee2222-0000-4000-8000-000000000001'), 'FALHOU: histórico privado vazou após INSERT';
end $$;
reset role;
\echo 'ok  perfil histórico ausente: INSERT do par não abre finanças pessoais de quem foi revogado'

-- ---------------------------------------------------------------- 7. chave anônima não lê nem chama RPC
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) as _ \gset
do $$ begin
  assert (select count(*) from transactions) + (select count(*) from couples) = 0, 'FALHOU: anon leu dados';
  begin
    perform create_couple('x', '50_50', 5000);
    raise exception 'FALHOU: anon chamou create_couple';
  exception when insufficient_privilege then null;
  end;
  begin
    perform create_couple('x', '50_50', 5000, 'SOLO');
    raise exception 'FALHOU: anon criou espaço Solo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform convert_to_solo();
    raise exception 'FALHOU: anon converteu espaço';
  exception when insufficient_privilege then null;
  end;
  begin
    perform restore_couple();
    raise exception 'FALHOU: anon restaurou Casal';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo 'ok  chave anônima não lê dados nem chama as funções de pareamento'

reset role;
rollback;
\echo 'TUDO CERTO: schema, inserções e RLS validados (transação desfeita)'
