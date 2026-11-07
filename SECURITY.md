# SECURITY.md · Ampara

Base: referência de segurança do kit (`project-workflow/references/security-audit.md`), que aponta para a
skill [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill). Consultei o
`SKILL.md` e os tópicos `WEB-PROTOCOL-AND-AUTH.md`, `CLIENT-SIDE.md` e `DATA-ISOLATION-AND-LIFECYCLE.md`
em 2026-11-06. Isto é uma **análise em modo orientação** (não a auditoria completa com verificadores
independentes e sandbox). Uso a classificação da skill: `confirmado` (controle implementado e testado),
`needs_validation` (depende de algo fora do repositório) e nota de reforço (defesa em profundidade).

## Modelo de ameaça

| Quem | O que pode | O que protege |
|---|---|---|
| Pessoa que pega o celular desbloqueado ou o computador | Abrir o app, ler o armazenamento do navegador | Login obrigatório; dados cifrados em repouso; bloqueio por inatividade |
| Par usando o mesmo aparelho | Trocar de perspectiva para ver a aba pessoal fechada ou presentes | Trocar de pessoa exige a senha da outra pessoa; privacidade aplicada no domínio |
| Aba antiga ou outra aba | Sobrescrever dados novos, continuar aberta após bloquear | BroadcastChannel + evento `storage`; revisão `rev` do cofre |
| Página maliciosa | Enquadrar o app (clickjacking), injetar script via URL | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, CSP `script-src 'self'`, parâmetros `?quick=` só por lista fechada |
| Servidor (quando ligado) | Ler dados de outro casal | RLS por `couple_id` + `auth.uid()`; adaptador nunca grava com a chave anônima |

## Autenticação (como funciona)

1. **Cadastro (T01):** a pessoa A cria nome e senha; a pessoa B recebe um **código de convite** de 10 símbolos
   (~49 bits, sem viés de módulo) exibido uma vez e guardado só dentro dos dados cifrados.
2. **Cofre:** uma chave de dados (DEK) AES-GCM 256 aleatória cifra tudo. A DEK é embrulhada (AES-KW) por uma
   chave derivada da senha de cada pessoa: **PBKDF2-HMAC-SHA256, 600.000 iterações, sal de 16 bytes**
   (recomendação OWASP Password Storage). Nenhuma senha ou hash de senha é gravado: errar a senha simplesmente
   não abre a DEK (AES-KW tem verificação de integridade).
3. **Sessão:** a DEK da sessão é importada como **não extraível** e fica só em memória. "Manter conectado (14 dias)"
   guarda esse `CryptoKey` não extraível no IndexedDB (o script consegue usar, mas não ler os bytes).
4. **Senha:** mínimo 10, máximo 128 caracteres, bloqueio de senhas comuns e do próprio nome (NIST 800-63B,
   sem regras de composição).
5. **Tentativas:** 5 livres, depois atraso de 30 s dobrando até 15 min, por pessoa.
6. **Recuperação:** sem servidor não existe "esqueci a senha" por e-mail. Quem está com acesso confirma a própria
   senha (step-up) e gera **novo convite** para o par; a senha antiga do par deixa de funcionar.

## Nuvem (um celular para cada)

1. **Conta por pessoa** no Supabase Auth (e-mail + senha, enviados só ao servidor por HTTPS).
2. **Pareamento:** quem cria o espaço chama `create_couple`; o convite vai ao servidor por `create_invite`, que guarda
   **só o SHA-256** do código, válido por 7 dias e uma vez. O par entra com `join_couple`. O convite em texto claro
   nunca é enviado em uma linha de tabela (o teste E2E confere).
3. **Tokens:** access token só em memória; refresh token cifrado dentro do cofre local da pessoa (AES-GCM com a chave
   de dados e AAD por pessoa). Renovação em voo único (o Supabase rotaciona o refresh token). Desconectar revoga no
   servidor; bloquear o app tira o token da memória.
