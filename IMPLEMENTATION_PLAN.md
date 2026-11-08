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

## Iteração 23 (2026-11-08): avisos por categoria, com som, vibração e silêncio

- **Cinco categorias reais** (`src/domain/alerts.ts`, puro e testado): Remédio (dose e "pegou a água?"), Pedido de
  ajuda, Rede de apoio, Do seu par (lembrete carinhoso, foco junto, tarefa enviada, check-in/recado) e Casa e contas
  (rotina da casa, conta do casal que vence hoje). Cada uma com ícone, cor de token, traço, vibração e se fica na tela.
- **Avisos dentro do app** (`src/features/alerts`, `src/store/alerts.ts`): separados dos toasts (que continuam só
  confirmando o que a própria pessoa fez). Chegam pelo relógio, pela sincronização (o que é novo, do par e recente)
  e pelo push recebido com o app na frente. Botões fazem a mesma ação da tela (Já engoli, Pegando água, Eu assumo,
  Fazemos juntos, Entrar junto, Recebi). Ao abrir o app, o que já está no Hoje não toca.
- **Sons gerados com Web Audio** (sem arquivo, offline), um motivo por categoria + o da água. Volume baixo/médio/alto.
- **Ajustes > Aparelho > Avisos**: ligar/desligar cada categoria, Ouvir cada som, volume, vibrar, horário de silêncio
  (atravessa a meia-noite; pedido de ajuda pode furar). Preferências do aparelho em `ampara:alerts`.
- **Push**: o payload leva `category`, `sound`, `label` e a chave; o `sw.js` muda vibração, insistência
  (`requireInteraction`) e botão por categoria e, com o app visível, sai calado e o app toca o som. Novos lembretes na
  tela bloqueada: lembrete carinhoso e foco junto. Categorias desligadas e silêncio vão em `push_subscriptions.prefs`
  (`save_push_subscription` ganhou `p_prefs`) e o `plan.ts` respeita.
- **Limite da plataforma**: com o app fechado, o navegador não deixa escolher o som da notificação (é o do sistema).
  Som próprio na tela bloqueada exige app nativo (canal de notificação no Android): fica em Pendências.
- **Privacidade**: o worker passou a ler `nudges` e `focus_sessions`; continua sem lançamentos, ciclo, presentes e
  check-in. Por isso a conta do dia e o recado do par avisam só com o app aberto.

## Iteração 22 (2026-11-07): vários casais no servidor, cartão do check-in e primeiro nome

- **Check-in com vários casais:** `mood_checkins` passa a ter chave `(couple_id, id)`. O id `A@2026-11-07` se
  repete entre casais e o segundo casal tomava erro de RLS no upsert. O schema troca a chave uma vez em bancos já
  criados (idempotente); o app usa `on_conflict=couple_id,id` e mantém `deleted`. Espelho no `fake-supabase.ts` e
  caso no `validate.sql` com um segundo casal gravando o mesmo `A@hoje`. Os demais ids são uuid (sem colisão).
- **Cartão `my-mood-done`:** texto e recado com `basis` próprio; na lateral do Hoje no computador o recado desce
  para a linha de baixo em vez de espremer o texto palavra por palavra (checado no E2E do humor).
- **Primeiro nome:** `firstName` em `src/domain/format.ts` (antes havia quatro cópias) nas telas do dia a dia,
  gavetas, toasts, acerto do mês e título salvo de datas especiais. O nome completo fica no campo "Seu nome" de
  Ajustes, em "Usando como" e nos rótulos de acessibilidade da troca de pessoa.

## Iteração 21 (2026-11-07): correções de segurança da análise

- **Perfil e espaço no banco:** `couples` e `profiles` saíram do "for all". O par não altera mais o perfil do outro
  (antes conseguia abrir a aba pessoal ligando `share_personal_finances`) nem apaga o espaço (o cascade apagava tudo).
  Exceção: antes do par entrar, quem criou o espaço ainda sobe o perfil dele(a) (`partner_joined`). O app reenvia
  o perfil do par só para criar (`resolution=ignore-duplicates`). Espelhado em `e2e/fake-supabase.ts`, com caso novo
  no `validate.sql`, que agora também proíbe "for all" nas duas tabelas. `my_couple_id`/`my_partner_id` ganharam
  `set search_path`.
- **Service worker:** a API (`/rest/`, `/auth/`, pedidos com `Authorization`) não passa mais pelo cache. Em
  produção ela fica na mesma origem do app, então as respostas iam para o Cache Storage em texto claro e o pull
  podia receber sempre a mesma resposta guardada. O cache sobe para `ampara-v5` e "Apagar dados" limpa o que sobrou.
