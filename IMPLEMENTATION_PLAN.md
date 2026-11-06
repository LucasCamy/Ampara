# IMPLEMENTATION_PLAN.md · Ampara

## Decisões de execução

| Decisão | Motivo |
|---|---|
| Web app React (PWA) em vez de Expo | O briefing de implementação fixa React 19 + Vite + Tailwind v4. O doc 04 recomenda Expo para alarmes nativos; isso fica como evolução (ver Pendências). |
| `localStorage` estruturado por coleções + `sync_outbox` | Escrita síncrona < 1 ms, sem dependência; volume de um casal é pequeno. Interface `Persistence` permite trocar por IndexedDB. |
| Os dois parceiros no mesmo aparelho, com seletor de perspectiva | Permite testar todos os fluxos bilaterais. A privacidade é aplicada por `viewer` no domínio, igual faria a RLS. |
| Sync por adaptador | `LoopbackAdapter` simula o servidor (confirma a fila quando online). `SupabaseAdapter` usa REST e é ativado por `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. Schema e RLS em `supabase/schema.sql`. |
| Nome do produto | **Ampara** (docs ainda dizem "Nós"). Deep links: `/?quick=task|expense|med|sos`. |
| Figma | MCP sem autenticação: `DESIGN.md` + `tokens.css` + `public/styleguide.html`, conforme autorizado. |

## Fases

1. **Governança** · AGENTS.md, DESIGN.md, este plano. ✔
2. **Tokens e base visual** · `tokens.css`, `@theme` do Tailwind sem paleta padrão, fontes, primitivas. ✔
3. **Domínio** · `finance.ts` (centavos, 50/50, proporcional, 100% adiantado, custom, settlement), `privacy.ts`
   (share ON/OFF + `is_secret_gift`), `medication.ts` (PENDING → SNOOZED_WATER → TAKEN, estoque, +30 min),
   `outbox.ts` (fila idempotente), `tasks.ts` (visibilidade, foco do dia, carga semanal). ✔
4. **Stores e persistência** · `dataStore` transacional com desfazer por entidade, `uiStore`, `clockStore`. ✔
5. **Telas** · Shell (TopBar, Sidebar, BottomNav, Dock), Hoje, Agenda (Dia/Semana/Mês/Caixa), Remédios & Rotinas,
   Finanças (Nós/Meu/Dela), Ajustes & Atalhos. ✔
6. **Gavetas** · S01 Tarefa, S02 Gasto, S03 Remédio, S04 Ajuda em 3 cliques. ✔
7. **PWA e atalhos** · manifest, meta iOS, `sw.js`, leitura de `?quick=`. ✔
8. **Validação** · Vitest, typecheck, lint (+ checagem de tokens), build, Playwright em 360/390/1280/1440, claro e escuro. ✔

## Critérios de aceite rastreados

- Bateria `10%` deixa no Hoje só 1 ação essencial + botão de ajuda; o resto vai para "Pode esperar".
- `Pegando água (+5 min)` mostra contagem regressiva e borda tracejada; `Já engoli` grava horário, borda sólida, estoque -1.
- Estoque `<= 5` cria tarefa sugerida "Comprar X / pedir receita" uma única vez.
- Remédio com rede de apoio atrasado > 30 min aparece para o par com "Mandar lembrete carinhoso".
- Encontro de contas em linguagem humana; `Registrar acerto` cria `SETTLEMENT` e zera o saldo.
- Aba pessoal do par: fechada quando o dono desliga; aberta em leitura quando liga, sem os presentes.
- Pedido de ajuda em 3 cliques aparece no Hoje do par com "Deixa comigo" e "Vamos fazer juntos".
- `?quick=` abre a gaveta certa e limpa a URL.
- 0 erros de console e 0 overflow horizontal nas 4 larguras e 2 temas.

## Iteração 6 (2026-11-06): editar e excluir cadastros, estoque legível

- **Editar** remédio (só os próprios), rotina (qualquer um) e compromisso (do casal ou próprio): as mesmas gavetas
  abrem com `params.id`, título "Editar ..." e botão "Salvar alterações". Pontos de entrada: lápis no card de
  estoque, no card da rotina e no compromisso (Dia/Mês) ou toque no compromisso (Semana).
- **Excluir** dentro da gaveta de edição, na hora, com Toast + Desfazer (regra 8). Vai para a fila como DELETE
  (exclusão lógica na nuvem). Doses já registradas ficam no histórico.
- **Vários horários** (1 a 4, sem repetir, salvos em ordem) em remédio e rotina: sem isso, editar um item com
  duas doses perderia horários. A edição preserva o que o formulário não mostra (dias do remédio, limites).
- Item excluído no outro aparelho com a gaveta aberta: a gaveta mostra "Este item não existe mais".
- **Estoque:** texto único "12 comprimidos · dá para uns 12 dias (até 18/11)" + barra de nível; selo "Estoque baixo"
  quando chega no limite; o card da dose só mostra o estoque quando está acabando (sem repetição na tela).
- `MoneyText` mantém "R$" junto do número em frases (resumo de Finanças e Toasts).
- Pendente da análise: quantidade de reposição por caixa (hoje "Repor 30"), dias da semana para remédio, junção
  do dock com a navegação no celular, tom da dose muito atrasada, divisão do bundle, realtime e push.

## Iteração 8 (2026-11-06): privacidade no servidor, autorização vencida e ajustes

- **RLS (`supabase/schema.sql`):** sem política "for all" nas tabelas com privacidade.
  - `events`: `events_read/insert/update/delete` com `owner_id is null or owner_id = my_partner_id()`. O compromisso
    "Meu · só você vê" não chega ao par, e ele(a) não altera nem apaga.
  - `medications`: `meds_insert/update/delete`, com `with check` de dono. Ninguém cria remédio no nome do outro nem
    passa o seu para ele(a).
  - `medication_logs`: `logs_*` seguem o remédio (subconsulta sob o RLS de `medications`). Dose de remédio sem rede
    de apoio não desce mais para o par.
  - `transactions`: `tx_insert/update/delete`. Não havia vazamento, mas a regra 11 vale para todas.
  - Espelho em `e2e/fake-supabase.ts` (`canRead` e `canWrite` novos) e 5 casos novos em `validate.sql`, incluindo
    um que falha se aparecer política "for all" nessas tabelas.
- Correção da análise anterior: `meds_write` "for all" não vazava leitura, porque o `using` dela já estava contido
  em `meds_read`. O problema real era o `with check` sem dono.
- **Autorização vencida:**
  - O pull incremental não avisa quando uma linha deixa de ser visível. Por isso, num aparelho de uma pessoa só,
    cada descida também pede os ids visíveis de tarefas, compromissos e remédios (`listIds`).
  - `purgeUnauthorized` apaga as cópias que sumiram, junto com as doses e as entradas da fila delas. O que ainda
    está na fila, ou mudou depois do pedido, fica.
  - E2E: o compromisso do casal que virou "só você vê" some do aparelho do par.
- **Excluir remédio** leva a tarefa pendente "Repor estoque" (`sourceMedicationId`), e o Desfazer devolve as duas.
  `EventSheet` usa `useNow()` como data inicial.
- **Semana no computador:** botão de concluir e reabrir no card (`CircleDashed` / `CircleCheck` + "Feita" +
  `ledger-ok`), com Desfazer.
- **Validação:** `db:check` (18 verificações), 83 testes de unidade, 146 E2E, `e2e:local` 2/2 e
  `audit-responsive` sem problemas.

## Iteração 7 (2026-11-06): data e hora com a cara do app

- Decisão: manter o seletor nativo (roda do iOS, diálogo do Android, teclado e leitor de tela de graça) e
  personalizar só a moldura. `src/components/pickers.tsx`: `PickerInput` (moldura do `TextField`, `font-data`,
  ícone Lucide no lugar do indicador do navegador, que fica invisível por cima dele em `.picker-input`),
  `DateField`, `TimeField` e `QuickChips`.
- Atalhos em chips (`aria-pressed`, `min-h-11`, sem transição): data Hoje / Amanhã / próximo sábado; início
  09:00 / 14:00 / 19:00; término +30 min / +1 h / +2 h a partir do início; horários de remédio e rotina
  08:00 / 12:00 / 18:00 / 20:00, aplicados ao último horário tocado.
- Mudar o início leva o término junto, mantendo a duração. A data mostra o dia por extenso como dica.
- Domínio: `dateShortcuts`, `longDateLabel`, `addMinutesToTime` (sem passar da meia-noite) em `dates.ts`, com testes.
- Calendário próprio em gaveta fica para depois, só se o nativo ainda incomodar no computador.

## Iteração 5 (2026-11-06): auditoria de QA e novos cadastros

**Correções da auditoria**
- Gavetas: o botão de salvar saiu da área de rolagem e foi para o `footer` do `<Sheet>` (`form="<id>"`, ids em
  `src/features/sheets/forms.ts`). Acabou a fresta onde o conteúdo vazava em 360px.
- Semana da Agenda: grade progressiva `md:2 / xl:4 / 2xl:7`, carga do dia quebra linha, textos com `break-words`.
- `Segmented stretch`: colunas iguais só abaixo de 640px; do `sm` em diante cada opção tem a largura natural
  ("Caixa de Entrada" inteiro).
- Valores em R$ com `whitespace-nowrap` (não quebra entre "R$" e o número).
- Modo escuro: token novo `--segment-active` (mais claro que o trilho nos dois temas) + `ring-line-strong` no item
  ativo; bolinha do `Switch` desligado em `bg-muted`.
- Alvos: nada abaixo de 44px (`Segmented sm`, pílula de sync, ícones da semana). Regra 7 do AGENTS.md atualizada.
- Engrenagem do topo com estado ativo; "Testar agora" dos atalhos abre a gaveta pelo store (`ui.launchQuick`), sem
  recarregar a página (a sessão não cai).
- `scripts/audit-responsive.mjs` agora cobre 360/390/1024/1280, claro e escuro (pelo botão do app), cards
  estourando, alvos < 44px, botão de salvar dentro da rolagem e as 7 gavetas; sai com código 1 se achar problema.

**Cadastros novos** (regras puras em `src/domain/catalog.ts`, actions `addMedication`, `addRoutine`, `addEvent`)
- Divergências do pedido, por causa do modelo existente: remédios e rotinas são a mesma coleção (`meds`, tabela
  `medications`) e compromissos são `events`; não existem entidades `routines` nem `calendar_events`.
- Rotina continua sem dono (`owner_id` nulo, qualquer um confirma, como diz a tela). "Responsável" virou o campo
  `assignee` (só referência). Se usasse `owner_id`, o RLS esconderia a rotina do par.
- Em vez de um texto livre `recurrenceLabel`: dias da semana (Todo dia, Dias úteis, Fim de semana ou escolher)
  + instrução livre. Assim a rotina aparece só nos dias certos.
- Compromisso: tipo "Conta que vence" virou `EventKind` `BILL` (triângulo no calendário). Schema: constraint de
  `events.kind`, colunas `medications.assignee` e `medications.stock_unit` (aplicado e validado no Docker).

## Iteração 4 (2026-11-06): Supabase real no Docker

- `docker-compose.yml` com as imagens oficiais (Postgres 15.8, GoTrue, PostgREST) e nginx como gateway em `:54321`;
  serviço `migrate` aplica `supabase/schema.sql` (agora idempotente) depois que o Auth cria `auth.users`.
- `supabase/tests/validate.sql` (`npm run db:check`): 14 verificações com três contas reais no Postgres.
- `e2e/real-supabase.spec.ts` (`npm run e2e:local`): dois aparelhos contra o banco real, build de produção com CSP.
- **Bugs que só o banco real mostrou (corrigidos):**
  1. `create_invite`/`join_couple` quebravam no Supabase: `digest()` do pgcrypto fica no schema `extensions`, fora
     do `search_path = public`. Parear pela nuvem falharia em produção.
  2. `tasks_write` era `for all`: no Postgres isso também vale para SELECT (políticas permissivas somam com OR) e
     vazava as tarefas privadas do par. Separado em insert/update/delete. O simulado só olhava a política de leitura.
  3. Laço de sincronização: `syncNow` sempre criava um array novo de `outbox`, a assinatura disparava outro `syncNow`
     250 ms depois, sem fim (~36 requisições/s com a nuvem ligada). Agora devolve o mesmo estado quando nada mudou.
  4. Par que **reabre** a aba pessoal: os lançamentos antigos não mudam no servidor e o pull incremental nunca os
     trazia. O pull agora rebaixa os lançamentos quando a aba do par passa de fechada para aberta.
  5. CSP do build lia só `process.env`: com a URL no `.env`, o `connect-src` saía sem o Supabase e o navegador
     bloquearia a nuvem. Agora usa `loadEnv` do modo.
  6. O aparelho compartilhado enviava a tarefa privada do par (o servidor recusava com 403). `enqueueAll` espelha
     `tasks_read`.
- **Pendente:** realtime; logs de dose (`medication_logs`) de remédio sem rede de apoio ainda descem para o par
  (só status e horário, sem nome do remédio).

## Iteração 3 (2026-11-06): nuvem entre aparelhos

- **Supabase Auth via REST** (sem SDK): criar conta, entrar, renovar (voo único, com rotação) e revogar.
- **Pareamento por convite no servidor:** RPCs `create_couple`, `create_invite` (só hash), `join_couple`, `my_membership`.
- **Aparelho novo:** "Entrar pela nuvem" baixa o espaço e cria o cofre local só com aquela pessoa (o par aparece como
  "Outro aparelho"); o refresh token fica cifrado no cofre.
- **Pull incremental** por `synced_at` do servidor, merge LWW com "dose tomada vence", exclusão lógica e limpeza de
  cópias quando o par fecha a aba pessoal.
- **Bugs encontrados pelos testes de dois aparelhos e corrigidos:** atualização perdida no pull (mudança feita durante
  o download era desfeita), fila presa para sempre com itens que o servidor recusa (itens do par) e a política de
  leitura de tarefas que impedia o arquivamento de chegar ao outro aparelho.
- ~~Pendente: aplicar o `schema.sql` num Supabase real~~ (feito na iteração 4); realtime (hoje é sincronização
  periódica de 30 s).

## Iteração 2 (2026-11-06): autenticação, responsividade e dependências

- **Autenticação obrigatória** (decisão do usuário): cofre local cifrado, convite do par, sessão lembrada,
  bloqueio por inatividade, step-up para ações sensíveis, recuperação por novo convite. Ver `SECURITY.md`.
- **Divergência com o doc 04:** o doc prevê Supabase Auth. Sem projeto Supabase nesta sessão, a autenticação é
  local e o adaptador de sync só grava com token de usuário. Ligar Supabase Auth é o próximo passo.
- **Responsividade:** `Segmented` não rola mais horizontalmente (stretch + rótulo curto), cards do Hoje
  compactos no celular, ações de tarefa com rótulos curtos, só a barra principal fica fixa no topo.
- **Bugs corrigidos:** o campo de valor começava com o cursor antes de "R$" e o primeiro dígito entrava errado;
  o foco automático da gaveta podia puxar o foco de volta enquanto a pessoa já digitava em outro campo;
  reabrir uma gaveta durante a animação de saída reaproveitava a gaveta que estava saindo.

| Verificação (2026-11-06) | Resultado |
|---|---|
| typecheck, lint + check-tokens | ok |
| `npm test` | 49 testes (finanças, privacidade, remédio, outbox, cofre e recuperação) |
| `npm audit` | 0 vulnerabilidades |
| `npm run e2e` | 114 passando; 30 pulados por desenho (testes de acesso rodam em 3 dos 8 projetos) |
| `scripts/audit-responsive.mjs` | 360 e 390: nenhum menu cortado, botão estourando ou overflow |
- **npm:** 0 vulnerabilidades (override `minimatch@^11.0.5`), `lucide-react` e `motion` atualizados.
  TypeScript fica em 6.x porque `typescript-eslint` ainda exige < 6.1.

## Validação executada (2026-11-05)

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | ok, TypeScript strict sem erros |
| `npm run lint` | ok, ESLint + `check-tokens` (39 arquivos, zero hex solto / paleta Tailwind / travessão / emoji) |
| `npm test` | 39 testes Vitest passando (finanças, privacidade, remédio, outbox) |
| `npm run build` | ok |
| `npm run e2e` | 96 testes Playwright passando: 12 cenários × (360, 390, 1280, 1440) × (claro, escuro), com 0 erros de console e 0 overflow horizontal |

Screenshots ficam em `test-results/screens/<projeto>/` após `npm run e2e` (fora do git).

## Pendências e riscos

- **Alarmes nativos do iOS:** um PWA não agenda notificação local `time-sensitive` offline. O contador de 5 min roda
  com o app aberto. Para alarmes reais na tela bloqueada, migrar a camada de UI/domínio para Expo (o domínio em
  `src/domain` é puro e reaproveitável).
- **Supabase:** adaptador e schema prontos, não conectados (sem credenciais nesta sessão). O pareamento é simulado
  com código de convite local.
- **IndexedDB vs. limpeza do Safari:** iOS pode limpar armazenamento de sites pouco usados; instalar na Tela de
  Início reduz o risco. Sync com Supabase resolve de vez.
