# Ampara

App mobile-first e offline-first para um casal organizar a vida a dois com foco em **TDAH**:
painel "Hoje" com a próxima ação antes de tudo, bateria mental com modo sobrecarga, remédios com
confirmação em 2 estágios (Já engoli / Pegando água +5 min), pedido de apoio em 3 cliques e finanças
do casal com encontro de contas em centavos e privacidade ajustável (com presentes ocultos).

> Especificação de produto em [`docs/`](docs/). Os documentos ainda usam o nome provisório "Nós".
> Regras de trabalho em [`AGENTS.md`](AGENTS.md), sistema visual em [`DESIGN.md`](DESIGN.md),
> decisões e pendências em [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

## Rodar

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. Os dados de exemplo são criados no primeiro acesso e ficam salvos no aparelho.
Use o seletor **Visão: Lucas / Visão: Namorada** no topo para testar os fluxos dos dois lados.

## Scripts

| Script | O que faz |
|---|---|
| `npm run typecheck` | TypeScript strict (app + configs) |
| `npm run lint` | ESLint + guarda de tokens (sem hex solto, sem paleta do Tailwind, sem travessão longo, sem emoji) |
| `npm test` | Vitest: motor financeiro, privacidade, máquina de estados do remédio, fila `sync_outbox` |
| `npm run build` | Typecheck + build de produção |
| `npm run e2e` | Playwright (Edge instalado) em 360, 390, 1280 e 1440 px, temas claro e escuro |

## Atalhos do iPhone

Instale pela Tela de Início (Safari > Compartilhar > Adicionar à Tela de Início) e crie atalhos no app
**Atalhos** com a ação "Abrir URL":

| Atalho | URL |
|---|---|
| + Tarefa rápida | `/?quick=task` (aceita `&title=`) |
| + Registrar gasto | `/?quick=expense` (aceita `&amount=12,50&scope=PERSONAL`) |
| Tomei meu remédio | `/?quick=med` |
| Pedir ajuda ao amor | `/?quick=sos` |

## Sincronização

Sem configuração, o app usa um adaptador local que simula o servidor (toque no status de sync no topo
para simular o modo offline e ver a fila crescer). Para sincronizar de verdade entre dois aparelhos:
crie um projeto Supabase, rode [`supabase/schema.sql`](supabase/schema.sql) e preencha `.env`
a partir de `.env.example`.

## Guia visual

`/styleguide.html` mostra tokens, tipografia e estados nos dois temas.