- **Pedido de ajuda e lembrete carinhoso:** sem "for all"; só quem pede ou manda cria, os dois atualizam, ninguém
  apaga (`help_request_exists`/`nudge_exists` deixam o upsert do par virar update). Na primeira subida cada
  aparelho manda só os seus. Casos no `validate.sql`, espelho no `fake-supabase.ts`.
- **Gateway:** HSTS e `real_ip` pelo `CF-Connecting-IP` do Cloudflare Tunnel (confiável só de endereço privado):
  o limite de tentativas passa a ser por visitante, não um só para todos (IPv6 pelo bloco /64, IPv4 por
  endereço). Ensaiado com o nginx real.
- **E2E na mesma origem:** `e2e/sw-api.spec.ts` (falha com o `sw.js` antigo).

## Iteração 20 (2026-11-06): Hoje enxuto, PWA, agenda única e acabamento

- **Cuidados:** a aba "Remédios" passa a se chamar Cuidados (remédios, rotinas, rede de apoio, ciclo).
- **Atualização do app instalado:** `/version.json` por build (nunca em cache no service worker); aviso
  "Nova versão" com [Atualizar] (salva antes de recarregar) e "Sobre este app" em Ajustes.
- **Notificação na tela certa:** com o app aberto, o service worker manda o destino por mensagem (o iOS não
  navega a janela); bloqueado, o destino espera o login. Atalhos: o iPhone abre os do app Atalhos no Safari,
  que é separado do app da Tela de Início; texto de Ajustes ficou honesto e o Android usa os atalhos do ícone.
- **Hoje enxuto:** três camadas (urgente, próxima ação, "Para hoje" com até 3 e o resto recolhido).
- **Carregamento:** abas sob demanda (bundle de 699 para 576 kB), esqueleto com a forma da tela, pré-carga
  ociosa (offline continua), botão "trabalhando" sem parecer desabilitado.
- **Seletores:** regra única de largura, divisórias, navegação de mês igual à da Agenda, categorias em chips.
- **Agenda única** (datas especiais, ciclo, contas pessoais) e **"Para onde foi"** (gastos por categoria).
- **Apresentação** de 5 passos uma vez por pessoa, com privacidade explicada; rever em Ajustes.
- **Manutenção:** `PW_PORT`, `npm run e2e:quick`; `k8s:check` avisa (sem reprovar) o cadastro aberto.
- Pendente: bundle principal ainda acima de 500 kB (React, Motion e ícones usados já no Hoje).

## Iteração 19 (2026-11-06): segurança e backup de produção

- **Backup diário do banco:** CronJob `ampara-backup` (03:30 de Brasília, 14 guardados, volume próprio) com dump do
  app (`public` + `ampara_meta`) e das contas (`auth.users`/`auth.identities`, só dados) e soma de verificação.
- **Restauração ensaiada:** `docker/backup/restore.sh` + `npm run backup:check`, que faz o backup, sobe Postgres +
  Auth novos e restaura nos dois cenários (banco sem tabelas; backend já criou as tabelas vazias), comparando as 25
  tabelas, as contas (senhas preservadas) e as políticas RLS. Nunca restaura por cima de dados. O ensaio achou dois
  problemas que quebrariam uma restauração real: o schema `public` e os privilégios padrão já existem num banco
  novo, e o papel `ampara_worker` não vai no dump (o script cria antes). Procedimento em `docs/BACKUP.md`.
- **Worker com mínimo privilégio:** papel `ampara_worker` (políticas `to ampara_worker`, sem BYPASSRLS); no k8s a
  migração vira initContainer com a senha de administrador e o worker só recebe `WORKER_DB_PASSWORD`.
- **Cadastro fechado** no Auth de produção e **limite de tentativas** no gateway (login, cadastro, recuperação,
  convite), ensaiado com o nginx real. Mensagens claras no app para cadastro fechado e excesso de tentativas.
- **Backup do app** sem a sessão da nuvem (refresh token).
- `npm run k8s:check`: manifesto e workflow conferidos (YAML válido, cadastro fechado, worker sem a senha de
  administrador, UID numérico, CronJob do backup). O script do CronJob foi rodado do próprio YAML na imagem do banco.

## Iteração 18 (2026-11-06): finanças no tempo (baixa, futuras, parceladas e fixas)

