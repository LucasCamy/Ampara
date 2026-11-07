# Backup e restauração do banco (produção)

O banco do Ampara (Postgres no cluster, PVC `ampara-db-pvc`) tem backup diário pelo CronJob `ampara-backup`.
O procedimento abaixo é ensaiado por `npm run backup:check`: faz o backup, sobe um Postgres + Auth novos e
restaura, nos dois cenários (banco sem tabelas e banco em que o backend já criou as tabelas vazias), conferindo
tabela por tabela, as políticas RLS e as senhas das contas.

## O que vai no backup

| Arquivo | Conteúdo |
|---|---|
| `app.dump` | schemas `public` (estrutura, dados, RLS, funções) e `ampara_meta` (versão do schema aplicada) |
| `auth.dump` | só os dados de `auth.users` e `auth.identities` (contas e senhas em hash); a estrutura do auth é do GoTrue |
| `SHA256SUMS` | soma de verificação dos dois arquivos |

- Quando: todo dia às 03:30 (horário de Brasília). Guarda os 14 mais recentes, em `/backup/AAAA-MM-DDTHHMMSSZ/`
  no volume `ampara-backup-pvc`.
- O conteúdo é o mesmo do banco: os dados do servidor não são cifrados de ponta a ponta (o cofre do aparelho é).
  Trate o backup como o próprio banco.
- **Limitação:** o volume usa `local-path`, no mesmo nó do banco. Protege contra erro, corrupção e exclusão,
  mas não contra perder o disco do nó. Baixe uma cópia de vez em quando (abaixo) ou mande para fora do cluster.

## Primeira vez (uma vez só)

```bash
# senha do papel restrito do worker (hex: sem caracteres especiais de URL)
kubectl -n ampara patch secret ampara-secrets --type merge -p "{\"stringData\":{\"WORKER_DB_PASSWORD\":\"$(openssl rand -hex 24)\"}}"
kubectl apply -f k8s/deploy.yaml
# conferir: o backend migra, liga o login do worker e começa os lembretes
kubectl -n ampara logs deploy/ampara-push -c migrate
kubectl -n ampara logs deploy/ampara-push
```

## Rodar um backup agora

```bash
kubectl -n ampara create job --from=cronjob/ampara-backup backup-agora-$(date +%s)
kubectl -n ampara logs -l job-name --tail=5
```

## Baixar uma cópia para o computador

```bash
kubectl -n ampara run backup-shell --image=busybox:1.36 --restart=Never --overrides='{"spec":{"containers":[{"name":"backup-shell","image":"busybox:1.36","command":["sleep","3600"],"volumeMounts":[{"name":"b","mountPath":"/backup"}]}],"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"ampara-backup-pvc"}}]}}'
kubectl -n ampara exec backup-shell -- ls /backup
kubectl -n ampara cp backup-shell:/backup/<PASTA> ./ampara-backup-<PASTA>
kubectl -n ampara delete pod backup-shell
```

## Restaurar (banco perdido ou cluster novo)

A restauração **nunca mistura dados**: se o banco tiver qualquer conta em `auth.users` ou qualquer linha nas
tabelas do app, `docker/backup/restore.sh` para sem mexer em nada. Ela aceita o banco novo sem as tabelas e o
banco em que o backend já criou as tabelas (vazias), o caso comum porque ele migra sozinho ao subir.

1. Suba o cluster como na primeira vez (segredos, `kubectl apply`). Espere o `ampara-auth` ficar pronto.
2. Copie o backup e o script para o pod do banco e rode:

```bash
DB=$(kubectl -n ampara get pod -l app=ampara-db -o name | head -1)
kubectl -n ampara cp ./ampara-backup-<PASTA> ${DB#pod/}:/tmp/restore
kubectl -n ampara cp docker/backup/restore.sh ${DB#pod/}:/tmp/restore.sh
kubectl -n ampara exec ${DB#pod/} -- sh -c 'PGHOST=localhost PGPASSWORD="$POSTGRES_PASSWORD" sh /tmp/restore.sh /tmp/restore'
```

3. Reinicie o backend (ele confere o schema, liga o login do worker e volta aos lembretes):

```bash
kubectl -n ampara rollout restart deploy/ampara-push deploy/ampara-rest
```

As contas continuam com as mesmas senhas. No app, cada um entra de novo em Ajustes › Nuvem (o aparelho guarda os
dados dele; a nuvem volta a sincronizar).

## Ensaio local

```bash
npm run db:up
npm run backup:check
```
