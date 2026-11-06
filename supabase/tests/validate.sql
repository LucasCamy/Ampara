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
                      'medication_logs','transactions','help_requests','nudges','cycle_settings','cycle_logs','shopping_items']) t
   where to_regclass('public.' || t) is null;
  assert missing is null, 'FALHOU: tabelas ausentes: ' || coalesce(missing, '');

  select string_agg(c.relname, ', ') into missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  assert missing is null, 'FALHOU: tabelas sem RLS: ' || coalesce(missing, '');

  select string_agg(f, ', ') into missing
    from unnest(array['create_couple','create_invite','join_couple','my_membership','my_couple_id','my_partner_id']) f
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f);
  assert missing is null, 'FALHOU: funções ausentes: ' || coalesce(missing, '');

  -- regra 11: política "for all" também libera SELECT; tabelas com privacidade só têm política por comando
  select string_agg(tablename || '.' || policyname, ', ') into missing
    from pg_policies
   where schemaname = 'public' and cmd = 'ALL'
     and tablename in ('tasks','events','medications','medication_logs','transactions','cycle_settings','cycle_logs','shopping_items');
  assert missing is null, 'FALHOU: política "for all" em tabela com privacidade: ' || coalesce(missing, '');
end $$;
\echo 'ok  estrutura: 14 tabelas, RLS ligado em todas, 6 funções'

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
end $$;
\echo 'ok  chave anônima não lê dados nem chama as funções de pareamento'

reset role;
rollback;
\echo 'TUDO CERTO: schema, inserções e RLS validados (transação desfeita)'
