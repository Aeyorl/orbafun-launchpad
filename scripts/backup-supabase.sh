#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
output_dir=${BACKUP_OUTPUT_DIR:-"$repo_root/output/backups"}
recipient=${BACKUP_GPG_RECIPIENT:-8E64028595F233A62435975F2D69FFA65D9ABD72}
public_key=${BACKUP_GPG_PUBLIC_KEY:-"$repo_root/.github/backup-recovery-public.asc"}

required=(POSTGRES_HOST POSTGRES_PORT POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD PGSSLROOTCERT)
for variable in "${required[@]}"; do
  [[ -n "${!variable:-}" ]] || { echo "$variable is required" >&2; exit 1; }
done

for command in pg_dump pg_restore psql tar gpg sha256sum; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }
done

[[ -f "$PGSSLROOTCERT" ]] || { echo "PGSSLROOTCERT does not exist" >&2; exit 1; }
[[ -f "$public_key" ]] || { echo "Backup public key does not exist" >&2; exit 1; }

export PGHOST=$POSTGRES_HOST
export PGPORT=$POSTGRES_PORT
export PGDATABASE=$POSTGRES_DB
export PGUSER=$POSTGRES_USER
export PGPASSWORD=$POSTGRES_PASSWORD
export PGSSLMODE=verify-full
export PGCONNECT_TIMEOUT=${PGCONNECT_TIMEOUT:-15}

work_dir=$(mktemp -d)
trap 'rm -rf -- "$work_dir"' EXIT
payload_dir="$work_dir/payload"
mkdir -p "$payload_dir/storage-files" "$output_dir"

pg_dump --format=custom --compress=6 --no-owner --no-privileges \
  --schema=public --file="$payload_dir/orba-public.dump"
pg_dump --format=custom --compress=6 --no-owner --no-privileges \
  --schema=auth --schema=storage --file="$payload_dir/supabase-managed.dump"

pg_restore --list "$payload_dir/orba-public.dump" > "$payload_dir/orba-public.catalog"
pg_restore --list "$payload_dir/supabase-managed.dump" > "$payload_dir/supabase-managed.catalog"

psql --no-psqlrc --tuples-only --no-align \
  --command="select tablename from pg_tables where schemaname='public' order by tablename;" |
while IFS= read -r table; do
  [[ "$table" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
    echo "Unsafe table identifier returned by PostgreSQL: $table" >&2
    exit 1
  }
  count=$(psql --no-psqlrc --tuples-only --no-align \
    --command="select count(*) from public.\"$table\";")
  printf '%s\t%s\n' "$table" "$count"
done > "$payload_dir/public-row-counts.tsv"

psql --no-psqlrc --tuples-only --no-align --field-separator=$'\t' \
  --command="select 'columns',count(*) from information_schema.columns where table_schema='public'
    union all select 'constraints',count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'
    union all select 'functions',count(*) from information_schema.routines where routine_schema='public'
    union all select 'indexes',count(*) from pg_indexes where schemaname='public'
    union all select 'policies',count(*) from pg_policies where schemaname='public'
    union all select 'sequences',count(*) from information_schema.sequences where sequence_schema='public'
    union all select 'triggers',count(*) from information_schema.triggers where trigger_schema='public'
    order by 1;" > "$payload_dir/public-structure.tsv"

psql --no-psqlrc --tuples-only --no-align --field-separator=$'\t' \
  --command="select 'auth_users',count(*) from auth.users
    union all select 'storage_buckets',count(*) from storage.buckets
    union all select 'storage_objects',count(*) from storage.objects
    order by 1;" > "$payload_dir/managed-row-counts.tsv"

psql --no-psqlrc --tuples-only --no-align \
  --command="select coalesce(json_agg(json_build_object('bucket_id',bucket_id,'name',name)),'[]'::json)::text from storage.objects;" \
  > "$payload_dir/storage-objects.json"

if [[ $(tr -d '[:space:]' < "$payload_dir/storage-objects.json") == '[]' ]]; then
  printf '{"exportedAt":"%s","objects":[]}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    > "$payload_dir/storage-files/manifest.json"
  echo 'Storage export: 0 objects'
else
  command -v node >/dev/null || { echo 'node is required when Storage contains objects' >&2; exit 1; }
  node "$repo_root/scripts/export-supabase-storage.mjs" \
    "$payload_dir/storage-objects.json" "$payload_dir/storage-files"
fi

(
  cd "$payload_dir"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)

if [[ ${VALIDATE_RESTORE:-0} == 1 ]]; then
  bash "$repo_root/scripts/validate-supabase-restore.sh" "$payload_dir"
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$work_dir/orba-supabase-$timestamp.tar.gz"
encrypted="$output_dir/orba-supabase-$timestamp.tar.gz.gpg"
tar --create --gzip --file="$archive" --directory="$work_dir" payload

gpg_home="$work_dir/gpg"
mkdir -m 700 "$gpg_home"
GNUPGHOME=$gpg_home gpg --batch --import "$public_key" >/dev/null 2>&1
GNUPGHOME=$gpg_home gpg --batch --yes --trust-model always \
  --recipient "$recipient" --output "$encrypted" --encrypt "$archive"
sha256sum "$encrypted" > "$encrypted.sha256"

echo "Encrypted backup: $encrypted"
echo "Checksum: $encrypted.sha256"
