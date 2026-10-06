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

## Deployment
Hosted free on **GitHub Pages**. Push to `main` → Pages auto-updates.
To redeploy after editing:

```bash
git add -A && git commit -m "update" && git push
```
