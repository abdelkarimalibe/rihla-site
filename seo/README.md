# Rihla SEO pass

One page at a time: audit it, change what needs changing (technical, text, tracking), write a changelog PDF, mark it done here, move to the next.

All 12 pages are done (2026-11-12) and were merged into `main` the same day, at the owner's request. The work was done on branch `claude/practical-keller-adcqrc`. This folder is not published with the site (see `/.vercelignore`).

## Pages

Decision 2026-11-11: wait until every page is done before anything goes live. Decision 2026-11-12: merge into `main`.

| # | Page | File | Status | Changelog |
|---|------|------|--------|-----------|
| 1 | Homepage `/` | `index.html` | **Done** 2026-11-11 | [01-home.pdf](changelogs/01-home.pdf) |
| 2 | Demo monthly report `/demo.html` | `demo.html` | **Done** 2026-11-11 | [02-demo.pdf](changelogs/02-demo.pdf) |
| 3 | Halal Visibility Check demo `/grader-demo.html` | `grader-demo.html` | **Done** 2026-11-11 | [03-grader-demo.pdf](changelogs/03-grader-demo.pdf) |
| 4 | Privacy Policy `/privacy.html` | `privacy.html` | **Done** 2026-11-11 | [04-privacy.pdf](changelogs/04-privacy.pdf) |
| 5 | Terms of Use `/terms.html` | `terms.html` | **Done** 2026-11-11 | [05-terms.pdf](changelogs/05-terms.pdf) |
| 6 | Login `/login.html` (noindex) | `login.html` | **Done** 2026-11-11 | [06-login.pdf](changelogs/06-login.pdf) |
| 7 | Register `/register.html` (noindex) | `register.html` | **Done** 2026-11-12 | [07-register.pdf](changelogs/07-register.pdf) |
| 8 | Forgot password `/forgot-password.html` (noindex) | `forgot-password.html` | **Done** 2026-11-12 | [08-forgot-password.pdf](changelogs/08-forgot-password.pdf) |
| 9 | Reset password `/reset-password.html` (noindex) | `reset-password.html` | **Done** 2026-11-12 | [09-reset-password.pdf](changelogs/09-reset-password.pdf) |
| 10 | Members Area `/members.html` (noindex) | `members.html` | **Done** 2026-11-12 | [10-members.pdf](changelogs/10-members.pdf) |
| 11 | Not found page | `404.html` | **Done** 2026-11-12 | [11-not-found.pdf](changelogs/11-not-found.pdf) |
| 12 | Sales Control Panel `/sales.html` (internal, noindex, added on `main` 2026-11-11) | `sales.html` | **Done** 2026-11-12 | [12-sales.pdf](changelogs/12-sales.pdf) |

The two files in `/emails` are Mailchimp templates, not site pages. They already carry `noindex`, so they are not in this list.

## Needs you (site-wide)

These came out of the audits and cannot be done from the repo. Details are in the changelog named.

