#!/usr/bin/env bash
# Prove the DEPLOYED site publishes to the live collector: load the public
# GitHub Pages URL in headless Edge, then read the collector back.
#   bash tools/check-live.sh
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SCR="${TMPDIR:-/tmp}/aih-live"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
SITE="https://jonnysteedman683-wq.github.io/AIH"

REPO_W="$(cygpath -w "$REPO" | tr '\\' '/')"
TOPIC="$(python -c "import json;print(json.load(open(r'$REPO_W/analytics.config.json'))['topic'])")"
rm -rf "$SCR" 2>/dev/null || true; mkdir -p "$SCR"
SCR_W="$(cygpath -w "$SCR" | tr '\\' '/')"

echo "1) waiting for Pages to serve the collector wiring..."
for i in $(seq 1 20); do
  if curl -s "$SITE/" | grep -q "ntfy.sh"; then echo "   live page carries the collector endpoint (attempt $i)"; break; fi
  sleep 15
done

before="$(curl -s -m 25 "https://ntfy.sh/$TOPIC/json?poll=1&since=12h" | grep -c '"event":"message"' || true)"
echo "2) collector messages before: $before"

"$EDGE" --headless=new --disable-gpu --no-first-run --hide-scrollbars \
  --window-size=1280,900 --virtual-time-budget=12000 \
  --user-data-dir="$SCR_W/profile-$$" \
  --dump-dom "$SITE/?aih-live-check=1" > "$SCR/dom.html" 2>/dev/null &
PID=$!
sleep 28
kill "$PID" 2>/dev/null
sleep 3

curl -s -m 25 "https://ntfy.sh/$TOPIC/json?poll=1&since=12h" > "$SCR_W/stream.ndjson"
python - "$SCR_W/stream.ndjson" "$before" <<'PY'
import json, sys
from collections import Counter
msgs, recs = [], []
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if not line:
        continue
    try:
        m = json.loads(line)
    except Exception:
        continue
    if m.get("event") != "message" or not m.get("message"):
        continue
    msgs.append(m)
    try:
        for r in json.loads(m["message"]).get("records", []):
            recs.append(r)
    except Exception:
        pass
print("3) collector messages now:  ", len(msgs), "(was %s)" % sys.argv[2])
paths = Counter(r.get("path") for r in recs)
print("4) pages seen:", dict(paths))
print("5) events:", dict(Counter(r.get("ev") for r in recs)))
print("6) PII records:", sum(1 for r in recs if "@" in json.dumps(r)))
print("VERDICT:", "PASS - deployed site publishes to the live collector" if len(msgs) > int(sys.argv[2]) else "FAIL - no new messages")
PY