- **Dar baixa** (`payTx`): valor real (a conta veio diferente), quem pagou e data do pagamento (`paidAt`); o mês de
  competência não muda mais (antes a baixa movia o lançamento para hoje). Baixa rápida "Eu paguei / X pagou" e
  "Outro valor" na gaveta; "Desfazer baixa" volta para previsto. Pessoal também tem baixa.
- **Vencidas:** previsto com data passada fica com traço vermelho e "Vencida há N dias (dd/mm)".
- **Data no gasto:** vencimento futuro (conta futura) ou gasto de outro dia.
- **Parcelado:** o valor é o total; N parcelas (2 a 48) em centavos exatos (resto na primeira), uma por mês no
  mesmo dia (31 vira o último dia do mês curto), a primeira com o status escolhido. "Parcela 3/10".
- **Conta fixa (todo mês):** regra em `recurrences`; o app gera do mês atual até 2 meses à frente
  (`missingOccurrences`), sem passado. Editar vale para os previstos deste mês em diante; "Excluir só este mês"
  pula o mês; "Excluir este e encerrar" e "Encerrar conta fixa". Pessoal só a dona vê (RLS + `canViewRule`).
- **Meses:** setas para navegar (até 24 meses); acerto de um mês passado vai para o último dia dele.
- **Lançamento:** botão de detalhes com baixa, desfazer e excluir (com "esta e as próximas" em parcelas/fixas).
- **Dois aparelhos:** parcelas e ocorrências têm id determinístico (`seededUuid`) e as geradas nascem com
  `updatedAt` antigo; no servidor, `keep_newest()` impede que uma versão mais velha sobrescreva a mais nova
  (aparelho atrasado não desfaz a baixa do outro). Espelhado no Supabase simulado e testado no `validate.sql`.
- **Campo de valor:** pré-preenchido, o primeiro dígito substitui o valor (antes concatenava: R$ 12.000.134,90).

## Iteração 17 (2026-11-06): o backend atualiza o banco sozinho

- O backend (`ampara-push`, imagem `Dockerfile.push`) traz o `supabase/schema.sql` e aplica ao subir
  (`server/push/migrate.ts`): espera o `auth.users`, trava com advisory lock (réplicas não aplicam juntas), só aplica
  se o hash mudou (`ampara_meta.schema_versions`, fora da API REST), tudo numa transação e avisa o PostgREST.
  SQL quebrado: nada fica pela metade, o pod sai com erro e a versão anterior continua valendo.
- Saiu o initContainer `migrate` do `ampara-rest`: reaplicar um ConfigMap antigo desfaria políticas novas. O
  ConfigMap `ampara-sql` fica só para o `99-roles.sql` do banco (usado na criação).
- Fluxo de deploy: `git push` -> CI publica as imagens -> Keel atualiza `ampara-web` e `ampara-push` -> o backend
  aplica o schema. Validado no Docker: primeira subida aplica, reinício pula, duas réplicas ao mesmo tempo (uma
  aplica, a outra espera e pula), SQL quebrado desfaz e sai com código 1. `MIGRATE=off` desliga.

## Iteração 16 (2026-11-06): lembretes com a tela bloqueada (Web Push)

- **Worker** (`server/push`, imagem `Dockerfile.push`, serviço `push` no compose, Deployment `ampara-push` no k8s,
  imagem `ghcr.io/lucascamy/ampara-push` no CI). A cada 30 s lê o banco, decide com `planNotifications` (as mesmas
  regras de dose do app: dias da semana, pausa da cartela) e envia: remédio na hora (janela de 10 min), "Pegou a
  água?" quando o soneca acaba, atraso do par para a rede de apoio, rotina da casa (responsável ou os dois) e pedido
  de ajuda. Cada envio é reservado em `push_sent` antes de sair (sem duplicar com reinício ou duas réplicas);
  falha de rede libera a reserva; inscrição cancelada (404/410) é apagada. Fuso por aparelho.
- **App:** Ajustes › Lembretes no celular (estados: iPhone sem instalar, sem nuvem, bloqueado, desligado, ativo),
  opção de mostrar o nome do remédio (desligada por padrão), desligar neste aparelho. Service worker mostra a
  notificação e abre o app no lugar certo (`/?quick=med` abre a confirmação).
- **Banco:** `push_subscriptions`, `push_config`, `push_sent` e as RPCs `push_public_key`, `save_push_subscription`,
  `delete_push_subscription`, com caso no `validate.sql`.