4. **Gravação só com token de usuário:** sem sessão, a fila espera. Cada pessoa só sobe o que pode gravar (lançamentos
   pessoais e remédios do par ficam para o aparelho do par, espelhando `tx_insert`, `meds_insert`, `events_insert` e `logs_insert`).
5. **Descida:** cursor `synced_at` carimbado pelo servidor (relógios diferentes não fazem perder alterações);
   conflito = última edição vence, exceto dose tomada, que sempre vence. Remoções viajam como exclusão lógica.
6. **Autorização vencida:** quando o par fecha a aba pessoal, desliga a rede de apoio de um remédio, torna um compromisso
   "Meu · só você vê" ou uma tarefa privada, o servidor para de entregar a linha. O pull incremental nunca avisa disso,
   então a cada descida o aparelho de uma pessoa só pede os ids que o RLS ainda mostra (`listIds`) e apaga as cópias
   que sumiram, com as doses e a fila delas (`purgeUnauthorized`). O que ainda está subindo, ou mudou depois do pedido,
   fica. Coberto por teste unitário e E2E.
7. **Política por comando:** nas tabelas com privacidade (`tasks`, `events`, `medications`, `medication_logs`,
   `transactions`) não existe política "for all": no Postgres ela também vale para SELECT e soma com a leitura.
   `validate.sql` falha se alguma aparecer (a lista cresceu com as tabelas novas: ciclo, compras, datas, presentes,
   check-in, "o que me acalma", fazer junto e caixinhas). `couples` e `profiles` também entraram na lista
   (2026-11-07): com "for all" o par conseguia ligar `share_personal_finances` no perfil do outro (o que libera
   `tx_read`) e apagar o espaço, levando os dados dos dois no cascade. Agora cada pessoa só altera o próprio perfil
   (o do par só antes de ele(a) entrar na nuvem, para a primeira subida; o app reenvia o perfil do par com
   `ignore-duplicates`), ninguém apaga perfil nem espaço pela API e a divisão do casal continua editável pelos dois.
   `help_requests` e `nudges` seguiram o mesmo caminho: só quem pede ou manda cria (ninguém forja um pedido de
   ajuda em nome do par), os dois atualizam (aceitar, resolver, marcar como visto) e ninguém apaga.
8. **Dados de saúde e surpresas:** ciclo menstrual (`cycle_settings`/`cycle_logs`) só a dona grava; o par lê a janela
   ou os registros conforme ela escolheu, e com "Só eu vejo" a linha de ajustes não diz nada (janela nula por check no
   banco, durações mascaradas pelo app). Ideias de presente (`gift_ideas`) só quem anotou lê ou grava. Nos dois casos a
   tela também filtra por regra de domínio (`src/domain/cycle.ts`, `src/domain/specialDates.ts`), o que vale no aparelho
   compartilhado.

## Backup cifrado

- O arquivo `.ampara` é o próprio cofre (PBKDF2 600k + AES-GCM 256), sem decifrar nada: sem a senha ele não abre.
  Exportar pede a senha de novo. O arquivo não tem senha nem dado do casal em texto claro (coberto por teste e E2E);
  só os nomes do cabeçalho, como no cofre local.
- Restaurar só substitui o cofre deste aparelho depois que a senha abre o cofre do arquivo; com dados no aparelho,
  pede confirmação explícita. Depois a pessoa entra normalmente (sessão lembrada e tentativas são zeradas).
- O arquivo NÃO leva a sessão da nuvem (refresh token): quem achar o arquivo e souber a senha abre os dados daquele
  aparelho, mas não entra na conta da nuvem. Depois de restaurar, a pessoa conecta a nuvem de novo em Ajustes.

## Mapeamento das classes da skill

