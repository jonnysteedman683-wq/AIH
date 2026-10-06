#!/usr/bin/env python3
"""AIH discoverability layer builder (Enhancement 1).

Injects a managed SEO/social block into every HTML page and (re)generates
robots.txt + sitemap.xml. Idempotent: the block lives between
`<!-- SEO:AIH -->` and `<!-- /SEO:AIH -->` and is replaced on every run.
Usage:  python tools/build_seo.py
"""
import os, re, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://jonnysteedman683-wq.github.io/AIH"
OG_IMG = BASE + "/og.png"
SITE_NAME = "Artificial Intelligence Hub"
START, END = "<!-- SEO:AIH -->", "<!-- /SEO:AIH -->"
ASTART, AEND = "<!-- ANALYTICS:AIH -->", "<!-- /ANALYTICS:AIH -->"

SKIP_DIRS = {".git", "tools"}


def esc(s):
    return html.escape((s or "").strip(), quote=True)


def page_url(rel):
    if rel in ("index.html", "./index.html"):
        return BASE + "/"
    return BASE + "/" + rel


def meta_block(rel, title, desc, is_article):
    url = page_url(rel)
    tags = [
        START,
        f'<link rel="canonical" href="{url}" />',
        '<meta name="theme-color" content="#0a0e14" />',
        '<meta name="author" content="Jonny Steedman" />',
        '<meta name="robots" content="index,follow" />',
        f'<meta property="og:site_name" content="{esc(SITE_NAME)}" />',
        f'<meta property="og:type" content="{"article" if is_article else "website"}" />',
        f'<meta property="og:title" content="{esc(title)}" />',
        f'<meta property="og:description" content="{esc(desc)}" />',
        f'<meta property="og:url" content="{url}" />',
        f'<meta property="og:image" content="{OG_IMG}" />',
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        f'<meta property="og:image:alt" content="{esc(SITE_NAME)} — Everything AI. One place." />',
        f'<meta property="og:locale" content="en_AU" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        f'<meta name="twitter:title" content="{esc(title)}" />',
        f'<meta name="twitter:description" content="{esc(desc)}" />',
        f'<meta name="twitter:image" content="{OG_IMG}" />',
        '<link rel="alternate" type="application/rss+xml" title="AIH Blog" href="%s/feed.xml" />' % BASE,
    ]
    if not is_article:
        ld = (
            '{'
            '"@context":"https://schema.org",'
            '"@graph":['
            '{'
            '"@type":"Organization","@id":"%s/#org","name":"%s",'
            '"url":"%s/","logo":"%s/og.png",'
            '"description":"The one-stop shop for AI models, autonomous agents, tools, news, and related services and products.",'
            '"founder":{"@type":"Person","name":"Jonny Steedman"}'
            '},'
            '{'
            '"@type":"WebSite","@id":"%s/#site","url":"%s/","name":"%s",'
            '"publisher":{"@id":"%s/#org"},"inLanguage":"en-AU"'
            '}'
            ']}'
        ) % (BASE, SITE_NAME, BASE, BASE, BASE, BASE, SITE_NAME, BASE)
        tags.append('<script type="application/ld+json">%s</script>' % ld)
    tags.append(END)
    return "\n".join(tags) + "\n"


def page_meta(path):
    src = open(path, encoding="utf-8").read()
    t = re.search(r"<title>(.*?)</title>", src, re.S)
    d = re.search(r'<meta name="description" content="(.*?)"\s*/?>', src, re.S)
    title = t.group(1).strip() if t else SITE_NAME
    desc = d.group(1).strip() if d else ""
    if not desc:
        m = re.search(r'<p class="(?:sub|lede)"[^>]*>(.*?)</p>', src, re.S)
        if m:
            desc = re.sub(r"<[^>]+>", "", m.group(1))
    desc = re.sub(r"\s+", " ", html.unescape(desc)).strip()[:300]
    return src, title, desc


def analytics_block(rel, is_article):
    depth = rel.count("/")
    prefix = "../" * depth
    return (
        ASTART + "\n"
        '<script defer src="%sanalytics.js" data-goatcounter="" data-endpoint=""></script>\n' % prefix
        + AEND + "\n"
    )


def main():
    pages = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in sorted(filenames):
            if fn.endswith(".html"):
                pages.append(os.path.join(dirpath, fn))
    changed = []
    for p in sorted(pages):
        rel = os.path.relpath(p, ROOT).replace(os.sep, "/")
        src, title, desc = page_meta(p)
        is_article = rel.startswith("blog/post-")
        block = meta_block(rel, title, desc, is_article)
        if START in src:
            src = re.sub(re.escape(START) + r".*?" + re.escape(END) + r"\n?", "", src, flags=re.S)
        # insert after the description meta (or viewport if there's no description)
        anchor = re.search(r'<meta name="description"[^>]*>\s*\n?', src)
        if anchor:
            idx = anchor.end()
        else:
            anchor = re.search(r'<meta name="viewport"[^>]*>\s*\n?', src)
            idx = anchor.end() if anchor else src.find("<title>")
        src = src[:idx] + block + src[idx:]
        # analytics tag just before </body> (skip the operator dashboard)
        if rel != "dashboard.html":
            if ASTART in src:
                src = re.sub(re.escape(ASTART) + r".*?" + re.escape(AEND) + r"\n?", "", src, flags=re.S)
            close = src.rfind("</body>")
            if close != -1:
                src = src[:close] + analytics_block(rel, is_article) + src[close:]
        open(p, "w", encoding="utf-8", newline="\n").write(src)
        changed.append(rel)
    # robots.txt
    open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8", newline="\n").write(
        "User-agent: *\nAllow: /\nDisallow: /dashboard.html\nDisallow: /tools/\n\nSitemap: %s/sitemap.xml\n" % BASE
    )
    # sitemap.xml
    urls = [("", "1.0", "weekly"), ("blog/index.html", "0.8", "weekly")]
    for p in sorted(pages):
        rel = os.path.relpath(p, ROOT).replace(os.sep, "/")
        if rel.startswith("blog/post-"):
            urls.append((rel, "0.7", "monthly"))
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for rel, pri, freq in urls:
        loc = BASE + "/" + rel
        lines.append("  <url><loc>%s</loc><priority>%s</priority><changefreq>%s</changefreq></url>" % (loc, pri, freq))
    lines.append("</urlset>")
    open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("pages updated:", len(changed))
    for c in changed:
        print("  ", c)
    print("wrote robots.txt, sitemap.xml (%d urls)" % len(urls))


if __name__ == "__main__":
    main()