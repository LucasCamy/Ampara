# Ampara

App mobile-first e offline-first para um casal organizar a vida a dois com foco em **TDAH**:
painel "Hoje" com a próxima ação antes de tudo, bateria mental com modo sobrecarga, remédios com
confirmação em 2 estágios (Já engoli / Pegando água +5 min), pedido de apoio em 3 cliques e finanças
do casal com encontro de contas em centavos e privacidade ajustável (com presentes ocultos).

> Especificação de produto em [`docs/`](docs/). Os documentos ainda usam o nome provisório "Nós".
> Segurança e autenticação em [`SECURITY.md`](SECURITY.md). Regras de trabalho em [`AGENTS.md`](AGENTS.md), sistema visual em [`DESIGN.md`](DESIGN.md),
> decisões e pendências em [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

## Rodar

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. No primeiro acesso você cria o espaço do casal com sua senha e recebe um
**código de convite** para o par criar a senha própria. Os dados ficam cifrados no aparelho
(detalhes em [`SECURITY.md`](SECURITY.md)). Tocar no nome do par no topo pede a senha dele(a).

## Scripts

| Script | O que faz |
|---|---|
| `npm run typecheck` | TypeScript strict (app + configs) |
| `npm run lint` | ESLint + guarda de tokens (sem hex solto, sem paleta do Tailwind, sem travessão longo, sem emoji) |
| `npm test` | Vitest: motor financeiro, privacidade, remédio, fila `sync_outbox` e cofre de autenticação |
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

Sem servidor configurado, tudo fica só neste aparelho (cifrado) e o app funciona normalmente.
Para **um celular para cada pessoa**, ligue a nuvem (Supabase):

1. Crie um projeto em [supabase.com](https://supabase.com) (plano gratuito serve).
2. No **SQL Editor**, rode o arquivo [`supabase/schema.sql`](supabase/schema.sql) inteiro.
3. Em **Authentication > Providers > Email**, deixe e-mail e senha ligados. Se "Confirm email" estiver ligado,
   cada pessoa confirma pelo link antes do primeiro acesso.
4. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   (Project Settings > API). A chave anônima é pública por desenho; quem protege os dados é o RLS.
5. `npm run build` e publique o `dist/` (o `public/_headers` já traz os cabeçalhos de segurança).

Uso: quem criou o espaço vai em **Ajustes > Nuvem > Criar conta**. O par abre o Ampara no próprio celular,
toca em **Entrar pela nuvem > Tenho um convite** e usa o código mostrado em Ajustes. Os dados descem cifrados
para o aparelho dele(a), e daí em diante tudo sincroniza (ao abrir, ao voltar online e a cada 30 s).

### Supabase local no Docker (desenvolvimento e validação)

O [`docker-compose.yml`](docker-compose.yml) sobe as imagens oficiais do Supabase: Postgres 15, Auth (GoTrue) e
REST (PostgREST), mais um nginx como gateway em `http://localhost:54321`. O `supabase/schema.sql` é aplicado
sozinho a cada subida (é idempotente). As chaves do compose e do `.env.docker` só valem nesta máquina.

```bash
npm run db:up
```

```bash
npm run db:check
```

```bash
npm run dev:local
```

| Script | O que faz |
|---|---|
| `npm run db:up` | Sobe o banco e aplica o schema (espera tudo ficar saudável) |
| `npm run db:check` | Roda [`supabase/tests/validate.sql`](supabase/tests/validate.sql): estrutura, inserções e RLS com três contas (transação desfeita no fim) |
| `npm run dev:local` | App em `http://localhost:5173` falando com o banco do Docker (`.env.docker`) |
| `npm run e2e:local` | Playwright com dois aparelhos contra o banco real, conferindo as linhas gravadas no Postgres |
| `npm run db:psql` | Console `psql` no banco |
| `npm run db:down` / `db:reset` | Para / apaga e recria o banco do zero |

Com o banco local as contas já nascem confirmadas (sem servidor de e-mail).

## Guia visual

`/styleguide.html` mostra tokens, tipografia e estados nos dois temas.