| Classe (nome na skill) | Estado | Onde |
|---|---|---|
| Session fixation and invalidation | confirmado | `lock()`, `changeMyPassword()` e `wipeDevice()` apagam a sessão lembrada e avisam outras abas (`src/auth/session.ts`); E2E "bloquear em uma aba bloqueia as outras" |
| Password reset and broader recovery | confirmado | `reinvite()` exige senha de quem gera e invalida o acesso antigo (`src/auth/vault.ts`, teste "recuperação de acesso pelo par") |
| Step-up binding and bypass | confirmado | Apagar dados, trocar senha e gerar convite pedem a senha de novo; trocar de perspectiva pede a senha da outra pessoa |
| Browser-storage disclosure and stale authorization | confirmado | Nada em texto claro no `localStorage` (E2E verifica que não aparecem "Venvanse", "Supermercado" nem a senha); a chave antiga em texto claro é migrada e apagada |
| Cross-context storage and broadcast confusion | confirmado | `storage` recarrega dados novos; `rev` incrementa a cada gravação; bloqueio chega a todas as abas |
| Service-worker cache and identity confusion | confirmado | `public/sw.js` guarda só o app do mesmo domínio e deixa passar direto `/rest/`, `/auth/` e qualquer pedido com `Authorization`. Até 2026-11-07 a API atrás do gateway (mesma origem) caía no cache: dados do casal em texto claro no Cache Storage e pull travado. O cache subiu para `ampara-v5` (o antigo é apagado) e "Apagar dados" remove respostas da API que tenham sobrado. `e2e/sw-api.spec.ts` chama a API da mesma origem com o service worker no controle e confere que nada é reaproveitado nem guardado (falha com o `sw.js` antigo) |
| DOM-based XSS (fonte `location`) | confirmado | `?quick=` aceita só `task/expense/med/sos`; `title`/`amount` entram como valor de input React (escapado) e a URL é limpa |
| Client-side navigation confusion | confirmado | Navegação só para URLs montadas com `location.origin` |
| Clickjacking | confirmado no `vite preview` / needs_validation na hospedagem | `vite.config.ts` e `public/_headers`; conferir os cabeçalhos no provedor real |
| postMessage origin and source trust | não se aplica | Sem `postMessage`; `BroadcastChannel` é restrito à mesma origem |
| Ordinary CSRF | não se aplica | Supabase usa token `Authorization: Bearer`, não cookie |
| Missing tenant or owner enforcement / Policy and query disagreement | confirmado no Postgres local (Docker) / conferir de novo no projeto de produção | `supabase/schema.sql` (RLS por `couple_id`, `tx_read` espelha `src/domain/privacy.ts`); `supabase/tests/validate.sql` com três contas e `e2e/real-supabase.spec.ts`. A validação real achou e corrigiu um vazamento (`tasks_write` "for all" liberava SELECT). Iteração 8: compromisso "só você vê" e doses de remédio sem rede de apoio deixaram de chegar ao par; ninguém cria remédio ou compromisso em nome do outro |
| Account linking and identity collision | confirmado | Conta que já pertence a outra pessoa ou espaço é recusada e deslogada (`connect()`); convite é de uso único e amarrado ao parceiro certo |
| Stale authorization and derived copy use | confirmado | `purgeUnauthorized` com a lista de ids visíveis no servidor (lançamentos, tarefas, compromissos, remédios e doses); tokens saem da memória ao bloquear |
| API-key exposure and unsafe transport | confirmado | Só a chave anônima pública vai ao cliente; o adaptador recusa gravar sem token de usuário |
| Export and backup scope expansion / Import and restore | confirmado | Não há exportação; "Restaurar exemplo" e "Apagar dados" só existem dentro da sessão, o último com senha |

## Lembretes (Web Push)

- O conteúdo vai cifrado de ponta a ponta (RFC 8291, aes128gcm): o serviço de push do navegador (Google, Apple,
  Microsoft) não lê o texto. Assinatura VAPID (RFC 8292). Conferido em `npm run push:check` decifrando como o aparelho.
- Por padrão a tela bloqueada não mostra o nome do remédio ("Hora do seu remédio"); a pessoa liga se quiser
  (`show_details`, por aparelho). Pedido de ajuda e atraso do par seguem a mesma regra.
- Inscrições: cada pessoa lê e apaga só as próprias (RLS); gravar só pela RPC `save_push_subscription`, que exige
  https e prende a inscrição à pessoa logada. Chave privada VAPID e o registro de envios (`push_config`, `push_sent`)
  ficam sem política: o app não lê. O worker gera as chaves na primeira vez.
