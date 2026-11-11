# Rihla SEO pass

One page at a time: audit it, change what needs changing (technical, text, tracking), write a changelog PDF, mark it done here, move to the next.

Everything is on branch `claude/practical-keller-adcqrc`. Nothing is live until that branch is merged. This folder is not published with the site (see `/.vercelignore`).

## Pages

| # | Page | File | Status | Changelog |
|---|------|------|--------|-----------|
| 1 | Homepage `/` | `index.html` | **Done** 2026-11-11 | [01-home.pdf](changelogs/01-home.pdf) |
| 2 | Demo monthly report `/demo.html` | `demo.html` | To do | |
| 3 | Halal Visibility Check demo `/grader-demo.html` | `grader-demo.html` | To do | |
| 4 | Privacy Policy `/privacy.html` | `privacy.html` | To do | |
| 5 | Terms of Use `/terms.html` | `terms.html` | To do | |
| 6 | Login `/login.html` (noindex) | `login.html` | To do | |
| 7 | Register `/register.html` (noindex) | `register.html` | To do | |
| 8 | Forgot password `/forgot-password.html` (noindex) | `forgot-password.html` | To do | |
| 9 | Reset password `/reset-password.html` (noindex) | `reset-password.html` | To do | |
| 10 | Members Area `/members.html` (noindex) | `members.html` | To do | |
| 11 | Not found page | `404.html` | To do | |

The two files in `/emails` are Mailchimp templates, not site pages. They already carry `noindex`, so they are not in this list.

## Needs you (site-wide)

These came out of the audits and cannot be done from the repo. Details are in the changelog named.

| Priority | What | From |
|----------|------|------|
| Critical | Neither homepage form sends the lead anywhere. Submissions stay in the visitor's browser. | 01-home |
| High | QR scans only show in GA4 when the visitor accepts cookies. Count them on the server. | 01-home |
| High | Buy a real domain. `rihla-website-self.vercel.app` appears 38 times in 14 files. | 01-home |
| High | Set up Google Search Console and Bing Webmaster Tools, submit the sitemap. | 01-home |
| Medium | GA4: mark `list_signup` and `spot_claim` as key events, register the custom dimensions. | 01-home |
| Medium | Publish a page per verified restaurant and per neighborhood. That is what will rank. | 01-home |
| Low | Optional: draw the wordmark as an SVG, host the fonts yourself. | 01-home |

## Rules every page in this pass follows

Copy
- Nothing new is claimed. Added text only repeats what the site already says.
- No store name, number, location or offer unless that store confirmed it (rule of 2026-11-02).
- US spelling. Titles put the search phrase first and end with `— Rihla`.

Head
- `<html lang="en-US">`, the three icon links plus `theme-color`, as on the homepage.
- Indexable pages get the share tags with `/og-image.png` and a JSON-LD `WebPage` that points at `#website` and `#organization` on the homepage.
- Fonts: the bold wordmark (the full Arabic word, on the homepage and the 404 page) needs the full Amiri Bold. A cut-down bold changes its shape. A single ر on its own can use a one-letter font (`&text=%D8%B1`). Check the screenshots match before keeping it.
- When a page changes, update its `lastmod` in `sitemap.xml`.

Tracking
- Only the homepage loads Google Analytics today, so visits to every other page are invisible. Each page gets the same tag as it is done.
- The homepage tag stays inline and unmodified in `<head>`, in the form Google's tools recognize.
- `qr_scan` and `email_click` are not touched, so the pilot's numbers stay comparable.
- Links worth counting get a `data-cta` name and report `cta_click`.
- No name, email address or phone number is ever sent to GA4.

Noted for later pages
- `members.html` and the diner email template still say "15% off", which the public site dropped on 2026-11-02.
- The Arabic mark in the nav has `lang="ar"` on some pages and not on others.

## Tools

Run from the repo root. They need the Node and Python that ship with the Claude Code cloud environment (Playwright, reportlab, Pillow).

| Command | What it does |
|---------|--------------|
| `python3 -m http.server 8765 --bind 127.0.0.1` | Serves the site locally for the two scripts below |
| `node seo/tools/audit.js http://127.0.0.1:8765/ <out-dir> <label>` | On-page audit in headless Chrome: tags, headings, links, tap targets, requests, screenshots |
| `node seo/tools/perf.js http://127.0.0.1:8765/ 5` | Speed test on an emulated mid-range phone, median of 5 runs |
| `node seo/tools/render-assets.js && python3 seo/tools/make-ico.py` | Re-renders `og-image.png` and the icons from their sources |
| `python3 seo/tools/build_changelog.py seo/changelogs/src/<page>.json` | Builds that page's changelog PDF |

Analytics requests are blocked in both scripts, so an audit never adds traffic to GA4.
