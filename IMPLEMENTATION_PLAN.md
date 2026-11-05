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
