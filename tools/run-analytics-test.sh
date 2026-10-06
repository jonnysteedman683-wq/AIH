#!/usr/bin/env bash
# Run the AIH analytics self-test in headless Edge and print the assertions.
#   bash tools/run-analytics-test.sh
# Headless Edge writes the DOM dump then keeps running, so we poll for the file
# and kill the process by PID afterwards (never kill every msedge.exe — that is
# the user's browser).
#
# Notes:
#  - Edge is a NATIVE program: MSYS paths like /tmp/x are not translated for it,
#    so every path handed to Edge is converted with cygpath first.
#  - Headless Edge writes the DOM dump and then keeps running, so we poll for the
#    file and kill only our own PID (never every msedge.exe — that is the user's
#    browser).
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SCR="${TMPDIR:-/tmp}/aih-analytics-test"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

rm -rf "$SCR" 2>/dev/null || true   # a previous headless run may still hold the profile
mkdir -p "$SCR"
PROFILE="$SCR/profile-$$"   # unique per run: Edge refuses a locked profile dir
REPO_W="$(cygpath -w "$REPO" | tr '\\' '/')"
SCR_W="$(cygpath -w "$SCR" | tr '\\' '/')"
OUT="$SCR/dom.html"

"$EDGE" --headless=new --disable-gpu --no-first-run --hide-scrollbars \
  --window-size=1200,900 --virtual-time-budget=9000 \
  --user-data-dir="$(cygpath -w "$PROFILE" | tr '\' '/')" \
  --dump-dom "file:///$REPO_W/tools/analytics-test.html" > "$OUT" 2>/dev/null &
PID=$!

for i in $(seq 1 45); do
  sleep 2
  if grep -q "TESTSUITE|" "$OUT" 2>/dev/null; then break; fi
done
kill "$PID" 2>/dev/null

echo "=== RESULT ==="
grep -o 'TESTSUITE|pass=[0-9]*|fail=[0-9]*' "$OUT" || echo "no test suite output (see $OUT)"
grep -o 'ASSERT|[^<]*' "$OUT" | grep -v '^ASSERT|"'
echo "=== BUFFER ==="
grep -o 'BUFFER|{[^<]*' "$OUT" | head -1