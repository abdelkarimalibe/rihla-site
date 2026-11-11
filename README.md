# rihla-site

## Sales Control Panel (`/sales.html`)

Internal page, not linked from the site and marked `noindex`. It runs entirely in the browser.

- **Excel** is the pipeline. Download the template from the panel, fill in the `Deals`, `Commitments` and `Calls` sheets, import it back. The data stays in that browser's local storage and is never uploaded.
- **Gmail and Google Calendar** are read live and read-only once a Google OAuth client ID is set in `sales-config.js`. Setup steps are on the panel under "Data sources and setup".
- Stages, win chances, the 5-day cadence and the whale threshold are set in `sales-config.js`.

Never commit a real pipeline workbook to this repo: everything in it is published with the site.
