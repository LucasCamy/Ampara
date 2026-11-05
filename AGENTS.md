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
- Persistência local em `localStorage` estruturado por coleções + fila `sync_outbox`
- Vitest (domínio) e Playwright (E2E, usa o Microsoft Edge instalado via `channel: 'msedge'`)

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor Vite em `http://localhost:5173` |
| `npm run typecheck` | `tsc -b` sem emitir |
| `npm run lint` | ESLint + `scripts/check-tokens.mjs` (hex solto, cor padrão do Tailwind, travessão longo, emoji em UI) |
| `npm test` | Vitest dos motores de domínio (`src/domain/**/*.test.ts`) |
| `npm run build` | Typecheck + build de produção em `dist/` |
| `npm run e2e` | Build + `vite preview` + Playwright (larguras 360, 390, 1280, 1440; claro e escuro) |

## Estrutura

```
src/
  domain/      regras puras e testadas (finance, privacy, medication, outbox, tasks, dates, format)
  store/       stores externos (data, ui, clock) com useSyncExternalStore; ações estáveis
  sync/        adaptadores de sincronização (loopback local e Supabase via REST)
  components/  primitivas de UI (Sheet, Toast, StatusBadge, Chip, Field...)
  features/    telas: today, agenda, routines, finance, settings, sheets, shell
  styles/      tokens.css (fonte única de cor, raio, sombra e motion)
supabase/      schema.sql com RLS da privacidade financeira
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
7. **Formulários.** `label` acima, campo `>= 16px`, alvo `>= 48px`, erro inline com `role="alert"` + `aria-invalid`.
8. **Desfazer em vez de confirmar.** Ações rápidas acontecem na hora e mostram `Toast` com `[Desfazer]` por 5 s.
9. **Sem emoji como ícone estrutural** e sem travessão longo em texto visível. Ícones: Lucide.
10. **Privacidade é regra de domínio.** Qualquer leitura de transações para um visualizador passa por
    `src/domain/privacy.ts`. Nunca filtrar privacidade só na UI.

## Desempenho

- Stores separados (`dataStore`, `uiStore`, `clockStore`): abrir uma gaveta altera só o `uiStore`, sem
  re-render das listas de dados.
- O relógio de segundos só é assinado pelo contador regressivo do "Pegando água".
- Gavetas entram em 260 ms e saem em 170 ms, `transform` em string (WAAPI no compositor).

## Git

Remoto: `https://github.com/LucasCamy/Ampara.git`. Commits só quando o usuário pedir.