- **Validação:** 9 testes do planejador, `push:check` contra o Postgres real (cifra decifrada como o aparelho, VAPID,
  sem duplicar, 410, falha temporária), E2E da ativação (o pushManager é simulado: não há serviço de push no
  navegador sem tela), imagem construída e rodando no Docker (gerou as chaves). O manifesto k8s não foi validado
  contra o cluster (sem acesso daqui).
- Não testado num celular de verdade: precisa do deploy (o push exige https e o app publicado).

## Iteração 15 (2026-11-06): backup cifrado

- Ajustes › Backup: "Baixar backup" (pede a senha) gera `ampara-backup-AAAA-MM-DD.ampara`, que é o próprio cofre
  cifrado. "Restaurar" (Ajustes, com confirmação de substituir) e "Restaurar backup" na primeira tela de um celular
  novo: o cofre só é trocado depois que a senha abre o do arquivo; depois a pessoa entra normalmente.
- Reduz o risco de limpeza de armazenamento do Safari (ver Pendências) para quem não usa a nuvem.
- **Correção de raiz achada no E2E:** reabrir uma gaveta enquanto a anterior ainda saía deixava dois formulários com
  o mesmo `id`, e o botão `form="..."` enviava o da gaveta velha (o erro inline não aparecia). O botão agora envia o
  formulário do próprio diálogo (`requestSubmit`). Explica a instabilidade do `pill.spec` vista na iteração 11.

## Iteração 14 (2026-11-06): fazer junto (body doubling) e caixinhas

- **Fazer junto** (aba Nós): tarefa de hoje em 1 toque ou escrita, 15/25/45 min. O par recebe o convite no Hoje
  e entra junto; "Terminamos" fecha e conclui a tarefa ligada (um Desfazer volta tudo); "Parar" sem culpa.
  Contagem em minutos com o relógio de minuto disparando o re-render e a hora exata na conta (regra de
  desempenho: o relógio de segundos continua só no "Pegando água").
- **Caixinhas** (Finanças, visão do casal): meta, guardado, quanto falta, barra de progresso, "R$ X por mês até
  MM/AAAA" com prazo, guardar/tirar com Desfazer (nunca negativo), "Meta batida".
- Banco: `focus_sessions` e `savings_goals` (o casal lê e grava; `saved_cents >= 0`), caso no `validate.sql`.
- Achados no E2E e corrigidos: contagem mostrava 1 min a mais; campo de valor digitava no começo (cursor agora
  fica no fim, como no gasto).

## Iteração 13 (2026-11-06): check-in do dia e "o que me acalma"

- **Check-in** em 1 toque no Hoje (Bem, Sem energia, Preciso de colo, Quero espaço, No limite) com recado opcional;
  um por pessoa por dia (`id = pessoa@data`). O par vê no Hoje dele com uma dica do que fazer.
- **O que me acalma:** lista de cada um (até 12 itens, sem repetir), editada na aba Nós. Aparece para o par
  quando a pessoa marca "Preciso de colo", "No limite" ou "Sem energia" e dentro do pedido de ajuda (SOS).
- Banco: `mood_checkins` e `comfort_items` (o casal lê; só a própria pessoa grava), caso no `validate.sql`.
- Correção achada no E2E da nuvem: `fromRow` não derruba mais o download inteiro por uma data inválida.

## Iteração 12 (2026-11-06): datas especiais e ideias de presente

- **Datas especiais** do casal (namoro, aniversários, outra data): repetem todo ano (29/02 vira 28/02), contam
  os anos ("3 anos de namoro") e aparecem no Hoje dos dois a partir de 7 dias antes.
- **Ideias de presente** só de quem anota (surpresa): RLS `gift_ideas_*` só para a dona, enfileiramento só das
  próprias, `purgeUnauthorized` tira as do par e a tela filtra por `giftsFor` mesmo no aparelho compartilhado.
  "Comprei" abre o gasto como pessoal + presente (já escondido do par nas Finanças); "Entreguei" fecha.
- No Hoje, quem não é o aniversariante vê "Você tem 1 ideia guardada" ou "Ainda sem ideia de presente?".
- Banco: `special_dates` (casal) e `gift_ideas` (dona), com caso no `validate.sql`.

## Iteração 11 (2026-11-06): aba "Nós" e lista de compras

- Nova aba **Nós** (5ª na navegação; cabe em 360px) para o que é do casal: lista de compras agora; presentes,
  check-in e caixinhas nas próximas iterações.
