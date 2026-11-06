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
   check-in, "o que me acalma", fazer junto e caixinhas).
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
- O backup carrega a sessão da nuvem cifrada (refresh token). Quem tiver o arquivo e a senha entra na conta: guarde
  o arquivo como guardaria a senha.

## Mapeamento das classes da skill

| Classe (nome na skill) | Estado | Onde |
|---|---|---|
| Session fixation and invalidation | confirmado | `lock()`, `changeMyPassword()` e `wipeDevice()` apagam a sessão lembrada e avisam outras abas (`src/auth/session.ts`); E2E "bloquear em uma aba bloqueia as outras" |
| Password reset and broader recovery | confirmado | `reinvite()` exige senha de quem gera e invalida o acesso antigo (`src/auth/vault.ts`, teste "recuperação de acesso pelo par") |
| Step-up binding and bypass | confirmado | Apagar dados, trocar senha e gerar convite pedem a senha de novo; trocar de perspectiva pede a senha da outra pessoa |
| Browser-storage disclosure and stale authorization | confirmado | Nada em texto claro no `localStorage` (E2E verifica que não aparecem "Venvanse", "Supermercado" nem a senha); a chave antiga em texto claro é migrada e apagada |
| Cross-context storage and broadcast confusion | confirmado | `storage` recarrega dados novos; `rev` incrementa a cada gravação; bloqueio chega a todas as abas |
| Service-worker cache and identity confusion | confirmado | `public/sw.js` só guarda arquivos estáticos do mesmo domínio; nenhum dado pessoal passa por resposta HTTP |
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
