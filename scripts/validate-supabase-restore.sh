#!/usr/bin/env bash
set -Eeuo pipefail

payload_dir=${1:?Usage: validate-supabase-restore.sh <backup-payload-dir>}
restore_host=${RESTORE_PGHOST:-127.0.0.1}
restore_port=${RESTORE_PGPORT:-5432}
restore_user=${RESTORE_PGUSER:-postgres}
restore_database=${RESTORE_PGDATABASE:-orba_restore_ci}

case "$restore_host" in
  127.0.0.1|localhost) ;;
  *) echo "Refusing restore against non-local host: $restore_host" >&2; exit 1 ;;
esac

if [[ ! "$restore_database" =~ ^orba_restore_[a-z0-9_]+$ ]]; then
  echo "Refusing unsafe restore database name: $restore_database" >&2
  exit 1
fi

export PGHOST=$restore_host
export PGPORT=$restore_port
export PGUSER=$restore_user
export PGPASSWORD=${RESTORE_PGPASSWORD:-}
# The restore target is constrained to localhost above. Do not carry the remote
# Supabase CA/verify-full settings into this isolated, non-TLS scratch server.
export PGSSLMODE=disable
unset PGSSLROOTCERT

for command in psql createdb dropdb pg_restore; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }
done

dropdb --if-exists --force "$restore_database"
createdb "$restore_database"

psql --dbname="$restore_database" --no-psqlrc --set=ON_ERROR_STOP=1 <<'SQL'
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
drop schema public;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'orbafun_runtime') then
    create role orbafun_runtime nologin;
  end if;
end
$$;
SQL

pg_restore \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  --dbname="$restore_database" \
  "$payload_dir/orba-public.dump"

while IFS=$'\t' read -r table expected; do
  [[ "$table" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
    echo "Unsafe table identifier in backup manifest: $table" >&2
    exit 1
  }
  actual=$(psql --dbname="$restore_database" --no-psqlrc --tuples-only --no-align \
    --command="select count(*) from public.\"$table\";")
  if [[ "$actual" != "$expected" ]]; then
    echo "Row-count mismatch for $table: expected $expected, got $actual" >&2
    exit 1
  fi
done < "$payload_dir/public-row-counts.tsv"

psql --dbname="$restore_database" --no-psqlrc --tuples-only --no-align --field-separator=$'\t' \
  --command="select 'columns',count(*) from information_schema.columns where table_schema='public'
    union all select 'constraints',count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'
    union all select 'functions',count(*) from information_schema.routines where routine_schema='public'
    union all select 'indexes',count(*) from pg_indexes where schemaname='public'
    union all select 'policies',count(*) from pg_policies where schemaname='public'
    union all select 'sequences',count(*) from information_schema.sequences where sequence_schema='public'
    union all select 'triggers',count(*) from information_schema.triggers where trigger_schema='public'
    order by 1;" > "$payload_dir/restored-structure.tsv"

diff -u "$payload_dir/public-structure.tsv" "$payload_dir/restored-structure.tsv"
pg_restore --list "$payload_dir/supabase-managed.dump" >/dev/null

dropdb --force "$restore_database"
echo "Isolated restore validation passed"
