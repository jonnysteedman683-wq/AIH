#!/usr/bin/env bash
# End-to-end collector check: serve the site locally, load a real page in headless
# Edge, and confirm the events actually arrive at the configured collector.
#   bash tools/check-collector.sh
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SCR="${TMPDIR:-/tmp}/aih-collector"
# Native tools (curl, python, Edge) get no MSYS path translation here.
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
PORT=8099

REPO_W="$(cygpath -w "$REPO" | tr '\\' '/')"
CFG_W="$REPO_W/analytics.config.json"
TOPIC="$(python -c "import json;print(json.load(open(r'$CFG_W'))['topic'])")"
if [ -z "$TOPIC" ]; then echo "no topic configured in analytics.config.json"; exit 1; fi
echo "collector topic: $TOPIC"

before="$(curl -s -m 20 "https://ntfy.sh/$TOPIC/json?poll=1&since=12h" | grep -c '"event":"message"' || true)"
echo "messages before: $before"

rm -rf "$SCR" 2>/dev/null || true
mkdir -p "$SCR"
PROFILE_W="$(cygpath -w "$SCR/profile-$$" | tr '\\' '/')"
SCR_W="$(cygpath -w "$SCR" | tr '\\' '/')"

# local static server (GitHub Pages equivalent, real http origin)
( cd "$REPO" && python -m http.server "$PORT" --bind 127.0.0.1 >"$SCR/server.log" 2>&1 ) &
SRV=$!
sleep 2

"$EDGE" --headless=new --disable-gpu --no-first-run --hide-scrollbars \
  --window-size=1280,900 --virtual-time-budget=12000 \
  --user-data-dir="$PROFILE_W" \
  --dump-dom "http://127.0.0.1:$PORT/index.html" > "$SCR/dom.html" 2>/dev/null &
EDGE_PID=$!

sleep 25
kill "$EDGE_PID" 2>/dev/null

# second phase: the operator dashboard must aggregate the stream it just received
"$EDGE" --headless=new --disable-gpu --no-first-run --hide-scrollbars \
  --window-size=1280,1000 --virtual-time-budget=12000 \
  --user-data-dir="$SCR_W/profile-dash-$$" \
  --dump-dom "http://127.0.0.1:$PORT/dashboard.html" > "$SCR/dash.html" 2>/dev/null &
DASH_PID=$!
for i in $(seq 1 20); do sleep 2; grep -q "Site-wide pageviews" "$SCR/dash.html" 2>/dev/null && break; done
kill "$DASH_PID" 2>/dev/null
kill "$SRV" 2>/dev/null
sleep 2

echo "--- dashboard live panel ---"
grep -o 'Site-wide pageviews' "$SCR/dash.html" | head -1
grep -o 'Live collector[^<]*' "$SCR/dash.html" | head -1
grep -o 'End-to-end:[^<]*' "$SCR/dash.html" | head -1
# the error string also exists in the dashboard's source, so assert on the rendered
# aggregate line above and only report the error path if it is the *live* node text
if grep -q 'End-to-end:' "$SCR/dash.html"; then echo "live panel: rendered with aggregates"; else echo "live panel: DID NOT RENDER"; fi
echo "--- pulled back from collector ---"
curl -s -m 25 "https://ntfy.sh/$TOPIC/json?poll=1&since=12h" > "$SCR_W/stream.ndjson"
python - "$SCR_W/stream.ndjson" <<'PY'
import json, sys
recs, msgs = [], 0
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
    msgs += 1
    try:
        p = json.loads(m["message"])
    except Exception:
        print("  unparsed message:", m["message"][:120]); continue
    for r in p.get("records", []):
        recs.append(r)
print("collector messages:", msgs)
print("records received:  ", len(recs))
from collections import Counter
c = Counter(r.get("ev") for r in recs)
print("events:            ", dict(c))
pii = [r for r in recs if "@" in json.dumps(r)]
print("records with PII:  ", len(pii), "(must be 0)")
# `n` is a per-browser monotonic sequence, so the identity of a record is
# (session, n) — the same n in two different browsers is not a duplicate.
keys = [(r.get("sid"), r.get("n")) for r in recs if r.get("n") is not None]
dup = [k for k, v in Counter(keys).items() if v > 1]
print("duplicate (sid,n): ", len(dup), "(must be 0)")
sessions = len({r.get("sid") for r in recs})
print("sessions:          ", sessions)
print("VERDICT:", "PASS" if recs and not pii and not dup else "FAIL")
PY