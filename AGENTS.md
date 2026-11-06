# AGENTS.md · Ampara

Ampara é um app mobile-first e offline-first para um casal organizar a vida a dois com foco em TDAH:
captura em menos de 3 segundos, painel "Hoje" com a próxima ação antes do histórico, remédios com
confirmação em 2 estágios, pedido de apoio em 3 cliques e finanças do casal com privacidade ajustável.

A especificação de produto está em `docs/` (01 a 06). Os documentos ainda chamam o produto de "Nós";
o nome oficial passou a ser **Ampara**. Em caso de conflito entre docs e código, o código atual e este
arquivo prevalecem; registre a divergência em `IMPLEMENTATION_PLAN.md`.

## Stack (conferida em `package.json`)

- React 19 + TypeScript `strict` + Vite
- Tailwind CSS v4 (`@tailwindcss/vite`) com a paleta padrão **removida** (`--color-*: initial`)
- `motion/react` para gavetas e toasts, `lucide-react` para ícones
- `@fontsource/plus-jakarta-sans` (interface e display) e `@fontsource/jetbrains-mono` (dados)
- Autenticação local obrigatória com cofre cifrado (WebCrypto: PBKDF2 600k + AES-GCM 256), ver `SECURITY.md`
- Persistência local cifrada em `localStorage` (`ampara:vault:v1`) + fila `sync_outbox`
- Vitest (domínio) e Playwright (E2E, usa o Microsoft Edge instalado via `channel: 'msedge'`)

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor Vite em `http://localhost:5173` |
| `npm run typecheck` | `tsc` (app + configs) sem emitir |
| `npm run lint` | ESLint + `scripts/check-tokens.mjs` (hex solto, cor padrão do Tailwind, travessão longo, emoji em UI) |
| `npm test` | Vitest de domínio e do cofre (`src/**/*.test.ts`) |
| `node scripts/audit-responsive.mjs` | Com `npm run dev` rodando: aponta menus cortados e botões estourando em 360/390 |
| `npm run build` | Typecheck + build de produção em `dist/` |
| `npm run e2e` | Build + `vite preview` + Playwright (larguras 360, 390, 1280, 1440; claro e escuro) |
| `npm run db:up` | Supabase local no Docker (Postgres, Auth, REST, gateway em `:54321`) e aplica `supabase/schema.sql` |
| `npm run db:check` | `supabase/tests/validate.sql`: estrutura, inserções e RLS com três contas no Postgres real |
| `npm run dev:local` / `npm run e2e:local` | App / Playwright de dois aparelhos contra o banco do Docker (`.env.docker`) |

## Estrutura

```
src/
  domain/      regras puras e testadas (finance, privacy, medication, cycle, outbox, tasks, dates, format)
  store/       stores externos (data, ui, clock) com useSyncExternalStore; ações estáveis
  auth/        cofre cifrado, sessão, convite do par (crypto, vault, session)
  sync/        motor da fila, nuvem (cloud.ts: conta, pareamento, push/pull) e cliente REST do Supabase (remote.ts)
  components/  primitivas de UI (Sheet, Toast, StatusBadge, Chip, Field...)
  features/    telas: today, agenda, us (aba Nós), routines, cycle, finance, settings, sheets, shell
  styles/      tokens.css (fonte única de cor, raio, sombra e motion)
supabase/      schema.sql (idempotente, RLS da privacidade) e tests/validate.sql
docker/       roles do Postgres e gateway nginx do docker-compose.yml
public/        manifest.webmanifest, ícones, sw.js
```

## Regras do projeto

1. **Cor só por token.** Nenhum hex fora de `src/styles/tokens.css`. Nenhuma classe de paleta do Tailwind
   (`blue-500`, `gray-100`...). Use `bg-surface`, `text-ink`, `text-muted`, `border-line`, `bg-action`...
2. **Um acento de ação** (`--action`). Verde, âmbar e vermelho são exclusivos de estado semântico.
3. **Estado = ícone + texto + cor + traço.** Confirmado: `CircleCheck` + borda sólida. Previsto/pendente/snooze:
   `CircleDashed`/`Clock` + borda tracejada. Atrasado/SOS: `SquareX`/`HeartHandshake` + `--state-err`.
   Use sempre `<StatusBadge>` e as classes `.ledger-solid` / `.ledger-dashed`.
4. **Números nunca mudos.** Valores em R$, horários e estoques usam `font-data` (`tabular-nums`) e vêm com
   unidade, pessoa e janela de tempo. Dinheiro é sempre inteiro em centavos (`amountCents`).
5. **Anti-flick.** Abas, chips e filtros trocam o estado ativo sem transição. Transição de cor só em `hover`.
6. **Gavetas no compositor.** Animar apenas `transform` em string e `opacity`. Sem `backdrop-filter`.
7. **Formulários e alvos.** `label` acima, campo `>= 16px`, erro inline com `role="alert"` + `aria-invalid`. Campos e ações
   primárias `>= 48px` (`min-h-12`); controles compactos e filtros (`Segmented size="sm"`, ícones, pílula de sync) `>= 44px` (`min-h-11`).
   Botão de salvar da gaveta vai no `footer` do `<Sheet>` (fora da rolagem) com `form="<id>"` (ver `src/features/sheets/forms.ts`).
8. **Desfazer em vez de confirmar.** Ações rápidas acontecem na hora e mostram `Toast` com `[Desfazer]` por 5 s.
9. **Sem emoji como ícone estrutural** e sem travessão longo em texto visível. Ícones: Lucide.
10. **Nada antes do login.** Nenhuma tela lê dados sem sessão aberta. Nunca gravar dados ou senha em texto claro;
    toda gravação passa por `src/auth/session.ts`. Quem está usando (`viewer`) vem da sessão, não de preferência.
    Trocar de pessoa, apagar dados e gerar convite exigem senha.
11. **Nuvem.** Escrever no estado depois de algo assíncrono sempre com `dataStore.set((cur) => ...)` sobre o estado
    atual, nunca com uma cópia lida antes (evita atualização perdida). Políticas novas no `schema.sql` precisam do
    espelho em `e2e/fake-supabase.ts` e um caso em `supabase/tests/validate.sql` (rode `npm run db:check`). Política
    de escrita nunca `for all`: no Postgres ela também libera SELECT. O `schema.sql` precisa continuar idempotente.
12. **Mobile primeiro de verdade.** Menus (`Segmented`) precisam caber em 360px: use `stretch` e `shortLabel`.
    Rode `scripts/audit-responsive.mjs` depois de mexer em layout.
13. **Privacidade é regra de domínio.** Qualquer leitura de transações para um visualizador passa por
    `src/domain/privacy.ts`. Nunca filtrar privacidade só na UI.

## Desempenho

- Stores separados (`dataStore`, `uiStore`, `clockStore`): abrir uma gaveta altera só o `uiStore`, sem
  re-render das listas de dados.
- O relógio de segundos só é assinado pelo contador regressivo do "Pegando água".
- Gavetas entram em 260 ms e saem em 170 ms, `transform` em string (WAAPI no compositor).

## Git

Remoto: `https://github.com/LucasCamy/Ampara.git`. Commits só quando o usuário pedir.
