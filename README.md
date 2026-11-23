# Ampara

App mobile-first e offline-first para organizar a vida com foco em **TDAH**, sozinho ou em casal.
O painel "Hoje" prioriza a próxima ação, com bateria mental, modo sobrecarga, remédios em dois estágios
(Já engoli / Pegando água +5 min), captura livre e foco de cinco minutos. O modo Casal mantém pedidos de
apoio, encontro de contas em centavos e privacidade ajustável, incluindo presentes ocultos.

> Especificação de produto em [`docs/`](docs/). Os documentos ainda usam o nome provisório "Nós".
> Segurança e autenticação em [`SECURITY.md`](SECURITY.md). Regras de trabalho em [`AGENTS.md`](AGENTS.md), sistema visual em [`DESIGN.md`](DESIGN.md),
> decisões e pendências em [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

## Rodar

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. No primeiro acesso escolha **Só para mim** ou **Para um casal**:

- **Solo:** nome, pronome e senha; ciclo menstrual opcional. Entra direto, sem convite. A aba Espaço reúne
  os recursos pessoais e Finanças mostra um painel único com teto mensal opcional.
- **Casal:** cria um código de convite para o par definir a própria senha. Trocar de pessoa no mesmo
  aparelho exige a senha dela. Espaços antigos continuam no modo Casal.

Em **Ajustes > Espaço**, quem começou Solo pode convidar alguém com a senha atual, preservando os dados.

Para transformar o espaço inteiro de Casal em Solo, use **Ajustes > Casal > Usar este espaço em Solo**.
Confirme sua senha e toque em **Baixar backup e mudar para Solo**. O app inicia o download de um backup
`.ampara`, mantém os registros com as autorias e privacidade originais e suspende o acesso online do par.
Quem converteu mantém sua conta e a sincronização entre os próprios aparelhos. Se o espaço já usa nuvem,
a conversão exige conexão. Depois é possível convidar o mesmo par novamente. Registros privados do par
continuam privados; cópias offline anteriores em outros aparelhos não são apagadas. O arquivo histórico
local cifrado acompanha os backups, sem ser enviado como novos registros pela sincronização.
Ciclo, Compras e Caixinhas podem ser ligados ou desligados por pessoa sem apagar os registros.

O banco local é o IndexedDB **`ampara-local` v1**: `vault.primary` guarda o cofre AES-GCM cifrado e `kv`
guarda somente marcadores não sensíveis, como janelas de rituais e sugestões dispensadas. O cofre antigo
em `localStorage` (`ampara:vault:v1`) é migrado após confirmar a gravação; sem IndexedDB, essa chave
continua como fallback cifrado. A sessão solicita armazenamento persistente quando o navegador permite.
Exporte um backup `.ampara` em Ajustes para ter uma cópia fora do aparelho. Detalhes em [`SECURITY.md`](SECURITY.md).

## Uso diário e leitura

- **Captura livre:** escreva ou dite “gastei 35 na farmácia”, “comprar pão” ou “ligar amanhã”. Regras locais
  mostram uma prévia para conferir, salvar ou editar. O texto continua editável com o teclado e seu microfone.
- **Leitura:** em Ajustes > Aparelho, escolha Jakarta, Lexend ou Atkinson Hyperlegible e leitura ampla.
  As fontes ficam no app, disponíveis offline; os dados numéricos mantêm a fonte própria.
- **Ouvir meu dia:** fala um resumo curto ao tocar. O botão Parar ou o bloqueio do cofre interrompe a fala.
  Ditado e síntese dependem do suporte do navegador/sistema; o ditado pode precisar de conexão.
- **Rituais:** manhã, tarde opcional e fechamento leve, com horários configuráveis. Cada janela aparece no
  máximo uma vez por dia neste aparelho. O fluxo Travei ajuda a escolher um micro-passo e começar por cinco minutos.
- **Sugestões e ideias:** uma dica local por vez, sem cartão em sobrecarga, com dispensa por sete dias.
  Modelos de rotinas, kit de calma e compras entram em um toque com Desfazer. Não usam API paga de IA.
- **Ideias (segundo cérebro):** solte um pensamento em segundos (aba Ideias ou Captura livre, quando a frase
  parece pensamento e não tarefa). Ele fica na Caixa de entrada até você organizar em Área > Assunto > Ideia.
  Veja tudo em Esboço (lista) ou Mapa, com estados (solta, amadurecendo, guardada) e ligações. Só você vê,
  inclusive no Casal. A organização por IA vem depois (ADRs em `docs/adr/`); sem IA, tudo funciona à mão.
- **Módulos conectados:** estoque baixo pode entrar na lista de compras; comprar um remédio oferece reposição;
  itens comprados podem virar um gasto. Contas pessoais vencidas ou do dia também aparecem no Hoje.

## Scripts

| Script | O que faz |
|---|---|
| `npm run typecheck` | TypeScript strict (app + configs) |
| `npm run lint` | ESLint + guarda de tokens (sem hex solto, sem paleta do Tailwind, sem travessão longo, sem emoji) |
| `npm test` | Vitest: motor financeiro, privacidade, remédio, fila `sync_outbox` e cofre de autenticação |
| `npm run build` | Typecheck + build de produção |
| `npm run e2e` | Playwright (Edge instalado) em 360, 390, 1280 e 1440 px, temas claro e escuro |
| `npm run e2e:quick` | Regressão em celular 390 claro e computador 1280 escuro |
| `node scripts/audit-responsive.mjs` | Com Vite aberto: cortes, alvos e gavetas em 360/390/1024/1280 px |
| `node scripts/audit-solo-responsive.mjs` | Com Vite aberto: telas Solo e gavetas em 360/390 px, leitura ampla, Lexend/Atkinson e dois temas |
| `npm run push:check` | Com Docker e worker parado: envia ao serviço de push de teste e decifra os avisos |

Os projetos Playwright usam o Microsoft Edge instalado, inclusive os viewports com nome `iphone`.
Eles verificam dimensões, fluxos e APIs simuladas; Safari, permissões e entrega real no iPhone precisam
ser conferidos em um aparelho instalado pela Tela de Início.

## Instalar no iPhone e ativar lembretes

1. No Safari, toque em **Compartilhar > Adicionar à Tela de Início**.
2. Abra o Ampara pelo ícone instalado e conecte sua nuvem em Ajustes.
3. Em **Ajustes > Nuvem > Lembretes**, toque em **Ativar lembretes** e permita os avisos.

Web Push no iPhone exige iOS 16.4 ou mais recente e o app instalado. A permissão parte desse toque.
Com o app fechado, os avisos precisam do servidor Supabase e do worker de Web Push configurados, além de
conexão; o PWA não cria um alarme nativo offline em segundo plano. O som na tela bloqueada é o do sistema.
O Safari iOS não oferece vibração pela API web; isso não impede os demais recursos.

No iPhone, **Abrir URL** pelo app Atalhos abre o Safari, com armazenamento e login separados do PWA.
Para usar os dados do app instalado, prefira seus botões de captura e as notificações. Estes endereços
continuam disponíveis no navegador e nos atalhos compatíveis de outras plataformas:

| Atalho | URL |
|---|---|
| + Tarefa rápida | `/?quick=task` (aceita `&title=`) |
| + Registrar gasto | `/?quick=expense` (aceita `&amount=12,50&scope=PERSONAL`) |
| Tomei meu remédio | `/?quick=med` |
| Travei (Solo) / Pedir ajuda (Casal) | `/?quick=sos` |

## Sincronização

Sem servidor configurado, os dados ficam neste aparelho, cifrados, e o uso diário funciona offline.
A nuvem opcional sincroniza o Solo entre os próprios aparelhos ou o Casal entre duas pessoas:

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, rode o arquivo [`supabase/schema.sql`](supabase/schema.sql) inteiro, inclusive ao atualizar
   uma instalação antiga. A migração é idempotente e deve vir antes dos clientes desta versão.
3. Em **Authentication > Providers > Email**, deixe e-mail e senha ligados. Se "Confirm email" estiver ligado,
   cada pessoa confirma pelo link antes do primeiro acesso.
4. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   (Project Settings > API). A chave anônima é pública por desenho; quem protege os dados é o RLS.
5. `npm run build` e publique o `dist/` (o `public/_headers` já traz os cabeçalhos de segurança).

Uso: quem criou o espaço vai em **Ajustes > Nuvem > Criar conta**. No Solo, use a mesma conta nos seus outros
aparelhos, sem convite. No Casal, o par abre o Ampara no próprio celular, toca em **Entrar pela nuvem > Tenho
um convite** e usa o código mostrado em Ajustes. A sincronização roda ao abrir, ao voltar online e a cada 30 s.
O transporte de produção usa HTTPS e as linhas no Supabase têm controle de acesso por RLS; o cofre é
cifrado ao persistir no aparelho. A sincronização de dados não é criptografia de ponta a ponta contra o servidor.
Para avisos com o app fechado, publique também o worker: os exemplos em [`docker-compose.yml`](docker-compose.yml)
e [`k8s/deploy.yaml`](k8s/deploy.yaml) separam a migração com credencial de administrador da execução com
o papel restrito `ampara_worker`. As variáveis estão descritas em [`server/push/main.ts`](server/push/main.ts).

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
