#!/usr/bin/env bash
# Verify the LIVE operator dashboard renders both data sources:
# all-time history (analytics/rollup.json) and the live collector stream.
#   bash tools/check-dashboard.sh
set -u
SCR="${TMPDIR:-/tmp}/aih-dash"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
SITE="https://jonnysteedman683-wq.github.io/AIH"

rm -rf "$SCR" 2>/dev/null || true; mkdir -p "$SCR"
SCR_W="$(cygpath -w "$SCR" | tr '\\' '/' || echo "$SCR")"

"$EDGE" --headless=new --disable-gpu --no-first-run --hide-scrollbars \
  --window-size=1280,1200 --virtual-time-budget=14000 \
  --user-data-dir="$SCR_W/profile-$$" \
  --dump-dom "$SITE/dashboard.html" > "$SCR/dash.html" 2>/dev/null &
PID=$!
for i in $(seq 1 25); do
  sleep 2
  grep -q "All-time pageviews" "$SCR/dash.html" 2>/dev/null && break
done
sleep 4
kill "$PID" 2>/dev/null

echo "--- all-time panel ---"
grep -o 'All-time pageviews' "$SCR/dash.html" | head -1
grep -o '[0-9]* records · [0-9]* sessions · harvested [^<]*' "$SCR/dash.html" | head -1
grep -o 'No archive yet[^<]*' "$SCR/dash.html" | head -1
echo "--- live collector panel ---"
grep -o 'Live collector[^<]*' "$SCR/dash.html" | head -1
grep -o 'End-to-end:[^<]*' "$SCR/dash.html" | head -1
grep -o 'No events in the trailing window[^<]*' "$SCR/dash.html" | head -1
echo "--- verdict ---"
if grep -q 'records · ' "$SCR/dash.html"; then echo "PASS - all-time history rendered from analytics/rollup.json"; else echo "FAIL - archive panel did not render"; fi