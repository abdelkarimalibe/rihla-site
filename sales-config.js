// Rihla Sales Control Panel configuration.
// Everything here is safe to ship in front-end code. A Google OAuth client ID
// is public by design. Never put a client secret, API key or password here.

// Paste your Google OAuth client ID (Web application) to turn on live Gmail
// and Google Calendar. Setup steps are on the panel under "Data sources".
// Leave empty to run on the Excel workbook only.
var SALES_GOOGLE_CLIENT_ID = '';

// Read-only scopes. The panel never sends, edits or deletes anything.
var SALES_GOOGLE_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events.readonly';

// Who the panel greets.
var SALES_OWNER_NAME = 'Abdelkarim';

// Pipeline stages, in order, with the chance each one ends up paying.
// "open: true" stages count toward the forecast and the stale check.
var SALES_STAGES = [
  { key: 'lead',   label: 'Lead',         weight: 0.10, open: true  },
  { key: 'booked', label: 'Check booked', weight: 0.25, open: true  },
  { key: 'graded', label: 'Graded',       weight: 0.45, open: true  },
  { key: 'trial',  label: 'Free trial',   weight: 0.70, open: true  },
  { key: 'paying', label: 'Paying',       weight: 1.00, open: false },
  { key: 'lost',   label: 'Lost',         weight: 0.00, open: false }
];

var SALES_CADENCE_DAYS = 5;      // a deal is stale after this many days with no touch
var SALES_MONTHLY_PRICE = 79;    // flat price per restaurant, per month
var SALES_WHALE_MONTHLY = 237;   // deals at or above this monthly value are whales (3+ locations)
var SALES_TRIAL_WARN_DAYS = 7;   // show free trials ending within this many days

// Excel reader/writer, loaded only when you import or export a workbook.
var SALES_XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