- **Lista de compras** compartilhada: captura em uma linha com quantidade ("2 kg arroz", "leite x3", "ovos 1 dz"),
  Enter adiciona e mantém o foco, repetido (sem acento/maiúscula) não entra, agrupada por Mercado/Farmácia/Casa/
  Outros, "pedido por" e "pego por". Marcar troca na hora (anti-flick); "Terminei a compra" tira o carrinho com
  Desfazer; "Registrar o gasto" abre a gaveta de gasto preenchida. Remédio meu ou da casa acabando vira atalho
  "Repor ...".
- Banco: `shopping_items` com RLS por comando (só o casal lê e grava). `Segmented fill` com 4 opções vira 2x2.
- Observado uma vez: `pill.spec` falhou na suíte completa e passou em 24 repetições isoladas e na suíte seguinte
  (instável sob carga; acompanhar).

## Iteração 10 (2026-11-06): anticoncepcional em cartela

- Remédio com `pack` (21+7, 24+4 ou 28 contínua) ancorado no 1º comprimido; as cartelas seguintes se repetem
  sozinhas. Na pausa não existe dose (nem lembrete, atraso ou aviso ao par), via `isScheduledOn`.
- Card: "Comprimido 12 de 21 · pausa a partir de ..." / "Pausa · dia 3 de 7 · cartela nova ..."; reposição
  "+1 cartela"; estoque em dias de calendário conta a pausa. Atraso mostra um lembrete honesto sobre a janela
  de 12 h (sem prometer, aponta a bula).
- Hoje: começo da pausa, véspera e dia da cartela nova (só para a dona).
- Banco: `medications.pack jsonb`. Servidor sem a coluna (PGRST204) deixa a alteração esperando na fila.

## Iteração 9 (2026-11-06): ciclo menstrual com privacidade e barra lateral

- **Ciclo menstrual** (aba Remédios › Ciclo; opcional, para quem menstrua). Registro do 1º dia em 1 toque
  ("Menstruação começou", atalhos Hoje/Ontem/Anteontem), "Terminou hoje" com 1 toque, correção e exclusão com
  Desfazer. Previsão pela mediana dos últimos 6 ciclos (sem histórico: duração informada, padrão 28/5). Fases:
  menstruação, folicular, janela fértil, lútea, pré-menstrual (7 dias antes) e atrasada. Não é orientação médica.
- **TDAH:** na semana pré-menstrual o Hoje sugere a Bateria em 50% (nunca muda sozinho; "Hoje não" fica só em
  memória, sem gravar a data em claro).
- **Privacidade (regra de domínio, `src/domain/cycle.ts`):** "Só eu vejo" (padrão), "Só o aviso" (o par vê só a
  semana de mais cuidado, publicada pela dona em `cycle_settings.sensitive_from/to`) e "Tudo" (o par vê fase e
  registros). RLS em `cycle_settings`/`cycle_logs`; só a dona grava. A linha de ajustes é legível pelo casal para o
  par saber na hora que fechou: com "Só eu vejo" a janela é nula (check no banco) e as durações vão mascaradas.
  Abrir "Tudo" depois rebaixa os registros antigos (mesmo caso da aba pessoal reaberta); fechar tira as cópias no
  aparelho de uma pessoa só (`purgeUnauthorized`).
- **Cofre antigo:** `normalizeState` completa coleções novas ao abrir (nada é apagado).
- **Publicação antes do schema:** tabela ausente no servidor (PostgREST 404/42P01) não trava o sync; a fila
  daquela coleção espera. Em produção, aplique o `schema.sql` novo (ConfigMap `ampara-sql` + reiniciar `ampara-rest`).
- **Barra lateral:** "Visão de quem está usando" e "Minha bateria mental" ocupam a largura toda (`Segmented fill`)
  e mostram o primeiro nome (nomes longos estouravam).
- Validação: 107 testes de domínio, `db:check` com o caso do ciclo (3 contas), E2E do ciclo em 8 projetos
  (+ nuvem com dois aparelhos em 2), suíte E2E completa e `audit-responsive` sem problemas.

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

- **Alarmes nativos do iOS:** (Web Push na iteração 16 cobre o caso com internet) um PWA não agenda notificação local `time-sensitive` offline. O contador de 5 min roda
  com o app aberto. Para alarmes reais na tela bloqueada, migrar a camada de UI/domínio para Expo (o domínio em
  `src/domain` é puro e reaproveitável).
- **Supabase:** conectado desde as iterações 16 a 19 (self-hosted no cluster, validado no Docker).
- **IndexedDB vs. limpeza do Safari:** (mitigado pelo backup cifrado da iteração 15) iOS pode limpar armazenamento de sites pouco usados; instalar na Tela de
  Início reduz o risco. Sync com Supabase resolve de vez.
