# rihla-site

## Sales Control Panel (`/sales.html`)

Internal page, marked `noindex`. It runs entirely in the browser.

**Owner only.** The panel stays hidden until Supabase confirms the signed-in account carries `sales_admin: true` in its `app_metadata`. Only the project owner can set that mark (SQL editor or dashboard); a member cannot give it to themselves. Signed-out visitors are sent to the login page, other members see "This page is private". After logging in, the owner lands on the panel, and in that browser the landing page's Login link becomes "Sales panel". Nobody else sees that link.

What this does not hide: `sales.html`, `sales.js` and `sales-config.js` are still static files, so someone who knows the address can read the code and the fictional sample data. No real pipeline, email or calendar data is ever in those files.

- **Excel** is the pipeline. Download the template from the panel, fill in the `Deals`, `Commitments` and `Calls` sheets, import it back. The data stays in that browser's local storage and is never uploaded.
- **Gmail and Google Calendar** are read live and read-only once a Google OAuth client ID is set in `sales-config.js`. Setup steps are on the panel under "Data sources and setup".
- Stages, win chances, the 5-day cadence and the whale threshold are set in `sales-config.js`.

Never commit a real pipeline workbook to this repo: everything in it is published with the site.
