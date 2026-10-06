# Artificial Intelligence Hub (AIH)

🤖 The one-stop shop for artificial intelligence, autonomous agents, tools, news, and related services & products.

Live at: **https://jonnysteedman683-wq.github.io/AIH/**

## Sections
- **Services** — AI automation agency, agent development, consulting
- **Tools & Products** — free / pro / agency tiers
- **News & Insights** — build-in-public and AI field notes
- **Get Started** — lead + newsletter capture form

## Automate the lead form
Form is client-side. To capture leads by email, get a free endpoint at
[formspree.io](https://formspree.io) (or formsubmit.co) and paste it into the
`formspreeUrl` variable in `index.html`.

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
  a collector exists. To turn on real, site-wide numbers, set `data-goatcounter="code"`
  (free, hosted) or `data-endpoint="https://…"` (any JSON POST receiver) on the
  analytics script tag — `tools/build_seo.py` writes that tag into every page.

## Tests
```bash
bash tools/run-analytics-test.sh      # 18 assertions against analytics.js in headless Edge
bash tools/check-integration.sh       # confirms analytics boots on a real page
```
Both read the page over `file://` in headless Edge — no server needed.

## Deployment
Hosted free on **GitHub Pages**. Push to `main` → Pages auto-updates.
To redeploy after editing:

```bash
git add -A && git commit -m "update" && git push
```
