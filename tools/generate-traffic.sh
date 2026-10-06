#!/usr/bin/env bash
# Generate genuine traffic against the DEPLOYED site (headless Edge), so the
# collector receives fresh records to archive.
#   bash tools/generate-traffic.sh [n-pages]
set -u
N="${1:-1}"
SCR="${TMPDIR:-/tmp}/aih-traffic"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
SITE="https://jonnysteedman683-wq.github.io/AIH"

rm -rf "$SCR" 2>/dev/null || true; mkdir -p "$SCR"
SCR_W="$(cygpath -w "$SCR" | tr '\\' '/')"

for i in $(seq 1 "$N"); do
  "$EDGE" --headless=new --disable-gpu --no-first-run --hide-scrollbars \
    --window-size=1280,900 --virtual-time-budget=10000 \
    --user-data-dir="$SCR_W/p$i" \
    --dump-dom "$SITE/" > "$SCR/d$i.html" 2>/dev/null &
  PID=$!
  sleep 20
  kill "$PID" 2>/dev/null
  echo "visit $i/$N done"
done
sleep 2
echo "collector messages now: $(curl -s -m 25 "https://ntfy.sh/aih-hub-analytics-yt5df3kul6ayk2/json?poll=1&since=12h" | grep -c '"event":"message"')"