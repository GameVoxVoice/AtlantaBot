#!/usr/bin/env sh
#
# secret-guard.sh -- refuse to let a plaintext credential into this repository.
#
#   ./scripts/secret-guard.sh --staged    what is about to be committed (hook)
#   ./scripts/secret-guard.sh             what is already committed (CI)
#
# Why this exists, specifically here:
#
#   .env is TRACKED in this repo -- it carries upstream's dotenvx-encrypted
#   values -- and Docker Compose reads .env automatically. That combination
#   makes .env both the obvious place to put a bot token and the worst
#   possible one, because .gitignore cannot protect a file that is already in
#   the index. No ignore rule will ever cover it. This check is what covers it.
#
# The .env test is an allowlist, not a hunt for things that look secret: every
# value must be dotenvx-encrypted or empty, so a pasted credential fails
# whatever shape it happens to have.
#
# Values are never printed. A failure reports the variable name and line only.
# A guard that echoes the secret into a public build log has moved the problem,
# not solved it.

set -eu

MODE="${1:-tree}"
status=0

note() { printf '%s\n' "$1" >&2; }

if [ "$MODE" = "--staged" ]; then
  READ_PREFIX=":"
  WHERE="staged for commit"
else
  READ_PREFIX="HEAD:"
  WHERE="committed"
fi

# --------------------------------------------------------------------------
# 1. Every value in the tracked .env must be encrypted.
# --------------------------------------------------------------------------
env_body=$(git show "${READ_PREFIX}.env" 2>/dev/null || true)
if [ -n "$env_body" ]; then
  offenders=$(
    printf '%s\n' "$env_body" |
      grep -nE '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=' |
      grep -vE '^[0-9]+:[[:space:]]*DOTENV_PUBLIC_KEY' |
      grep -vE '=[[:space:]]*["'"'"']?encrypted:' |
      grep -vE '=[[:space:]]*("")?[[:space:]]*$' || true
  )
  if [ -n "$offenders" ]; then
    status=1
    note "FAIL: .env ($WHERE) holds a value that is not dotenvx-encrypted."
    note ""
    note "  .env is tracked, so whatever is in it is one push from being public,"
    note "  and .gitignore cannot help: ignore rules do not apply to files that"
    note "  are already in the index."
    note ""
    note "  Put secrets in .env.local, which IS ignored, and start the stack with"
    note "    docker compose --env-file .env.local up -d --build"
    note ""
    note "  Lines at fault (values withheld):"
    printf '%s\n' "$offenders" | sed -E 's/=.*/=<withheld>/; s/^/    line /' >&2
    note ""
  fi
fi

# --------------------------------------------------------------------------
# 2. The local-secret filenames must never be tracked at all.
# --------------------------------------------------------------------------
if [ "$MODE" = "--staged" ]; then
  tracked_local=$(git diff --cached --name-only -- '.env.local' '.env.*.local' '.env.keys' 2>/dev/null || true)
else
  tracked_local=$(git ls-files -- '.env.local' '.env.*.local' '.env.keys' 2>/dev/null || true)
fi
if [ -n "$tracked_local" ]; then
  status=1
  note "FAIL: a local secrets file is $WHERE:"
  printf '%s\n' "$tracked_local" | sed 's/^/    /' >&2
  note ""
  note "  These are ignored for a reason. Undo with: git rm --cached <file>"
  note ""
fi

# --------------------------------------------------------------------------
# 3. High-severity credential shapes anywhere in the tree.
#
# Deliberately narrow. A guard that cries wolf gets switched off, and checks 1
# and 2 are the ones that cover this repo's actual failure mode; this one is
# for a token pasted somewhere nobody thought to look. An intentional sample
# can opt out with a "secret-guard:allow" comment on the line.
#
# This script and the workflow that runs it are excluded from the scan, for
# the obvious reason that they contain the patterns.
# --------------------------------------------------------------------------
# Two things this block has to get right, both of which it got wrong first:
#
#   * Every option goes BEFORE the pattern, and the pattern goes after -e.
#     `git grep <pattern> --cached` is a fatal error rather than a search, and
#     a pattern starting with "-" (the PRIVATE KEY one) is read as an option.
#     Either mistake made git grep fail, and a swallowed failure looked exactly
#     like "no secrets found" -- worse than having no scan at all.
#
#   * The grep runs inline rather than inside a function called through $(...),
#     because an `exit` inside command substitution ends the subshell and the
#     script sails on regardless.
#
# So: exit 1 from git grep means no match, exit 0 means match, and anything
# else aborts the whole run instead of reporting a pass it never verified.

# Newline-separated so the loop stays in this shell and can set `status`.
# A pipe into `while` would run the body in a subshell and lose it.
OLD_IFS=$IFS
IFS='
'
for pattern in \
  '-----BEGIN [A-Z ]*PRIVATE KEY-----' \
  'AKIA[0-9A-Z]{16}' \
  'gh[pousr]_[A-Za-z0-9]{36,}' \
  '[A-Za-z0-9_-]{24,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}'
do
  set +e
  if [ "$MODE" = "--staged" ]; then
    hits=$(git grep --cached -nIE -e "$pattern" -- \
      ':!scripts/secret-guard.sh' ':!.github/workflows/secret-guard.yml' 2>&1)
  else
    hits=$(git grep -nIE -e "$pattern" HEAD -- \
      ':!scripts/secret-guard.sh' ':!.github/workflows/secret-guard.yml' 2>&1)
  fi
  rc=$?
  set -e
  if [ "$rc" -gt 1 ]; then
    note "ERROR: secret-guard could not run its scan (git grep exit $rc):"
    printf '%s\n' "$hits" | sed 's/^/    /' >&2
    note "  Refusing, rather than reporting a pass it never verified."
    exit 2
  fi
  [ "$rc" -eq 0 ] || continue
  hits=$(printf '%s\n' "$hits" | grep -v 'secret-guard:allow' || true)
  [ -n "$hits" ] || continue
  status=1
  note "FAIL: something credential-shaped is $WHERE:"
  # Keep file and line, drop the match itself.
  printf '%s\n' "$hits" |
    sed -E 's/^HEAD://; s/^([^:]+:[0-9]+):.*/    \1: <withheld>/' >&2
  note ""
  note "  If it is a placeholder, add a 'secret-guard:allow' comment on the line."
  note ""
done
IFS=$OLD_IFS

if [ "$status" -ne 0 ]; then
  note "secret-guard: refused."
  exit 1
fi

printf '%s\n' "secret-guard: clean ($WHERE)."
