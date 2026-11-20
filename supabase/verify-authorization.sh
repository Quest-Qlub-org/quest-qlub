#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?Set PGHOST to an approved database host or local socket directory}"
: "${PGDATABASE:?Set PGDATABASE for the approved database}"
: "${PGUSER:?Set PGUSER to the database verification role}"

export LC_ALL=C
export PGCLIENTENCODING=UTF8
export PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c default_transaction_read_only=on"
supabase_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
psql_read_only=(psql -X -w -qAt -v ON_ERROR_STOP=1)
status=0

expected_versions="$(
  for file in "$supabase_dir"/migrations/[0-9]*_*.sql; do
    filename="${file##*/}"
    printf '%s\n' "${filename%%_*}"
  done | sort
)"

history_query='SELECT version FROM supabase_migrations.schema_migrations ORDER BY version COLLATE "C"'
if actual_versions="$("${psql_read_only[@]}" -c "$history_query")"; then
  diff -u --label 'Repository migration versions' --label 'Applied migration versions' \
    <(printf '%s\n' "$expected_versions") <(printf '%s\n' "$actual_versions") || status=1
else
  printf '%s\n' 'Could not read the applied migration history.' >&2
  status=1
fi

if actual_catalog="$("${psql_read_only[@]}" -f "$supabase_dir/authorization/catalog.sql")"; then
  diff -u --label 'Expected authorization' --label 'Effective authorization' \
    "$supabase_dir/authorization/expected.jsonl" <(printf '%s\n' "$actual_catalog") || status=1
else
  printf '%s\n' 'Could not read the effective authorization catalog.' >&2
  status=1
fi

if (( status == 0 )); then
  printf '%s\n' 'Migration history and effective authorization match.'
fi
exit "$status"
