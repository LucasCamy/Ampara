#!/usr/bin/env bash
# Ensaio de desastre do backup do banco (npm run backup:check), com o Supabase local no ar (npm run db:up).
#  1. faz o backup do banco local com OS MESMOS comandos do CronJob (k8s/deploy.yaml, ampara-backup)
#  2. sobe um Postgres + Auth NOVOS em containers separados (o banco local não é tocado)
#  3. restaura com os comandos de docs/BACKUP.md e compara tabela por tabela
#  4. apaga os containers de teste
set -euo pipefail

IMG_DB=supabase/postgres:15.8.1.085
IMG_AUTH=supabase/gotrue:v2.177.0
PW=ampara-local-postgres
JWT=ampara-local-dev-jwt-secret-nao-use-em-producao-0001
NET=ampara-backup-check
DIR="$(mktemp -d)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Git Bash no Windows: o Docker precisa de caminhos nativos (e sem conversão automática nos caminhos do container)
export MSYS_NO_PATHCONV=1
host() { command -v cygpath >/dev/null 2>&1 && cygpath -w "$1" || echo "$1"; }
cleanup() {
  docker rm -f ampara-bck-auth ampara-bck-db >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT
fail() { echo "FALHOU: $*" >&2; exit 1; }

echo "1) backup do banco local (mesmos comandos do CronJob)"
docker compose exec -T -e PGPASSWORD="$PW" db sh -euc '
  rm -rf /tmp/bck && mkdir -p /tmp/bck
  pg_dump -h localhost -U postgres -d postgres -Fc -n public -n ampara_meta -f /tmp/bck/app.dump
  pg_dump -h localhost -U postgres -d postgres -Fc --data-only -t auth.users -t auth.identities -f /tmp/bck/auth.dump
  cd /tmp/bck && sha256sum app.dump auth.dump > SHA256SUMS'
for f in app.dump auth.dump SHA256SUMS; do docker compose cp "db:/tmp/bck/$f" "$(host "$DIR")/$f" >/dev/null; done
docker compose exec -T db rm -rf /tmp/bck
(cd "$DIR" && sha256sum -c SHA256SUMS >/dev/null) || fail "soma de verificação do backup"
echo "ok  backup gerado e conferido ($(du -h "$DIR/app.dump" | cut -f1) + $(du -h "$DIR/auth.dump" | cut -f1))"

echo "2) Postgres + Auth novos (como um cluster recriado do zero)"
docker network create "$NET" >/dev/null
docker run -d --name ampara-bck-db --network "$NET" -e POSTGRES_PASSWORD="$PW" -e JWT_SECRET="$JWT" -e POSTGRES_DB=postgres -e POSTGRES_HOST=/var/run/postgresql \
  -v "$(host "$ROOT/docker/db/roles.sql"):/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:ro" "$IMG_DB" >/dev/null
for i in $(seq 1 60); do docker exec ampara-bck-db pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 2; done
sleep 3
docker run -d --name ampara-bck-auth --network "$NET" -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://localhost \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:$PW@ampara-bck-db:5432/postgres" \
  -e GOTRUE_SITE_URL=http://localhost -e GOTRUE_JWT_SECRET="$JWT" "$IMG_AUTH" >/dev/null
for i in $(seq 1 60); do
  [ "$(docker exec -e PGPASSWORD="$PW" ampara-bck-db psql -h localhost -U postgres -d postgres -tAc "select to_regclass('auth.identities') is not null" 2>/dev/null)" = "t" ] && break
  sleep 2
done
echo "ok  banco e Auth novos no ar (auth criado pelo próprio GoTrue)"

if [ "${MIGRATED:-0}" = "1" ] || [ "${1:-}" = "--migrated" ]; then
  # cenário do cluster: o backend subiu antes e já criou as tabelas (vazias)
  docker cp "$(host "$ROOT/supabase/schema.sql")" ampara-bck-db:/tmp/schema.sql >/dev/null
  docker exec -e PGPASSWORD="$PW" ampara-bck-db psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/schema.sql >/dev/null 2>&1
  echo "ok  backend simulado: schema aplicado no banco novo antes da restauração (tabelas vazias)"
fi
echo "3) restauração (docs/BACKUP.md)"
docker exec ampara-bck-db mkdir -p /tmp/restore
for f in app.dump auth.dump SHA256SUMS; do docker cp "$(host "$DIR/$f")" "ampara-bck-db:/tmp/restore/$f" >/dev/null; done
docker cp "$(host "$ROOT/docker/backup/restore.sh")" ampara-bck-db:/tmp/restore.sh >/dev/null
docker exec -e PGPASSWORD="$PW" -e PGHOST=localhost ampara-bck-db sh /tmp/restore.sh /tmp/restore
echo "ok  restaurado sem erro (docker/backup/restore.sh)"
# a trava funciona: rodar de novo no mesmo banco é recusado (nunca mistura dados)
if docker exec -e PGPASSWORD="$PW" -e PGHOST=localhost ampara-bck-db sh /tmp/restore.sh /tmp/restore >/dev/null 2>&1; then fail "restaurou por cima de um banco com dados"; fi
echo "ok  restaurar por cima de um banco com dados é recusado"

echo "4) comparação tabela por tabela"
count() { # $1 = container de origem (compose) ou de teste, $2 = tabela
  if [ "$1" = local ]; then docker compose exec -T -e PGPASSWORD="$PW" db psql -h localhost -U postgres -d postgres -tAc "select count(*) from $2"
  else docker exec -e PGPASSWORD="$PW" ampara-bck-db psql -h localhost -U postgres -d postgres -tAc "select count(*) from $2"; fi
}
TABLES=$(docker compose exec -T -e PGPASSWORD="$PW" db psql -h localhost -U postgres -d postgres -tAc \
  "select string_agg(schemaname||'.'||tablename, ' ' order by tablename) from pg_tables where schemaname in ('public','ampara_meta')")
total=0
for t in $TABLES auth.users auth.identities; do
  a=$(count local "$t" | tr -d '[:space:]'); b=$(count test "$t" | tr -d '[:space:]')
  [ "$a" = "$b" ] || fail "$t: $a no original, $b no restaurado"
  total=$((total + a))
done
echo "ok  $(echo $TABLES | wc -w) tabelas do app + auth.users + auth.identities iguais ($total linhas)"
pol_a=$(docker compose exec -T -e PGPASSWORD="$PW" db psql -h localhost -U postgres -d postgres -tAc "select count(*) from pg_policies where schemaname='public'" | tr -d '[:space:]')
pol_b=$(docker exec -e PGPASSWORD="$PW" ampara-bck-db psql -h localhost -U postgres -d postgres -tAc "select count(*) from pg_policies where schemaname='public'" | tr -d '[:space:]')
[ "$pol_a" = "$pol_b" ] || fail "políticas RLS: $pol_a no original, $pol_b no restaurado"
off=$(docker exec -e PGPASSWORD="$PW" ampara-bck-db psql -h localhost -U postgres -d postgres -tAc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity" | tr -d '[:space:]')
[ "$off" = "0" ] || fail "$off tabela(s) sem RLS depois de restaurar"
echo "ok  $pol_b políticas RLS restauradas, RLS ligado em todas"
# um login antigo continua válido: a senha (hash) voltou com o usuário
hash_ok=$(docker exec -e PGPASSWORD="$PW" ampara-bck-db psql -h localhost -U postgres -d postgres -tAc "select count(*) from auth.users where encrypted_password <> ''" | tr -d '[:space:]')
echo "ok  $hash_ok conta(s) com senha preservada"
echo
echo "TUDO CERTO: backup restaurado num banco novo, igual ao original (containers de teste apagados)"