- O worker usa o papel próprio `ampara_worker`: lê remédios, doses, pedidos de ajuda e nomes de exibição (políticas
  `to ampara_worker`, sem BYPASSRLS) e cuida só das tabelas de push. Não lê lançamentos, ciclo, presentes nem
  check-in, e não altera nada do casal (`validate.sql`, caso 6i). No k8s a migração roda num initContainer com a
  senha de administrador; o container do worker só recebe `WORKER_DB_PASSWORD`. `push:check` roda com esse papel.
- As senhas do banco não podem ter caracteres especiais de URL (`@ / : ?`); use hex (`openssl rand -hex 24`).

## Produção (cluster)

- **Cadastro fechado:** `GOTRUE_DISABLE_SIGNUP=true`. O app é só do casal; para criar uma conta nova, libere por
  alguns minutos e feche de novo. O app mostra uma mensagem clara quando o cadastro está fechado.
- **Limite de tentativas** no gateway (`docker/nginx-prod.conf`): login, cadastro, recuperação e entrada pelo
  convite, 20 por minuto por IP (folga de 20). Ensaiado com o nginx real: 22 passam, o resto recebe 429; o uso
  normal da API não é afetado. O limite é por visitante: atrás do Cloudflare Tunnel o nginx usa o
  `CF-Connecting-IP` (que a borda da Cloudflare sempre regrava) e só confia nele vindo de endereço privado, de onde
  chega o cloudflared. Ensaiado com o nginx real: o mesmo visitante recebe 429 depois de 21 pedidos, outro
  visitante segue entrando e o log mostra o IP de verdade. Limite: quem está na rede local e acessa a porta 8217
  direto pode mandar o cabeçalho; a porta do LoadBalancer não deve ficar aberta para a internet.
  IPv4 conta por endereço e IPv6 pelo bloco /64 (a operadora entrega um /64 a cada cliente; trocar o final do
  endereço não escapa do limite). Ensaiado: 30 endereços do mesmo /64 dividem um limite, outro /64 segue livre,
  e as formas com "::" e por extenso do mesmo bloco caem na mesma conta.
- **HSTS** (`max-age=31536000`, sem `includeSubDomains`) no gateway; o navegador só aceita por HTTPS.
- **Backup diário** do banco (CronJob `ampara-backup`, 14 dias) e restauração ensaiada num banco novo
  (`npm run backup:check`). Procedimento em `docs/BACKUP.md`. Limitação: o volume do backup fica no mesmo nó.
- iPhone: só com o app na Tela de Início (iOS 16.4+). Sem a nuvem conectada não há lembrete com o app fechado.

## Limitações conhecidas (honestas)

- **Mesmo aparelho, duas pessoas:** enquanto alguém está conectado, as ferramentas de desenvolvedor do navegador
  conseguem ver os dados decifrados em memória, inclusive a aba pessoal do par. A separação forte entre os dois
  vem com cada um no próprio celular + Supabase com RLS.
- **Limite de tentativas no cliente** pode ser apagado por quem tem acesso ao armazenamento; a defesa real contra
  força bruta offline é o custo do PBKDF2 (600 mil iterações por tentativa).
- **Troca de senha** reembrulha a DEK, mas não a troca: uma cópia antiga do cofre continua abrindo com a senha
  antiga. Rotacionar a DEK exige as duas senhas.
- **Se as duas pessoas esquecerem a senha**, os dados deste aparelho não podem ser recuperados (por desenho).
- **Nuvem validada num Supabase local** (Docker com as imagens oficiais: `npm run db:check` e `npm run e2e:local`).
  No projeto de produção, rode `supabase/tests/validate.sql` no SQL Editor depois de aplicar o schema.
- **Sem realtime:** a descida acontece ao abrir, ao voltar online, ao sincronizar e a cada 30 s com o app aberto.
- `style-src 'unsafe-inline'` permanece porque o Motion anima por atributo `style`.
