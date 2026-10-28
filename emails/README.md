# Rihla emails

Two Mailchimp templates. One shape: big type, one image or one grade, short copy, one CTA. The navy and gold frame and the ر mark stay on every email.

| File | Audience | Hero | CTA | UTM campaign |
|---|---|---|---|---|
| `diner-first-visit.html` | Diners on the list | "Hand-checked halal. 15% off." plus the dish | Show this screen, link to the spot card | `diner_first_visit` |
| `owner-halal-check.html` | Restaurant owners | Their Halal Visibility grade plus 3 fixes | Book a free check | `owner_halal_check` |

## Setup in Mailchimp
1. Campaign, Code your own, Paste in code. Paste the file.
2. Add the audience merge fields each template's top comment lists (`SPOT_NAME`, `TIER`, `CHECK_DATE`, `GRADE`, and the rest).
3. Settings, Audience, Required footer: add the real postal address (`*|LIST:ADDRESSLINE|*`). US law (CAN-SPAM) requires it.
4. Send a test to Gmail and an iPhone before every send.

## Rules
- **Truth.** Tier, check date and grade come from a check that was actually done. Never type them by hand. Never send Demo Diner sample data as a real grade.
- **Faceless.** The dish photo is hands plus plate, no face. 1200x900 JPG at `/emails/img/dish.jpg`, then swap the placeholder block (instructions are in the file).
- **One CTA.** No second button. No nav bar.
- **Making it.** To make a new one, give Claude the template and one prompt ("diner email for Kunafa Bites, Hand-Checked, checked June 2026"). It changes the copy and fields, never the frame.

## Measuring
Links carry `utm_source=mailchimp&utm_medium=email`, and the site saves them for first-touch attribution. Diner links use `?spot=<slug>`. These log as `email_click` in GA, not `qr_scan`, so the scan count stays QR-only.

Weekly check: time spent, QR scans, email clicks, paying ($79/mo) customers.
