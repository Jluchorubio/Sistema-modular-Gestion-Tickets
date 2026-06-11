#!/bin/sh
set -e

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/migrations}"

if [ -d "$MIGRATIONS_DIR" ] && [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Running pending migrations from $MIGRATIONS_DIR"

  psql "$DATABASE_URL" -c "
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  " 2>/dev/null || true

  for f in $(ls "$MIGRATIONS_DIR"/[0-9]*.sql 2>/dev/null | sort); do
    name=$(basename "$f")
    applied=$(psql "$DATABASE_URL" -tAc \
      "SELECT 1 FROM public.schema_migrations WHERE filename='$name'" 2>/dev/null || echo "")
    if [ "$applied" = "1" ]; then
      echo "[migrate] skip  $name"
    else
      echo "[migrate] apply $name ..."
      if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; then
        psql "$DATABASE_URL" -c \
          "INSERT INTO public.schema_migrations (filename) VALUES ('$name');"
        echo "[migrate] done  $name"
      else
        echo "[migrate] FAILED $name — aborting startup"
        exit 1
      fi
    fi
  done

  echo "[entrypoint] Migrations complete."
else
  echo "[entrypoint] No migrations dir or DATABASE_URL — skipping."
fi

exec "$@"
