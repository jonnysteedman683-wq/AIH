#!/usr/bin/env python3
"""Harvest the AIH collector stream into permanent, versioned history.

The free collector (ntfy.sh) only retains ~12h, so a scheduled GitHub Action runs
this every 20 minutes: it pulls the trailing window, appends any records it has
not already stored to analytics/history.ndjson, and rebuilds analytics/rollup.json
(per-day rollups + all-time funnel). Files are only rewritten when something
changed, so a quiet site produces no commits and no Pages churn.

    python tools/archive_collector.py            # harvest the configured topic
    python tools/archive_collector.py --check    # report only, write nothing
    python tools/archive_collector.py --stream f # parse a saved /json?poll=1 dump

Record identity is (session, n): `n` is a per-browser sequence, so the same n in
two browsers is not a duplicate.
"""
import argparse
import json
import os
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "analytics")
HISTORY = os.path.join(DATA_DIR, "history.ndjson")
ROLLUP = os.path.join(DATA_DIR, "rollup.json")


def config():
    try:
        with open(os.path.join(ROOT, "analytics.config.json"), encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def fetch_stream(topic, since="12h", timeout=30):
    url = "https://ntfy.sh/%s/json?poll=1&since=%s" % (topic, since)
    req = urllib.request.Request(url, headers={"User-Agent": "aih-analytics-archiver"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def parse_stream(text):
    """ndjson of ntfy events -> list of analytics records."""
    records, messages, unparsed = [], 0, 0
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            m = json.loads(line)
        except Exception:
            unparsed += 1
            continue
        if m.get("event") != "message" or not m.get("message"):
            continue
        messages += 1
        try:
            payload = json.loads(m["message"])
        except Exception:
            unparsed += 1
            continue
        for r in payload.get("records", []):
            if isinstance(r, dict) and r.get("ev"):
                records.append(r)
    return records, messages, unparsed


def load_history():
    if not os.path.exists(HISTORY):
        return []
    out = []
    with open(HISTORY, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except Exception:
                continue
    return out


def key(r):
    return "%s|%s" % (r.get("sid", ""), r.get("n", ""))


def day_of(r):
    try:
        return datetime.fromtimestamp(r["ts"] / 1000.0, timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        return "unknown"


def build_rollup(history):
    events = Counter(r.get("ev") for r in history)
    sessions = {r.get("sid") for r in history}
    days = defaultdict(lambda: {"events": Counter(), "sessions": set()})
    for r in history:
        d = days[day_of(r)]
        d["events"][r.get("ev")] += 1
        d["sessions"].add(r.get("sid"))

    def group(fn):
        c = Counter()
        for r in history:
            v = fn(r)
            if v:
                c[v] += 1
        return c.most_common(25)

    day_rows = []
    for d in sorted(days):
        e = days[d]["events"]
        day_rows.append({
            "date": d,
            "pageviews": e.get("pageview", 0),
            "cta_clicks": e.get("cta_click", 0),
            "form_starts": e.get("form_start", 0),
            "leads": e.get("form_submit", 0),
            "sessions": len(days[d]["sessions"]),
            "events": sum(e.values()),
        })

    funnel = {
        "view": events.get("pageview", 0),
        "cta": events.get("cta_click", 0),
        "start": events.get("form_start", 0),
        "submit": events.get("form_submit", 0),
    }
    funnel["rates"] = {
        "view_to_cta": round(funnel["cta"] / funnel["view"] * 100, 1) if funnel["view"] else 0,
        "cta_to_start": round(funnel["start"] / funnel["cta"] * 100, 1) if funnel["cta"] else 0,
        "start_to_submit": round(funnel["submit"] / funnel["start"] * 100, 1) if funnel["start"] else 0,
        "view_to_submit": round(funnel["submit"] / funnel["view"] * 100, 1) if funnel["view"] else 0,
    }

    return {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "records": len(history),
        "sessions": len(sessions),
        "first_record": min((r.get("ts") for r in history if r.get("ts")), default=None),
        "last_record": max((r.get("ts") for r in history if r.get("ts")), default=None),
        "events": dict(events.most_common()),
        "funnel": funnel,
        "days": day_rows,
        "pages": [{"path": k, "count": v} for k, v in group(lambda r: r.get("path") if r.get("ev") == "pageview" else None)],
        "ctas": [{"label": k, "count": v} for k, v in group(lambda r: (r.get("props") or {}).get("label") if r.get("ev") == "cta_click" else None)],
        "referrers": [{"host": k, "count": v} for k, v in group(lambda r: (r.get("ref") or "(direct)") if r.get("ev") == "pageview" else None)],
        "viewports": [{"vp": k, "count": v} for k, v in group(lambda r: r.get("vp") if r.get("ev") == "pageview" else None)],
        "outbound": [{"host": k, "count": v} for k, v in group(lambda r: (r.get("props") or {}).get("host") if r.get("ev") == "outbound" else None)],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    ap.add_argument("--stream", help="path to a saved /json?poll=1 dump (offline mode)")
    ap.add_argument("--since", default="12h")
    args = ap.parse_args()

    cfg = config()
    topic = cfg.get("topic", "")
    if not topic and not args.stream:
        print("no topic configured in analytics.config.json"); return 1
    if not topic:
        topic = "(offline)"

    if args.stream:
        with open(args.stream, encoding="utf-8") as fh:
            text = fh.read()
    else:
        try:
            text = fetch_stream(topic, args.since)
        except Exception as exc:
            print("collector fetch failed: %s: %s" % (type(exc).__name__, exc))
            return 1

    records, messages, unparsed = parse_stream(text)
    history = load_history()
    seen = {key(r) for r in history}
    fresh = [r for r in records if key(r) not in seen]

    print("topic:            %s" % topic)
    print("collector msgs:   %d (%d unparsed)" % (messages, unparsed))
    print("records in window:%d" % len(records))
    print("already archived: %d" % len(history))
    print("new records:      %d" % len(fresh))

    if args.check:
        print("check mode - nothing written")
        return 0
    if not fresh:
        print("nothing new - no files written")
        return 0

    combined = history + fresh
    combined.sort(key=lambda r: r.get("ts") or 0)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(HISTORY, "w", encoding="utf-8", newline="\n") as fh:
        for r in combined:
            fh.write(json.dumps(r, separators=(",", ":"), sort_keys=True) + "\n")

    rollup = build_rollup(combined)
    with open(ROLLUP, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(rollup, fh, indent=2, sort_keys=False)
        fh.write("\n")

    pii = sum(1 for r in combined if "@" in json.dumps(r))
    print("archived total:   %d records, %d sessions, %d PII rows (must be 0)" % (len(combined), rollup["sessions"], pii))
    print("all-time funnel:  view %d -> cta %d -> start %d -> lead %d (%.1f%% end-to-end)" % (
        rollup["funnel"]["view"], rollup["funnel"]["cta"], rollup["funnel"]["start"],
        rollup["funnel"]["submit"], rollup["funnel"]["rates"]["view_to_submit"]))
    print("wrote %s + %s" % (os.path.relpath(HISTORY, ROOT), os.path.relpath(ROLLUP, ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())