| Priority | What | From |
|----------|------|------|
| Critical | Neither homepage form sends the lead anywhere. Submissions stay in the visitor's browser. | 01-home |
| High | QR scans only show in GA4 when the visitor accepts cookies. Count them on the server. | 01-home |
| High | Buy a real domain. `rihla-website-self.vercel.app` appears 38 times in 14 files. | 01-home |
| High | Set up Google Search Console and Bing Webmaster Tools, submit the sitemap. | 01-home |
| Medium | GA4: mark `list_signup`, `spot_claim` and `sign_up` as key events. Register custom dimensions: `cta`, `area`, `restaurant`, `first_source`, `first_medium`, `first_campaign`, `missing_path`, `came_from`. | 01-home, 07-register, 11-not-found |
| Medium | After publishing, confirm a missing address answers 404 and shows the error page. | 11-not-found |
| Medium | Publish a page per verified restaurant and per neighborhood. That is what will rank. | 01-home |
| High | The privacy policy leaves out Members Area accounts, the outside services that handle data, retention and a responsible party. | 04-privacy |
| Medium | Add a "Change my cookie choice" link to the privacy page. | 04-privacy |
| High | Terms: the yearly plan is paid upfront; say what happens if a restaurant stops. | 05-terms |
| Medium | Homepage says "One flat price" and "no 12-month contract" beside a yearly option. Founding rate ($149) is not on the site. Have the terms checked before charging. | 05-terms |
| High | Supabase: set the Site URL to the login page, and check GA4 for page addresses containing "access_token". | 06-login |
| Medium | Pin the Supabase library to one version with an integrity hash (needs open network access). | 06-login |
| High | Members Area Offers tab still says "Standard first-visit offer: 15% off", against the 2026-11-02 rule and the terms. | 10-members |
| Medium | `/sales.html` is out of search but open to anyone with the address; `sales-config.js` shows the pipeline settings. Decide whether to protect it. | 12-sales |
| Medium | Register form: decide whether it should point to, or require agreement with, the Terms and Privacy Policy. | 07-register |
| Low | `emails/README.md` still says $79/mo. | 04-privacy |
| Low | Optional: draw the wordmark as an SVG, host the fonts yourself and preload Manrope (also removes the small jump when fonts load). | 01-home, 02-demo |

## Rules every page in this pass follows

Copy
- Nothing new is claimed. Added text only repeats what the site already says.
- No store name, number, location or offer unless that store confirmed it (rule of 2026-11-02).
- Spelling stays as the site has it. The owner confirmed "Neighbourhood" stays (2026-11-11), so do not Americanize existing copy.
- Titles put the search phrase first and end with `— Rihla`.

Head
- `<html lang="en-US">`, the three icon links plus `theme-color`, as on the homepage.
- Indexable pages get the share tags with `/og-image.png` and a JSON-LD `WebPage` that points at `#website` and `#organization` on the homepage.
- Fonts: every page other than the homepage sends the same request as the homepage's first font link (`family=Amiri:wght@700&family=Manrope:wght@400;600;700`), so the files are shared from cache. The bold wordmark needs the full Amiri Bold: a cut-down bold changes its shape, and a one-letter font moves the line by 2 px.
- When a page changes, update its `lastmod` in `sitemap.xml`.

Tracking
- Before this pass only the homepage loaded Google Analytics. Each page gets the same inline tag in `<head>` as it is done, in the form Google's tools recognize.
- Each page also loads `/site.js` with `defer`. It saves the first campaign, reports `cta_click`, and shows the cookie notice on pages that have no banner of their own.
- `qr_scan` and `email_click` are not touched, so the pilot's numbers stay comparable.
- Links worth counting get a `data-cta` name, unique on the page.
- No name, email address or phone number is ever sent to GA4.
- The tag sends the page address cut off at `#` (`page_location: location.href.split('#')[0]`). Supabase links carry session tokens after the `#`. Never remove this.
- Noindex pages (the Members Area) get the tag, `site.js`, icons and fonts, but no share tags or structured data.
- Checks on sign-in pages run against `seo/tools/supabase-stub.js`, never against the live Supabase project.

Prices
- The price appears in six places: the homepage fine print, the homepage questions section, `terms.html` (text and meta description), the owner email and `sales-config.js`. When it changes, change all of them. As of 2026-11-11: $250 a month or $2,700 a year.

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
| `node seo/tools/check-page.js http://127.0.0.1:8765/demo.html` | The checks every page must pass: tag, consent, clicks, structured data, share tags, links |
| `node seo/tools/render-assets.js && python3 seo/tools/make-ico.py` | Re-renders `og-image.png` and the icons from their sources |
| `python3 seo/tools/build_changelog.py seo/changelogs/src/<page>.json` | Builds that page's changelog PDF |

Analytics requests are blocked in all three scripts, so an audit never adds traffic to GA4.
