#!/bin/sh
# Restaura um backup do Ampara num banco NOVO (Auth já no ar). Ver docs/BACKUP.md.
# Roda dentro de um container com as ferramentas do Postgres 15 (ex.: a própria imagem supabase/postgres).
#   PGHOST, PGPASSWORD (senha do postgres; no Supabase local/k8s também é a do supabase_auth_admin)
#   uso: restore.sh <pasta com app.dump, auth.dump e SHA256SUMS>
# Aceita dois estados de banco novo:
#   - sem as tabelas do app;
#   - com as tabelas do app criadas pelo backend (que migra sozinho ao subir), mas TODAS vazias.
# Qualquer dado já existente (no app ou em auth.users) faz a restauração parar: nunca mistura dados.
set -eu
D="${1:?informe a pasta do backup}"
cd "$D"
sha256sum -c SHA256SUMS

q() { psql -U postgres -d postgres -tAc "$1"; }
u=$(q "select count(*) from auth.users")
if [ "$u" != "0" ]; then
  echo "O Auth deste banco já tem $u conta(s). Restaure num banco novo (docs/BACKUP.md)." >&2
  exit 1
fi
n=$(q "select count(*) from pg_tables where schemaname = 'public'")
rows=0
if [ "$n" != "0" ]; then
  rows=$(q "select coalesce(sum((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', tablename), false, true, '')))[1]::text::bigint), 0) from pg_tables where schemaname = 'public'")
  if [ "$rows" != "0" ]; then
    echo "Este banco já tem dados ($rows linha(s) em public). Restaure num banco novo (docs/BACKUP.md)." >&2
    exit 1
  fi
  echo "Tabelas do app já criadas pelo backend e vazias: restaurando por cima."
fi

# 0) papéis não vão no dump: o do worker precisa existir antes (grants e políticas citam ele).
#    Sem login; a etapa de migração do backend liga o login com a senha do segredo.
psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qc "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'ampara_worker') then create role ampara_worker nologin; end if; end \$\$; grant ampara_worker to postgres;"
# 1) contas (só os dados; a estrutura do auth é do próprio GoTrue)
pg_restore -U supabase_auth_admin -d postgres --data-only --exit-on-error auth.dump
# 2) app: estrutura, dados, RLS e funções. Pula só o que a imagem nova do Supabase já cria: o schema public
#    (com permissão e comentário) e os privilégios padrão do supabase_admin.
pg_restore -l app.dump | grep -v -E ' SCHEMA - public | ACL - SCHEMA public | COMMENT - SCHEMA public | DEFAULT ACL .* supabase_admin$' > /tmp/ampara-restore.list
if [ "$n" = "0" ]; then
  pg_restore -U postgres -d postgres --no-owner --exit-on-error -L /tmp/ampara-restore.list app.dump
else
  # objetos vazios do backend: troca pelos do backup (--clean só funciona quando eles existem)
  pg_restore -U postgres -d postgres --no-owner --clean --if-exists --exit-on-error -L /tmp/ampara-restore.list app.dump
fi
rm -f /tmp/ampara-restore.list
psql -U postgres -d postgres -qc "notify pgrst, 'reload schema'"
echo "Restaurado. Agora suba o backend de novo (ele confere o schema e segue)."
