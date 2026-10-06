#!/usr/bin/env bash
# Integration check: load a real site page in headless Edge and confirm the
# analytics layer actually boots on it (API present, pageview counted, debug
# panel rendered when ?aih-analytics=1).
#   bash tools/check-integration.sh [relative-page]
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="${1:-index.html?aih-analytics=1}"
SCR="${TMPDIR:-/tmp}/aih-integration"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

rm -rf "$SCR" 2>/dev/null || true   # a previous headless run may still hold the profile
mkdir -p "$SCR"
PROFILE="$SCR/profile-$$"   # unique per run: Edge refuses a locked profile dir
REPO_W="$(cygpath -w "$REPO" | tr '\\' '/')"
SCR_W="$(cygpath -w "$SCR" | tr '\\' '/')"
OUT="$SCR/dom.html"

"$EDGE" --headless=new --disable-gpu --no-first-run --hide-scrollbars \
  --window-size=1280,900 --virtual-time-budget=9000 \
  --user-data-dir="$(cygpath -w "$PROFILE" | tr '\' '/')" \
  --dump-dom "file:///$REPO_W/$PAGE" > "$OUT" 2>/dev/null &
PID=$!

for i in $(seq 1 40); do
  sleep 2
  grep -q "aih-analytics-panel\|AIH analytics" "$OUT" 2>/dev/null && break
done
kill "$PID" 2>/dev/null

echo "page:      $PAGE"
echo "bytes:     $(wc -c < "$OUT")"
echo "panel:     $(grep -c 'aih-analytics-panel' "$OUT")  (debug panel node)"
echo "funnel:    $(grep -o 'funnel [0-9]*→[0-9]*→[0-9]*→[0-9]*' "$OUT" | head -1)"
echo "collector: $(grep -o 'collector: [^<]*' "$OUT" | head -1)"
echo "cta attrs: $(grep -c 'data-aih-cta' "$OUT")"