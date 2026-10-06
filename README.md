# Artificial Intelligence Hub (AIH)

Practical AI automation for small businesses: lead follow-up, appointments, invoice/admin workflows, and custom agent systems. Projects are scoped around a real process, tested before handoff, and delivered with maintainability in mind.

Live at: **https://jonnysteedman683-wq.github.io/AIH/**

## Homepage
- **What I build** — lead follow-up, appointment workflows, invoice and intake automation
- **How it works** — free audit, scoped proposal, build/test/handoff
- **Indicative project ranges** — $1k–$3.5k starter, $3k–$15k growth build, $15k–$50k+ enterprise; managed support is scoped separately
- **Field notes** — build-in-public posts and grounded AI/agent practice
- **Get a free audit** — homepage contact form for Jonny; no online subscription checkout is offered
- **Blog newsletter** — separate signup remains available on `blog/index.html`

## Lead form
The homepage form is wired to Formspree Ajax using form ID `meaeoeav` and the `@formspree/ajax` CDN. Confirm the Formspree endpoint/account configuration before changing or testing submissions. Do not submit a test lead without approval. Analytics records only form interaction events; it must never read or transmit field values.

## Discoverability & sharing (build_seo.py)
Every page carries a managed SEO/social block (canonical, Open Graph, Twitter
large-image card, JSON-LD `Organization` + `WebSite`) between
`<!-- SEO:AIH -->` and `<!-- /SEO:AIH -->`, plus `robots.txt` and `sitemap.xml`.

After adding or editing any page — including a new blog post — regenerate it:

```bash
python tools/build_seo.py
```

It is idempotent (replaces the managed block). The social share image is
`og.png` (1200×630), rendered from source art in `tools/og-card.html`.

## Conversion instrumentation (analytics.js)
Privacy-first, dependency-free, cookieless. No form field values are ever read or
sent, and Do Not Track / Global Privacy Control switch all sending off.

Captured automatically: `pageview`, `scroll_25/50/75/100`, `cta_click` (any `.btn`,
nav link or `[data-aih-cta]`), `outbound`, `form_start`, `form_submit_attempt`,
`form_submit` (only when Formspree confirms), `time_on_page`.

- Live in-page panel: append `?aih-analytics=1` to any page.
- Console API: `AIH.analytics.track() / funnel() / summary() / events() / csv()`.
- Operator dashboard: `dashboard.html` (noindex) — funnel, KPIs, breakdowns, CSV export.
- Records buffer in `localStorage` under `aih:analytics:v1`, so nothing is lost before
  a collector exists.

### Collector: on by default, free, no account
`analytics.config.json` is the single source of truth — `tools/build_seo.py` injects its
values into every page. It ships pointed at **ntfy.sh** (free, no signup, no keys): every
pageview, CTA click, form step and conversion is published to a private-ish topic that the
dashboard reads back and aggregates site-wide — so numbers are real across all visitors,
not just your browser. ntfy keeps ~12h, so the panel shows a trailing window.

Records are sent **once**: each record carries `n`, a per-browser sequence, and only
records above the sent watermark are transmitted (identity = `session + n`). The payload is
`{site, sent, collector, records[]}`, sent with `sendBeacon` and a CORS-safelisted
`text/plain` body so no preflight can silently drop it.

Swap the collector by editing that one file:
- **Permanent history, also free:** create a GoatCounter code and set `"goatcounter": "yourcode"`.
- **Your own store:** set `"endpoint"` to any URL accepting a JSON POST (Cloudflare Worker,
  Vercel function, Google Apps Script → Sheet) and `"collector": "generic"`.
- **Off:** set `"endpoint": ""` → local buffer only.

### Permanent history, no signup (analytics-archive Action)
The free collector retains ~12h, so `.github/workflows/analytics-archive.yml` harvests the
trailing window every 20 minutes into the repo itself:

```bash
python tools/archive_collector.py            # harvest now (same code the Action runs)
python tools/archive_collector.py --check    # report only, write nothing
```

It appends new records to `analytics/history.ndjson` (deduped on `session + n`) and rebuilds
`analytics/rollup.json` — all-time funnel, per-UTC-day rows, top pages/CTAs/referrers. Files
are rewritten **only when records are new**, so a quiet site produces no commits and no Pages
churn. The dashboard's "All-time history" panel reads that rollup, so history survives the
collector's retention window. Public repo ⇒ Actions minutes are free.

## Tests
```bash
bash tools/run-analytics-test.sh      # 28 assertions against analytics.js in headless Edge
bash tools/check-integration.sh       # confirms analytics boots on a real page
bash tools/check-collector.sh         # end-to-end: real browser -> collector -> dashboard
```
All three read the site over `file://` or a local HTTP server in headless Edge — no
external test runner needed. `check-collector.sh` publishes genuine test pageviews to the
live topic and asserts they come back parsed, PII-free and non-duplicated.

## Deployment
Hosted free on **GitHub Pages**. Push to `main` → Pages auto-updates.
To redeploy after editing:

```bash
git add -A && git commit -m "update" && git push
```
