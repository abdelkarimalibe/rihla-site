/* Rihla Sales Control Panel.
   Runs entirely in the browser. The pipeline lives in an Excel workbook that is
   imported and kept in this browser's localStorage. Gmail and Google Calendar
   are read live, read-only, with the signed-in user's own token; nothing read
   from Google is stored. No data is sent to any Rihla server. */
(function () {
  'use strict';

  var STAGES = SALES_STAGES;
  var CADENCE = SALES_CADENCE_DAYS;
  var DATA_KEY = 'rihla_sales_data_v1';
  var PLAN_KEY = 'rihla_sales_plan_v1';
  var TOKEN_KEY = 'rihla_sales_gtoken';
  var STAGE_COLORS = { lead: '#8A9BB0', booked: '#9DB8F2', graded: '#E8B85C', trial: '#8FD3A8', paying: '#C8943C', lost: '#F2938C' };

  /* ── Small helpers ──────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromIso(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { return iso(new Date()); }
  function addDays(s, n) { var d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); }
  function dayDiff(a, b) { return Math.round((fromIso(b) - fromIso(a)) / 864e5); }
  function fmtDay(s) { return s ? fromIso(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''; }
  function fmtLong(s) { return fromIso(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function fmtTime(d) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function money(v) {
    v = Number(v) || 0;
    if (v >= 1000) return '$' + (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return '$' + Math.round(v);
  }
  function safeUrl(u) { return /^https:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function lower(s) { return String(s || '').trim().toLowerCase(); }
  function monthEnd() { var d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
  function stageOf(d) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === d.stage) return STAGES[i];
    return STAGES[0];
  }
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.classList.remove('show'); }, 3600);
  }

  /* ── Sample data: fictional restaurants, dated relative to today ── */
  function sample() {
    var T = today();
    function at(n) { return addDays(T, n); }
    function deal(id, restaurant, contact, area, stage, locations, close, last, nextStep, extra) {
      var d = {
        id: id, restaurant: restaurant, contact: contact,
        email: lower(contact.split(' ')[0]) + '@' + lower(restaurant).replace(/[^a-z]/g, '').slice(0, 14) + '.example.com',
        phone: '(718) 555-01' + id.slice(-2), area: area, stage: stage, locations: locations,
        value: locations * SALES_MONTHLY_PRICE, close: close == null ? '' : at(close), lastTouch: at(last),
        nextStep: nextStep, nextMeeting: '', grade: '', trialEnds: '', notes: ''
      };
      for (var k in extra) d[k] = extra[k];
      return d;
    }
    var deals = [
      deal('D-001', 'Saffron Lantern Grill', 'Yusuf Demir', 'Astoria, Queens', 'lead', 1, 24, -1, 'Call to book the free check'),
      deal('D-002', 'Blue Minaret Kebab', 'Imran Sheikh', 'Jackson Heights, Queens', 'lead', 1, 28, -2, 'Call to book the free check'),
      deal('D-003', 'Crescent & Olive', 'Layla Haddad', 'Bay Ridge, Brooklyn', 'lead', 1, 35, -6, 'Second call, no answer on the first'),
      deal('D-004', 'Seven Spice Table', 'Omar Farouk', 'Harlem / Manhattan', 'lead', 1, 30, -3, 'Send the sample grade'),
      deal('D-005', 'Golden Tagine Group', 'Nadia Benali', 'Bay Ridge, Brooklyn', 'lead', 3, 19, -1, 'Intro call, three locations', { nextMeeting: T + 'T10:30' }),
      deal('D-006', 'Karahi Corner', 'Bilal Chaudhry', 'Jackson Heights, Queens', 'booked', 1, 18, -2, 'Check visit on Friday'),
      deal('D-007', 'Sumac Street Shawarma', 'Tariq Aziz', 'Astoria, Queens', 'booked', 1, 20, -7, 'Rebook the check visit'),
      deal('D-008', 'Noor & Nile Bakery', 'Aisha Karim', 'Fordham / Bronx', 'booked', 1, 16, -1, 'Confirm check visit time'),
      deal('D-009', 'Anatolia Pide Bar', 'Emre Yildiz', 'Astoria, Queens', 'booked', 1, 17, -4, 'Check visit next week'),
      deal('D-010', 'Lantern Lahore', 'Hamza Qureshi', 'Jackson Heights, Queens', 'graded', 1, 9, -3, 'Grade call, asked how the offer works', { grade: 'C', nextMeeting: T + 'T12:00' }),
      deal('D-011', 'Cedar Charcoal', 'Rami Khoury', 'Bay Ridge, Brooklyn', 'graded', 1, 12, -8, 'Waiting on supplier invoice', { grade: 'D' }),
      deal('D-012', 'Twin Bridges Smokehouse', 'Dawud Johnson', 'Harlem / Manhattan', 'graded', 2, 10, -2, 'Review verified page draft', { grade: 'B' }),
      deal('D-013', 'Atlas Souk Kitchens', 'Samir El Idrissi', 'Astoria, Queens', 'graded', 5, 14, -9, 'Owner wants partner sign-off', { grade: 'C' }),
      deal('D-014', 'Medina Table Group', 'Fatima Rahman', 'Jackson Heights, Queens', 'trial', 4, 3, -6, 'Wants per-location numbers', { trialEnds: at(3), nextMeeting: T + 'T15:00' }),
      deal('D-015', 'Khyber Ember Grill', 'Zain Afridi', 'Fordham / Bronx', 'trial', 1, 6, -1, 'Drop off second QR card', { trialEnds: at(6) }),
      deal('D-016', 'Bosphorus Blue', 'Selin Kaya', 'Astoria, Queens', 'trial', 1, 16, -4, 'Week 2 check-in', { trialEnds: at(16) }),
      deal('D-017', "Mama Zainab's Kitchen", 'Zainab Osei', 'Harlem / Manhattan', 'trial', 1, 1, -2, 'Decision call', { trialEnds: at(1) }),
      deal('P-001', 'Olive Branch Deli', 'Khalid Mansour', 'Bay Ridge, Brooklyn', 'paying', 1, null, -12, 'Monthly report review', { nextMeeting: T + 'T16:30' }),
      deal('P-002', 'Tandoor Lane', 'Sana Mirza', 'Jackson Heights, Queens', 'paying', 1, null, -9, 'Monthly report'),
      deal('P-003', 'Demo Diner', 'Adam Malik', 'Astoria, Queens', 'paying', 1, null, -15, 'Monthly report')
    ];
    function com(id, promise, dealId, due, source) {
      var d = deals.filter(function (x) { return x.id === dealId; })[0];
      return { id: id, promise: promise, owedTo: d.contact, dealId: dealId, due: at(due), source: source, link: '', doneOn: '' };
    }
    return {
      sample: true, file: '',
      deals: deals,
      commitments: [
        com('C-001', 'Send grade report with the three fixes', 'D-010', -2, 'Email'),
        com('C-002', 'Re-send the supplier invoice checklist', 'D-011', -1, 'Call'),
        com('C-003', 'Send sample monthly report', 'D-005', 0, 'Email'),
        com('C-004', 'Confirm check visit time', 'D-008', 0, 'Call'),
        com('C-005', 'Drop off QR card and window sticker', 'D-015', 1, 'Call'),
        com('C-006', 'Send 30-day report preview', 'D-014', 2, 'Email'),
        com('C-007', 'Share verified page draft', 'D-012', 3, 'Email'),
        com('C-008', 'Send this month\'s report', 'P-001', 4, 'Call')
      ],
      calls: [
        { date: at(-3), dealId: 'D-010', link: '', summary: 'Check done in person. Certificate is on the wall but nowhere online, and halal is only mentioned in reviews. Hamza wants to see the grade before deciding. He asked how the first-visit offer works and was told the offer is his to set.' },
        { date: at(-6), dealId: 'D-014', link: '', summary: 'Week 3 of the trial across four locations. Fatima likes the scan counts at two sites; the other two keep the card behind the register. She wants per-location numbers before committing.' },
        { date: at(-1), dealId: 'D-005', link: '', summary: 'First call. Three locations in Bay Ridge. Nadia asked what the monthly report shows and wants to see a sample before a visit.' },
        { date: at(-12), dealId: 'P-001', link: '', summary: 'Monthly check-in. Khalid is happy with the scans and moved the card next to the till. Open to introducing the owner next door.' }
      ],
      mail: {
        'D-010': [
          { dir: 'RECEIVED', subject: 'Re: Your halal visibility check', snippet: 'Thanks for coming by. When do I get the grade, and what does the card on the counter cost?', ts: Date.now() - 864e5 },
          { dir: 'SENT', subject: 'Your halal visibility check', snippet: 'Good to meet you today. I will send the grade report with the three fixes this week.', ts: Date.now() - 3 * 864e5 }
        ],
        'D-014': [
          { dir: 'RECEIVED', subject: 'Numbers per location?', snippet: 'Can you split the scans by location before we talk on the 30 days?', ts: Date.now() - 2 * 864e5 }
        ]
      }
    };
  }

  /* ── State ──────────────────────────────────────── */
  var S = loadData();
  var P = loadPlan();
  var G = { token: '', me: '', events: null, mail: {}, last: {}, detected: [], busy: false, error: '' };
  var UI = { openMtg: null, openStage: '', showDone: false, notice: '' };

  function loadData() {
    try {
      var raw = JSON.parse(localStorage.getItem(DATA_KEY) || 'null');
      if (raw && Array.isArray(raw.deals) && raw.deals.length) {
        raw.sample = false;
        raw.commitments = raw.commitments || [];
        raw.calls = raw.calls || [];
        raw.mail = {};
        return raw;
      }
    } catch (_) {}
    return sample();
  }
  function saveData() {
    if (S.sample) return;
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify({ deals: S.deals, commitments: S.commitments, calls: S.calls, file: S.file }));
    } catch (_) { toast('Could not save in this browser. Export the workbook to keep your changes.'); }
  }
  function loadPlan() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null'); } catch (_) {}
    if (!p || typeof p !== 'object') p = {};
    p.done = p.done || {}; p.manual = p.manual || []; p.det = p.det || {};
    if (p.date !== today()) {
      // New day: finished manual tasks drop off, unfinished ones carry over.
      p.date = today(); p.done = {};
      p.manual = p.manual.filter(function (t) { return !t.done; });
    }
    return p;
  }
  function savePlan() { try { localStorage.setItem(PLAN_KEY, JSON.stringify(P)); } catch (_) {} }

  /* ── Derived data ───────────────────────────────── */
  function dealById(id) { return S.deals.filter(function (d) { return d.id === id; })[0] || null; }
  function who(d) { return d.contact && d.restaurant ? d.contact + ' (' + d.restaurant + ')' : (d.contact || d.restaurant); }
  function isWhale(d) { return Number(d.value) >= SALES_WHALE_MONTHLY; }
  function openDeals() { return S.deals.filter(function (d) { return stageOf(d).open; }); }
  function lastTouch(d) {
    var g = d.email ? G.last[lower(d.email)] : '';
    return g && (!d.lastTouch || g > d.lastTouch) ? g : d.lastTouch;
  }
  function daysQuiet(d) { var l = lastTouch(d); return l ? dayDiff(l, today()) : 0; }
  function staleDeals() {
    return openDeals().filter(function (d) { return lastTouch(d) && daysQuiet(d) > CADENCE; })
      .sort(function (a, b) { return daysQuiet(b) * b.value - daysQuiet(a) * a.value; });
  }
  function allComs() { return S.commitments.concat(G.detected); }
  function comDone(c) { return c.doneOn || P.det[c.id] || ''; }
  function openComs() {
    return allComs().filter(function (c) { return !comDone(c); })
      .sort(function (a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; });
  }
  function weighted(d) { return (Number(d.value) || 0) * stageOf(d).weight; }
  function sum(list, fn) { return list.reduce(function (t, x) { return t + fn(x); }, 0); }
  function trialsEnding(days) {
    var T = today();
    return S.deals.filter(function (d) { return d.stage === 'trial' && d.trialEnds && dayDiff(T, d.trialEnds) <= days; })
      .sort(function (a, b) { return a.trialEnds < b.trialEnds ? -1 : 1; });
  }
  function mailFor(d) {
    if (G.token) return (d.email && G.mail[lower(d.email)]) || [];
    return (S.sample && S.mail && S.mail[d.id]) || [];
  }
  function matchEvent(ev) {
    var emails = (ev.attendees || []).map(function (a) { return lower(a.email); });
    var title = lower(ev.summary);
    var hit = S.deals.filter(function (d) { return d.email && emails.indexOf(lower(d.email)) >= 0; })[0];
    if (hit) return hit;
    return S.deals.filter(function (d) {
      var r = lower(d.restaurant), c = lower(d.contact);
      return (r.length > 3 && title.indexOf(r) >= 0) || (c.length > 3 && title.indexOf(c) >= 0);
    })[0] || null;
  }
  function meetings() {
    var T = today(), out = [];
    if (G.events) {
      G.events.forEach(function (ev) {
        var allDay = !ev.start.dateTime;
        var start = allDay ? null : new Date(ev.start.dateTime);
        out.push({ key: 'g' + ev.id, start: start, title: ev.summary || '(no title)', deal: matchEvent(ev), link: safeUrl(ev.htmlLink) });
      });
    } else {
      S.deals.forEach(function (d) {
        if (d.nextMeeting && d.nextMeeting.slice(0, 10) === T) {
          var t = d.nextMeeting.slice(11).split(':'), s = fromIso(T);
          s.setHours(+t[0] || 9, +t[1] || 0);
          out.push({ key: 'd' + d.id, start: s, title: '', deal: d, link: '' });
        }
      });
    }
    return out.sort(function (a, b) { return (a.start ? a.start.getTime() : 0) - (b.start ? b.start.getTime() : 0); });
  }
  function meetingName(m) { return m.deal ? m.deal.contact + ' · ' + m.deal.restaurant : m.title; }

  function tasks() {
    var T = today(), out = [], meets = meetings();
    var meetingDeals = meets.map(function (m) { return m.deal && m.deal.id; });
    allComs().forEach(function (c) {
      var done = comDone(c);
      if (done ? done !== T : !(c.due && c.due <= T)) return;
      var d = dealById(c.dealId), late = c.due ? dayDiff(c.due, T) : 0;
      var text = c.promise + ' to ' + (c.owedTo || (d && d.contact) || 'contact') + (d ? ' (' + d.restaurant + ')' : '');
      var bits = [];
      if (late > 0) bits.push(plural(late, 'day') + ' overdue');
      if (d && isWhale(d)) bits.push('whale ' + money(d.value) + '/mo');
      out.push({ key: 'c:' + c.id, kind: 'Commit', cls: 't-red', text: text + (bits.length ? ' · ' + bits.join(', ') : ''), done: !!done, rank: 0 - late });
    });
    trialsEnding(3).forEach(function (d) {
      if (meetingDeals.indexOf(d.id) >= 0) return;
      var n = dayDiff(T, d.trialEnds);
      out.push({ key: 't:' + d.id, kind: 'Trial', cls: 't-green', text: 'Decision call with ' + who(d) + ' · free trial ' + (n < 0 ? 'ended ' + plural(-n, 'day') + ' ago' : n === 0 ? 'ends today' : 'ends in ' + plural(n, 'day')), done: !!P.done['t:' + d.id], rank: 10 });
    });
    staleDeals().filter(function (d) { return meetingDeals.indexOf(d.id) < 0; }).slice(0, 3).forEach(function (d) {
      out.push({ key: 's:' + d.id, kind: 'Stale', cls: 't-amber', text: 'Re-engage ' + who(d) + ' · ' + plural(daysQuiet(d), 'day') + ' since last touch' + (isWhale(d) ? ', whale ' + money(d.value) + '/mo' : ''), done: !!P.done['s:' + d.id], rank: 20 });
    });
    meets.forEach(function (m) {
      out.push({ key: 'm:' + m.key, kind: 'Prep', cls: 't-blue', text: 'Prep for ' + (m.start ? fmtTime(m.start) : 'today') + ' with ' + meetingName(m), done: !!P.done['m:' + m.key], rank: 30 });
    });
    P.manual.forEach(function (t) {
      out.push({ key: 'u:' + t.id, kind: 'Mine', cls: 't-steel', text: t.text, done: !!t.done, rank: 40, manual: true });
    });
    return out.sort(function (a, b) { return a.rank - b.rank; });
  }

  /* Talking points are built from the deal's own facts: stage, grade, trial
     date, open promises and the latest inbound email. No text is invented. */
  function talkingPoints(d) {
    var T = today(), out = [];
    var mine = openComs().filter(function (c) { return c.dealId === d.id; });
    var over = mine.filter(function (c) { return c.due && c.due < T; })[0];
    if (over) out.push('You still owe them "' + over.promise + '", ' + plural(dayDiff(over.due, T), 'day') + ' overdue. Bring it, or open by owning it.');
    var inbound = mailFor(d).filter(function (m) { return m.dir === 'RECEIVED'; })[0];
    if (inbound) out.push('They last wrote "' + inbound.subject + '". Answer that first.');
    if (d.stage === 'lead') out.push('Offer the free Halal Visibility Check: checked by hand, then a call with their grade and three fixes.');
    if (d.stage === 'booked') out.push('Confirm what the check covers (Google listing, certificate, recent supplier invoice) and when you will call with the grade.');
    if (d.stage === 'graded') {
      out.push('Lead with the grade' + (d.grade ? ' (' + d.grade + ')' : '') + ' and the three fixes that raise it.');
      out.push('Offer the 30-day free start: one QR card on the counter, no card details, no contract.');
    }
    if (d.stage === 'trial') {
      var n = d.trialEnds ? dayDiff(T, d.trialEnds) : null;
      out.push((n == null ? 'Free trial running. ' : n < 0 ? 'Free trial ended ' + plural(-n, 'day') + ' ago. ' : n === 0 ? 'Free trial ends today. ' : 'Free trial ends in ' + plural(n, 'day') + '. ') +
        'Bring the scans and first-visit offers shown, then ask for the $' + SALES_MONTHLY_PRICE + '/mo decision.');
    }
    if (d.stage === 'paying') out.push('Walk through this month\'s report (scans, estimated covers, best day) and ask which nearby owner they would introduce.');
    if (Number(d.locations) > 1) out.push(d.locations + ' locations. Agree which one starts first and who signs off for the group.');
    if (d.stage === 'graded' || d.stage === 'trial') out.push('The first-visit offer is theirs to set. Agree it with them; never promise one for them.');
    if (stageOf(d).open && daysQuiet(d) > CADENCE) out.push(plural(daysQuiet(d), 'day') + ' since your last touch. Acknowledge the gap before anything else.');
    return out.slice(0, 4);
  }

  /* ── Rendering ──────────────────────────────────── */
  function dueTag(c) {
    if (!c.due) return '<span class="tag t-steel">No date</span>';
    var n = dayDiff(c.due, today());
    if (n > 0) return '<span class="tag t-red">' + n + 'd late</span>';
    if (n === 0) return '<span class="tag t-amber">Today</span>';
    return '<span class="tag t-steel">' + esc(fmtDay(c.due)) + '</span>';
  }
  function whaleTag(d) { return isWhale(d) ? '<span class="whale">WHALE</span>' : ''; }
  function gmailSearch(email) { return 'https://mail.google.com/mail/' + (G.me ? '?authuser=' + encodeURIComponent(G.me) : 'u/0/') + '#search/' + encodeURIComponent(email); }
  function gmailThread(id) { return 'https://mail.google.com/mail/' + (G.me ? '?authuser=' + encodeURIComponent(G.me) : 'u/0/') + '#all/' + encodeURIComponent(id); }

  function renderHeader() {
    var h = new Date().getHours();
    var hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    $('greeting').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + hello + ', ' + SALES_OWNER_NAME;
    $('src-excel').className = 'src' + (S.sample ? '' : ' on');
    $('src-excel').lastChild.textContent = S.sample ? 'Excel · sample' : 'Excel · ' + (S.file || 'workbook');
    $('src-gmail').className = 'src' + (G.token ? ' on' : '');
    $('src-cal').className = 'src' + (G.token && G.events ? ' on' : '');
    $('btn-google').textContent = G.busy ? 'Syncing…' : G.token ? 'Refresh Google' : 'Connect Google';
    $('btn-google').disabled = G.busy;
    $('btn-export').textContent = S.sample ? 'Download Excel template' : 'Export Excel';
    var b = '';
    if (S.sample) b += '<div class="banner"><strong>Sample data.</strong> Fictional restaurants, so you can see the panel working. Download the Excel template, replace the rows with your real pipeline, then import it.</div>';
    if (G.error) b += '<div class="banner err">' + esc(G.error) + '</div>';
    if (UI.notice) b += '<div class="banner">' + esc(UI.notice) + '</div>';
    $('banners').innerHTML = b;
  }

  function renderKpis() {
    var T = today(), open = openComs();
    var overdue = open.filter(function (c) { return c.due && c.due < T; }).length;
    var dueToday = open.filter(function (c) { return c.due === T; }).length;
    var stale = staleDeals(), whales = stale.filter(isWhale).length;
    var end = monthEnd();
    var month = sum(openDeals().filter(function (d) { return d.close && d.close <= end; }), weighted);
    var meets = meetings(), now = Date.now();
    var next = meets.filter(function (m) { return m.start && m.start.getTime() > now; })[0];
    var paying = S.deals.filter(function (d) { return d.stage === 'paying'; });
    function card(label, value, sub, alert) {
      return '<div class="card"><div class="kpi-label">' + label + '</div><div class="kpi-value' + (alert ? ' alert' : '') + '">' + value + '</div><div class="kpi-sub">' + sub + '</div></div>';
    }
    $('kpis').innerHTML =
      card('Action needed today', overdue + dueToday, overdue + ' overdue · ' + dueToday + ' due today', overdue + dueToday > 0) +
      card('Stale deals', stale.length, 'Over ' + CADENCE + '-day cadence · ' + plural(whales, 'whale')) +
      card('Pipeline this month', money(month) + '<span class="small muted">/mo</span>', 'Weighted, close by ' + esc(fmtLong(end))) +
      card('Meetings today', meets.length, meets.length ? (next ? 'Next at ' + esc(fmtTime(next.start)) : 'None left today') : 'Nothing on the calendar') +
      card('Paying restaurants', paying.length, money(sum(paying, function (d) { return Number(d.value) || 0; })) + '/mo recurring');
  }

  function renderPlan() {
    var list = tasks(), done = list.filter(function (t) { return t.done; }).length;
    $('plan-chip').textContent = done + ' / ' + list.length;
    $('plan-count').textContent = done + ' of ' + list.length + ' done';
    $('plan-bar').style.width = (list.length ? Math.round(done / list.length * 100) : 0) + '%';
    $('plan-toggle').textContent = (UI.showDone ? 'Hide ' : 'Show ') + done + ' completed';
    $('plan-toggle').setAttribute('aria-expanded', String(UI.showDone));
    var shown = list.filter(function (t) { return UI.showDone || !t.done; });
    $('plan-list').innerHTML = shown.length ? shown.map(function (t, i) {
      return '<div class="task' + (t.done ? ' done' : '') + '">' +
        '<input type="checkbox" id="tk' + i + '" data-act="task" data-key="' + esc(t.key) + '" data-focus="tk:' + esc(t.key) + '"' + (t.done ? ' checked' : '') + '>' +
        '<label for="tk' + i + '">' + esc(t.text) + '</label>' +
        '<span class="tag ' + t.cls + '">' + t.kind + '</span>' +
        (t.manual ? '<button class="x" type="button" data-act="task-del" data-key="' + esc(t.key) + '" aria-label="Remove task">×</button>' : '') +
        '</div>';
    }).join('') : '<p class="empty">' + (list.length ? 'All done for today.' : 'Nothing on the plan yet. Add a task above.') + '</p>';
  }

  function renderPrep(m) {
    var d = m.deal;
    if (!d) return '<div class="prep"><p class="prep-full small muted">Not matched to a deal. Add this person\'s email to the Deals sheet to get meeting prep here.</p></div>';
    var tp = talkingPoints(d).map(function (t) { return '<div class="tp">' + esc(t) + '</div>'; }).join('') || '<p class="small muted">No talking points yet.</p>';
    var mail = mailFor(d).slice(0, 3), mailHtml;
    if (mail.length) {
      mailHtml = mail.map(function (x) {
        var age = Math.max(0, Math.round((Date.now() - x.ts) / 864e5));
        var link = x.threadId ? gmailThread(x.threadId) : (d.email ? gmailSearch(d.email) : '');
        return '<div class="mail"><span class="mail-dir">' + x.dir + '</span><strong>' + esc(x.subject || '(no subject)') + '</strong><div class="muted">' + esc(x.snippet) + '</div>' +
          '<div class="mail-foot"><span>' + (age ? age + 'd ago' : 'today') + '</span>' + (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Open in Gmail →</a>' : '') + '</div></div>';
      }).join('');
    } else if (G.token) {
      mailHtml = '<p class="small muted">' + (d.email ? 'No email with ' + esc(d.email) + ' in the last 30 days.' : 'No email address on this deal.') + '</p>';
    } else {
      mailHtml = '<p class="small muted">Connect Google to see recent email here.' + (d.email ? ' <a href="' + esc(gmailSearch(d.email)) + '" target="_blank" rel="noopener noreferrer">Search Gmail →</a>' : '') + '</p>';
    }
    var call = S.calls.filter(function (c) { return c.dealId === d.id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
    var callHtml = call ? '<p class="call">' + esc(call.summary) + '</p><p class="small muted">' + esc(fmtDay(call.date)) +
      (safeUrl(call.link) ? ' · <a href="' + esc(safeUrl(call.link)) + '" target="_blank" rel="noopener noreferrer">Open notes →</a>' : '') + '</p>'
      : '<p class="small muted">No call logged. Add one to the Calls sheet.</p>';
    var coms = openComs().filter(function (c) { return c.dealId === d.id; });
    var comHtml = coms.length ? coms.map(function (c) {
      return '<div class="mail" style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><span>' + esc(c.promise) + '</span>' + dueTag(c) + '</div>';
    }).join('') : '<p class="small muted">Nothing owed.</p>';
    return '<div class="prep">' +
      '<div><h3>Talking points</h3>' + tp + '</div>' +
      '<div><h3>Recent emails</h3>' + mailHtml + '</div>' +
      '<div><h3>Last call summary</h3>' + callHtml + '</div>' +
      '<div><h3>Open commitments</h3>' + comHtml + '</div>' +
      '</div>';
  }

  function renderMeetings() {
    var meets = meetings(), now = Date.now();
    var next = meets.filter(function (m) { return m.start && m.start.getTime() > now; })[0];
    $('mtg-chip').textContent = plural(meets.length, 'meeting');
    $('mtg-sub').textContent = (G.events ? 'From Google Calendar' : 'From the Next meeting column') + ' · click a meeting for prep';
    if (UI.openMtg === null) {
      var auto = meets.filter(function (m) { return m.deal && (!m.start || m.start.getTime() > now); })[0] || meets.filter(function (m) { return m.deal; })[0];
      UI.openMtg = auto ? auto.key : '';
    }
    $('mtg-list').innerHTML = meets.length ? meets.map(function (m) {
      var d = m.deal, open = UI.openMtg === m.key;
      return '<div class="mtg">' +
        '<button class="mtg-row" type="button" data-act="mtg" data-key="' + esc(m.key) + '" data-focus="mt:' + esc(m.key) + '" aria-expanded="' + open + '">' +
        '<span class="mtg-time">' + (m.start ? esc(fmtTime(m.start)) : 'All day') + '</span>' +
        '<span class="mtg-main"><strong>' + esc(d ? d.contact : m.title) + '</strong>' + (d ? ' <span class="muted">· ' + esc(d.restaurant) + '</span>' : '') +
        '<span class="small muted" style="display:block">' + esc(d ? [plural(Number(d.locations) || 1, 'location'), d.area, d.nextStep].filter(Boolean).join(' · ') : 'Calendar event') + '</span></span>' +
        '<span class="mtg-side">' + (d ? '<span class="num">' + money(d.value) + '/mo<span class="caret">' + (open ? '▲' : '▼') + '</span></span><span class="tag t-blue">' + esc(stageOf(d).label) + '</span>' : '<span class="caret">' + (open ? '▲' : '▼') + '</span>') + '</span>' +
        '</button>' + (open ? renderPrep(m) : '') + '</div>';
    }).join('') : '<p class="empty">No meetings today.' + (next ? '' : ' Use the time for the stale deals.') + '</p>';
  }

  function renderCommitments() {
    var T = today(), open = openComs();
    var overdue = open.filter(function (c) { return c.due && c.due < T; }).length;
    $('com-chip').textContent = open.length + ' open · ' + overdue + ' overdue';
    if (!open.length) { $('com-table').innerHTML = '<p class="empty">No open promises. Add rows to the Commitments sheet' + (G.token ? '' : ', or connect Google to pick them up from sent mail') + '.</p>'; return; }
    $('com-table').innerHTML = '<table><thead><tr><th scope="col">Promise</th><th scope="col">Owed to</th><th scope="col">Deal</th><th scope="col" class="r">Value</th><th scope="col">Due</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
      open.map(function (c) {
        var d = dealById(c.dealId), call = /call/i.test(c.source);
        return '<tr class="click" tabindex="0" data-act="com-open" data-id="' + esc(c.id) + '" data-focus="co:' + esc(c.id) + '">' +
          '<td><i class="dot ' + (call ? 'd-call' : 'd-email') + '"></i>' + esc(c.promise) + (c.detected ? ' <span class="tag t-steel">auto</span>' : '') + '<span class="sr-only"> (' + (call ? 'call' : 'email') + ' source)</span></td>' +
          '<td>' + esc(c.owedTo || (d && d.contact) || '') + '</td>' +
          '<td>' + (d ? esc(d.id + ' · ' + stageOf(d).label) : esc(c.dealId || '')) + '</td>' +
          '<td class="r num">' + (d ? money(d.value) : '') + '</td>' +
          '<td>' + dueTag(c) + '</td>' +
          '<td class="r"><button class="btn btn-sm" type="button" data-act="com-done" data-id="' + esc(c.id) + '">Done</button></td></tr>';
      }).join('') + '</tbody></table>';
  }

  function renderStale() {
    var list = staleDeals();
    $('stale-chip').textContent = list.length + ' at risk';
    $('stale-sub').textContent = 'Open deals past your ' + CADENCE + '-day cadence · ranked by days × value';
    $('stale-list').innerHTML = list.length ? list.map(function (d) {
      var n = daysQuiet(d), hot = n >= CADENCE + 3;
      return '<div class="row"><div class="days ' + (hot ? 't-red' : 't-amber') + '"><div>' + n + '<small>DAYS</small></div></div>' +
        '<div class="row-main"><strong>' + esc(d.contact || d.restaurant) + '</strong>' + whaleTag(d) +
        '<span class="small muted" style="display:block">' + esc([d.restaurant, stageOf(d).label, 'last touch ' + fmtDay(lastTouch(d))].filter(Boolean).join(' · ')) + '</span></div>' +
        '<span class="num">' + money(d.value) + '/mo</span>' +
        '<button class="btn btn-sm" type="button" data-act="touch" data-id="' + esc(d.id) + '">Log touch</button></div>';
    }).join('') : '<p class="empty">Every open deal has been touched in the last ' + CADENCE + ' days.</p>';
  }

  function renderForecast() {
    var open = openDeals(), total = sum(open, weighted), end = monthEnd();
    var month = sum(open.filter(function (d) { return d.close && d.close <= end; }), weighted);
    $('fc-sub').textContent = plural(open.length, 'open deal') + ' · click a stage to drill down';
    $('fc-chip').textContent = money(total) + '/mo weighted';
    var html = '<div class="hero-num"><div class="kpi-label">Weighted, expected close by ' + esc(fmtLong(end)) + '</div>' +
      '<div class="kpi-value">' + money(month) + '<span class="small">/mo</span></div>' +
      '<div class="kpi-sub">From ' + money(total) + '/mo total weighted across ' + plural(open.length, 'open deal') + '</div></div>';
    STAGES.filter(function (s) { return s.open; }).forEach(function (s) {
      var deals = open.filter(function (d) { return d.stage === s.key; }).sort(function (a, b) { return b.value - a.value; });
      var raw = sum(deals, function (d) { return Number(d.value) || 0; }), w = raw * s.weight;
      var isOpen = UI.openStage === s.key, color = STAGE_COLORS[s.key] || '#8A9BB0';
      html += '<div class="stage"><button class="stage-row" type="button" data-act="stage" data-key="' + s.key + '" data-focus="st:' + s.key + '" aria-expanded="' + isOpen + '">' +
        '<span class="stage-dot" style="background:' + color + '"></span>' +
        '<span style="flex:1;min-width:0"><strong>' + esc(s.label) + '</strong><span class="small muted" style="display:block">' + plural(deals.length, 'deal') + ' · ' + Math.round(s.weight * 100) + '%</span></span>' +
        '<span class="stage-bar"><span style="width:' + (total ? Math.round(w / total * 100) : 0) + '%;background:' + color + '"></span></span>' +
        '<span class="stage-val"><span class="num">' + money(w) + '</span><span class="caret">' + (isOpen ? '▲' : '▼') + '</span><span class="small muted" style="display:block">of ' + money(raw) + ' total</span></span></button>';
      if (isOpen) {
        html += '<div class="drill">' + (deals.length ? deals.map(function (d) {
          return '<div class="drill-row"><span>' + esc(d.contact) + ' · ' + esc(d.restaurant) + whaleTag(d) +
            '<span class="small muted" style="display:block">' + (lastTouch(d) ? daysQuiet(d) + 'd since last touch' : 'No touch logged') + (d.close ? ' · close ' + esc(fmtDay(d.close)) : '') + '</span></span>' +
            '<span class="num">' + money(d.value) + '</span></div>';
        }).join('') : '<p class="empty">No deals at this stage.</p>') + '</div>';
      }
      html += '</div>';
    });
    $('fc-body').innerHTML = html;
  }

  function renderTrials() {
    var T = today(), list = trialsEnding(SALES_TRIAL_WARN_DAYS);
    $('trial-chip').textContent = list.length + ' in ' + SALES_TRIAL_WARN_DAYS + ' days';
    $('trial-list').innerHTML = list.length ? list.map(function (d) {
      var n = dayDiff(T, d.trialEnds);
      return '<div class="row"><div class="days ' + (n <= 3 ? 't-red' : 't-green') + '"><div>' + (n < 0 ? 0 : n) + '<small>' + (n < 0 ? 'ENDED' : n === 1 ? 'DAY' : 'DAYS') + '</small></div></div>' +
        '<div class="row-main"><strong>' + esc(d.contact || d.restaurant) + '</strong>' + whaleTag(d) +
        '<span class="small muted" style="display:block">' + esc([d.restaurant, 'ends ' + fmtDay(d.trialEnds), plural(Number(d.locations) || 1, 'location')].join(' · ')) + '</span></div>' +
        '<span class="num">' + money(d.value) + '/mo</span></div>';
    }).join('') : '<p class="empty">No free trials ending in the next ' + SALES_TRIAL_WARN_DAYS + ' days.</p>';
  }

  function render() {
    var active = document.activeElement, focusId = active && active.getAttribute ? active.getAttribute('data-focus') : '';
    renderHeader(); renderKpis(); renderPlan(); renderMeetings(); renderCommitments(); renderStale(); renderForecast(); renderTrials();
    if (focusId) {
      var all = document.querySelectorAll('[data-focus]');
      var hit = null;
      for (var i = 0; i < all.length; i++) if (all[i].getAttribute('data-focus') === focusId) { hit = all[i]; break; }
      // A ticked task leaves the list, so hand focus to the completed toggle.
      (hit || (focusId.indexOf('tk:') === 0 ? $('plan-toggle') : null) || { focus: function () {} }).focus();
    }
  }

  /* ── Actions ────────────────────────────────────── */
  function setComDone(id, on) {
    var c = allComs().filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    if (c.detected) { if (on) P.det[id] = today(); else delete P.det[id]; }
    else { c.doneOn = on ? today() : ''; saveData(); }
    savePlan();
  }
  function openSource(id) {
    var c = allComs().filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var d = dealById(c.dealId), url = safeUrl(c.link);
    if (!url && /call/i.test(c.source)) {
      var call = S.calls.filter(function (x) { return x.dealId === c.dealId && safeUrl(x.link); })[0];
      if (call) url = safeUrl(call.link);
    }
    if (!url && d && d.email && !S.sample) url = gmailSearch(d.email);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else toast(S.sample ? 'Sample row. With your own workbook this opens the email or call notes.' : 'No source link on this row. Add one in the Link column.');
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act'), key = el.getAttribute('data-key'), id = el.getAttribute('data-id');
    if (act === 'task') {
      var on = el.checked;
      if (key.indexOf('c:') === 0) setComDone(key.slice(2), on);
      else if (key.indexOf('u:') === 0) P.manual.forEach(function (t) { if ('u:' + t.id === key) t.done = on; });
      else if (on) P.done[key] = 1; else delete P.done[key];
      savePlan(); render();
    } else if (act === 'task-del') {
      P.manual = P.manual.filter(function (t) { return 'u:' + t.id !== key; });
      savePlan(); render();
    } else if (act === 'mtg') {
      UI.openMtg = UI.openMtg === key ? '' : key; render();
    } else if (act === 'stage') {
      UI.openStage = UI.openStage === key ? '' : key; render();
    } else if (act === 'com-done') {
      e.stopPropagation(); setComDone(id, true); toast('Marked done.'); render();
    } else if (act === 'com-open') {
      openSource(id);
    } else if (act === 'touch') {
      var d = dealById(id);
      if (d) { d.lastTouch = today(); saveData(); toast('Touch logged for ' + (d.contact || d.restaurant) + '.'); render(); }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target.matches || !e.target.matches('tr[data-act="com-open"]')) return;
    openSource(e.target.getAttribute('data-id'));
  });
  $('plan-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('plan-input'), text = input.value.trim();
    if (!text) return;
    P.manual.push({ id: Date.now().toString(36), text: text.slice(0, 160), done: false });
    input.value = ''; savePlan(); render();
  });
  $('plan-toggle').addEventListener('click', function () { UI.showDone = !UI.showDone; render(); });
  $('btn-reset').addEventListener('click', function () {
    if (!S.sample && !window.confirm('Remove your imported pipeline from this browser and go back to sample data? Export it first if you want to keep it.')) return;
    try { localStorage.removeItem(DATA_KEY); } catch (_) {}
    S = sample(); UI.openMtg = null; UI.notice = ''; render(); toast('Back to sample data.');
  });

  /* ── Excel import / export ──────────────────────── */
  var SHEETS = {
    Deals: [['ID', 'id'], ['Restaurant', 'restaurant'], ['Contact', 'contact'], ['Email', 'email'], ['Phone', 'phone'], ['Area', 'area'], ['Stage', 'stage'],
      ['Locations', 'locations'], ['Monthly value', 'value'], ['Expected close', 'close'], ['Last touch', 'lastTouch'], ['Next step', 'nextStep'],
      ['Next meeting', 'nextMeeting'], ['Grade', 'grade'], ['Trial ends', 'trialEnds'], ['Notes', 'notes']],
    Commitments: [['ID', 'id'], ['Promise', 'promise'], ['Owed to', 'owedTo'], ['Deal ID', 'dealId'], ['Due', 'due'], ['Source', 'source'], ['Link', 'link'], ['Done on', 'doneOn']],
    Calls: [['Date', 'date'], ['Deal ID', 'dealId'], ['Summary', 'summary'], ['Link', 'link']]
  };
  var ALIASES = { value: ['value', 'monthlyvalue', 'mrr', 'monthly'], dealId: ['dealid', 'deal'], close: ['expectedclose', 'close', 'closedate'], doneOn: ['doneon', 'done'], nextMeeting: ['nextmeeting', 'meeting'] };
  var DATES = { close: 1, lastTouch: 1, trialEnds: 1, due: 1, doneOn: 1, date: 1 };
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function needXlsx() { return window.XLSX ? Promise.resolve() : loadScript(SALES_XLSX_URL); }

  // Any cell value to 'YYYY-MM-DD' (or 'YYYY-MM-DDTHH:MM' when withTime).
  function cellDate(v, withTime) {
    var y, m, d, h = 0, mi = 0, hit;
    if (v == null || v === '') return '';
    if (typeof v === 'number') {
      var dt = new Date(Math.round((v - 25569) * 864e5));
      y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate(); h = dt.getUTCHours(); mi = dt.getUTCMinutes();
    } else {
      var s = String(v).trim();
      if ((hit = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/))) { y = +hit[1]; m = +hit[2]; d = +hit[3]; h = +hit[4] || 0; mi = +hit[5] || 0; }
      else if ((hit = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?/i))) {
        m = +hit[1]; d = +hit[2]; y = +hit[3] < 100 ? 2000 + +hit[3] : +hit[3]; h = +hit[4] || 0; mi = +hit[5] || 0;
        if (hit[6] && /pm/i.test(hit[6]) && h < 12) h += 12;
        if (hit[6] && /am/i.test(hit[6]) && h === 12) h = 0;
      } else {
        var p = new Date(s);
        if (isNaN(p)) return '';
        y = p.getFullYear(); m = p.getMonth() + 1; d = p.getDate(); h = p.getHours(); mi = p.getMinutes();
      }
    }
    if (!(y > 1990 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    return y + '-' + pad(m) + '-' + pad(d) + (withTime ? 'T' + pad(h) + ':' + pad(mi) : '');
  }
  function toSerial(s) {
    var p = s.slice(0, 10).split('-'), n = Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5 + 25569;
    if (s.length > 10) { var t = s.slice(11).split(':'); n += (+t[0] * 60 + +t[1]) / 1440; }
    return n;
  }
  function stageKey(v) {
    var s = norm(v);
    for (var i = 0; i < STAGES.length; i++) if (s === norm(STAGES[i].key) || s === norm(STAGES[i].label)) return STAGES[i].key;
    if (/trial/.test(s)) return 'trial';
    if (/grade/.test(s)) return 'graded';
    if (/book|check/.test(s)) return 'booked';
    if (/pay|won|active|customer/.test(s)) return 'paying';
    if (/lost|dead|no/.test(s)) return 'lost';
    return 'lead';
  }
  function readSheet(wb, name, fallbackFirst) {
    var sheetName = wb.SheetNames.filter(function (n) { return norm(n) === norm(name); })[0] || (fallbackFirst ? wb.SheetNames[0] : '');
    if (!sheetName) return [];
    var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: true });
    return rows.map(function (row) {
      var byNorm = {}, out = {};
      Object.keys(row).forEach(function (k) { byNorm[norm(k)] = row[k]; });
      SHEETS[name].forEach(function (col) {
        var key = col[1], names = [norm(col[0])].concat(ALIASES[key] || []), v = '';
        for (var i = 0; i < names.length; i++) if (byNorm[names[i]] !== undefined && byNorm[names[i]] !== '') { v = byNorm[names[i]]; break; }
        if (DATES[key]) v = cellDate(v, false);
        else if (key === 'nextMeeting') v = cellDate(v, true);
        else v = typeof v === 'string' ? v.trim() : v;
        out[key] = v;
      });
      return out;
    });
  }
  function importWorkbook(file) {
    return needXlsx().then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array' });
      var deals = readSheet(wb, 'Deals', true).filter(function (d) { return d.restaurant || d.contact; });
      if (!deals.length) throw new Error('No deals found. The workbook needs a Deals sheet with Restaurant and Contact columns.');
      var seen = {};
      deals.forEach(function (d, i) {
        d.id = String(d.id || 'D-' + ('00' + (i + 1)).slice(-3));
        while (seen[d.id]) d.id += '-' + (i + 1);
        seen[d.id] = 1;
        d.stage = stageKey(d.stage);
        d.email = lower(d.email);
        d.locations = Math.max(1, Math.round(Number(d.locations)) || 1);
        d.value = Number(d.value) > 0 ? Number(d.value) : d.locations * SALES_MONTHLY_PRICE;
        ['restaurant', 'contact', 'phone', 'area', 'nextStep', 'grade', 'notes'].forEach(function (k) { d[k] = String(d[k] == null ? '' : d[k]); });
      });
      var coms = readSheet(wb, 'Commitments').filter(function (c) { return c.promise; });
      coms.forEach(function (c, i) {
        c.id = String(c.id || 'C-' + ('00' + (i + 1)).slice(-3));
        c.promise = String(c.promise); c.owedTo = String(c.owedTo || ''); c.dealId = String(c.dealId || '');
        c.source = /call/i.test(c.source) ? 'Call' : 'Email';
        c.link = safeUrl(c.link);
      });
      var calls = readSheet(wb, 'Calls').filter(function (c) { return c.summary; });
      calls.forEach(function (c) { c.summary = String(c.summary); c.dealId = String(c.dealId || ''); c.link = safeUrl(c.link); });
      S = { sample: false, file: file.name, deals: deals, commitments: coms, calls: calls, mail: {} };
      saveData();
      UI.openMtg = null; UI.notice = '';
      render();
      toast('Imported ' + plural(deals.length, 'deal') + ', ' + plural(coms.length, 'commitment') + ', ' + plural(calls.length, 'call') + '.');
      if (G.token) syncGoogle();
    });
  }
  function exportWorkbook() {
    return needXlsx().then(function () {
      var wb = XLSX.utils.book_new();
      var data = { Deals: S.deals, Commitments: S.commitments, Calls: S.calls };
      Object.keys(SHEETS).forEach(function (name) {
        var cols = SHEETS[name];
        var aoa = [cols.map(function (c) { return c[0]; })].concat(data[name].map(function (row) {
          return cols.map(function (c) {
            var v = row[c[1]];
            if (c[1] === 'stage') return stageOf(row).label;
            return v == null ? '' : v;
          });
        }));
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        data[name].forEach(function (row, r) {
          cols.forEach(function (c, ci) {
            var v = row[c[1]], timed = c[1] === 'nextMeeting';
            if ((DATES[c[1]] || timed) && v) ws[XLSX.utils.encode_cell({ r: r + 1, c: ci })] = { t: 'n', v: toSerial(v), z: timed ? 'yyyy-mm-dd hh:mm' : 'yyyy-mm-dd' };
          });
        });
        ws['!cols'] = cols.map(function (c) { return { wch: /promise|summary|notes|nextStep|restaurant|link|email/.test(c[1]) ? 34 : 16 }; });
        XLSX.utils.book_append_sheet(wb, ws, name);
      });
      var help = [
        ['Rihla sales pipeline workbook'],
        ['Edit the Deals, Commitments and Calls sheets, then import this file on the Sales Control Panel.'],
        [''],
        ['Stage must be one of:'].concat(STAGES.map(function (s) { return s.label; })),
        ['Monthly value is in dollars per month. Leave it empty to use Locations x $' + SALES_MONTHLY_PRICE + '.'],
        ['Email is how the panel finds Gmail threads and calendar events for a deal.'],
        ['Next meeting (date and time) is only used when Google Calendar is not connected.'],
        ['Commitments: Source is Email or Call. Link is the email or call-notes URL. Done on is the date you kept the promise.'],
        ['Keep Deal ID in Commitments and Calls equal to the ID in Deals.']
      ];
      var hs = XLSX.utils.aoa_to_sheet(help); hs['!cols'] = [{ wch: 90 }];
      XLSX.utils.book_append_sheet(wb, hs, 'Read me');
      XLSX.writeFile(wb, S.sample ? 'Rihla-Sales-Pipeline-template.xlsx' : 'Rihla-Sales-Pipeline.xlsx');
    });
  }
  $('btn-import').addEventListener('click', function () { $('file').click(); });
  $('file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    importWorkbook(f).catch(function (err) { UI.notice = 'Import failed: ' + err.message; render(); });
  });
  $('btn-export').addEventListener('click', function () {
    exportWorkbook().catch(function (err) { UI.notice = 'Export failed: ' + err.message; render(); });
  });

  /* ── Google: Gmail + Calendar, read-only ────────── */
  function gget(url) {
    return fetch(url, { headers: { Authorization: 'Bearer ' + G.token } }).then(function (r) {
      if (r.status === 401) { disconnect(); throw new Error('Google sign-in expired. Press Connect Google again.'); }
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j.error && j.error.message) || 'Google request failed (' + r.status + ')');
        return j;
      });
    });
  }
  function disconnect() {
    G.token = ''; G.events = null; G.mail = {}; G.last = {}; G.detected = [];
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
  }
  function decodeEntities(s) { var t = document.createElement('textarea'); t.innerHTML = String(s || ''); return t.value; }
  function b64(s) {
    try {
      var bin = atob(s.replace(/-/g, '+').replace(/_/g, '/')), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (_) { return ''; }
  }
  function plainBody(p) {
    if (!p) return '';
    if (p.mimeType === 'text/plain' && p.body && p.body.data) return b64(p.body.data);
    var parts = p.parts || [];
    for (var i = 0; i < parts.length; i++) { var t = plainBody(parts[i]); if (t) return t; }
    return '';
  }
  function ownWords(text) {
    // Drop the quoted thread underneath a reply.
    var lines = text.split(/\r?\n/), out = [];
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*>/.test(lines[i]) || /^On .{5,120} wrote:\s*$/.test(lines[i]) || /^-{2,}\s*(Original|Forwarded) message/i.test(lines[i])) break;
      out.push(lines[i]);
    }
    return out.join(' ').replace(/\s+/g, ' ');
  }
  var PROMISE = /\b(?:i['’]ll|i will|we['’]ll|we will|i['’]m going to|i am going to|let me)\s+(?:\w+\s+){0,3}?(?:send|share|email|forward|get back|follow up|call|confirm|drop off|bring|book|schedule|prepare|put together|introduce|check)\b/i;
  var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  function promiseDue(sentence, sent) {
    var s = sentence.toLowerCase(), base = fromIso(sent), dow = base.getDay();
    if (/\b(today|tonight|end of day|eod)\b/.test(s)) return sent;
    if (/\btomorrow\b/.test(s)) return addDays(sent, 1);
    for (var i = 0; i < 7; i++) if (s.indexOf(WEEKDAYS[i]) >= 0) return addDays(sent, ((i - dow + 7) % 7) || 7);
    if (/\b(this week|end of (the )?week)\b/.test(s)) return addDays(sent, dow <= 5 ? 5 - dow : 0);
    if (/\bnext week\b/.test(s)) return addDays(sent, ((1 - dow + 7) % 7) || 7);
    return addDays(sent, 2);
  }
  function findPromise(text, sent) {
    var parts = ownWords(text).match(/[^.!?]+[.!?]*/g) || [];
    for (var i = 0; i < parts.length; i++) {
      if (PROMISE.test(parts[i])) {
        var s = parts[i].trim();
        return { promise: s.length > 110 ? s.slice(0, 107) + '…' : s, due: promiseDue(s, sent) };
      }
    }
    return null;
  }
  function pool(items, size, fn) {
    var i = 0;
    function next() { return i >= items.length ? Promise.resolve() : fn(items[i++]).then(next, next); }
    var runners = [];
    for (var n = 0; n < size; n++) runners.push(next());
    return Promise.all(runners);
  }
  function syncCalendar() {
    var a = fromIso(today()), b = fromIso(addDays(today(), 1));
    var url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=50' +
      '&timeMin=' + encodeURIComponent(a.toISOString()) + '&timeMax=' + encodeURIComponent(b.toISOString()) +
      '&fields=' + encodeURIComponent('items(id,summary,htmlLink,status,start,attendees(email,self,responseStatus))');
    return gget(url).then(function (j) {
      G.events = (j.items || []).filter(function (ev) {
        if (ev.status === 'cancelled' || !ev.start) return false;
        return !(ev.attendees || []).some(function (x) { return x.self && x.responseStatus === 'declined'; });
      });
    });
  }
  function syncMail() {
    var byEmail = {};
    S.deals.forEach(function (d) { if (d.email && d.stage !== 'lost') byEmail[lower(d.email)] = d; });
    var emails = Object.keys(byEmail).slice(0, 40);
    G.mail = {}; G.last = {}; G.detected = [];
    if (!emails.length) return Promise.resolve();
    // Only mail to or from the contacts in the workbook is ever requested.
    var q = 'newer_than:30d {' + emails.map(function (e) { return 'from:' + e + ' to:' + e; }).join(' ') + '}';
    var base = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
    var cutoff = addDays(today(), -21);
    return gget(base + '?maxResults=60&q=' + encodeURIComponent(q)).then(function (list) {
      return pool(list.messages || [], 6, function (m) {
        return gget(base + '/' + encodeURIComponent(m.id) + '?format=full&fields=' + encodeURIComponent('id,threadId,labelIds,snippet,internalDate,payload')).then(function (msg) {
          var hdr = {};
          ((msg.payload && msg.payload.headers) || []).forEach(function (h) { hdr[h.name.toLowerCase()] = h.value; });
          var sent = (msg.labelIds || []).indexOf('SENT') >= 0;
          var ts = Number(msg.internalDate) || Date.now(), day = iso(new Date(ts));
          var found = ((sent ? (hdr.to || '') + ',' + (hdr.cc || '') : hdr.from || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []);
          var snippet = decodeEntities(msg.snippet);
          found.filter(function (e, i) { return byEmail[e] && found.indexOf(e) === i; }).forEach(function (e) {
            (G.mail[e] = G.mail[e] || []).push({ dir: sent ? 'SENT' : 'RECEIVED', subject: hdr.subject || '', snippet: snippet, ts: ts, threadId: msg.threadId });
            if (!G.last[e] || day > G.last[e]) G.last[e] = day;
            if (sent && day >= cutoff) {
              var p = findPromise(plainBody(msg.payload) || snippet, day);
              if (p) G.detected.push({ id: 'g:' + msg.id, promise: p.promise, owedTo: byEmail[e].contact, dealId: byEmail[e].id, due: p.due, source: 'Email', link: gmailThread(msg.threadId), detected: true });
            }
          });
        });
      });
    }).then(function () {
      Object.keys(G.mail).forEach(function (e) { G.mail[e].sort(function (a, b) { return b.ts - a.ts; }); });
    });
  }
  function syncGoogle() {
    if (!G.token) return;
    G.busy = true; G.error = ''; render();
    var problems = [];
    function note(label) { return function (err) { problems.push(label + ': ' + err.message); }; }
    gget('https://gmail.googleapis.com/gmail/v1/users/me/profile').then(function (p) { G.me = p.emailAddress || ''; }, function () {})
      .then(function () { return G.token ? Promise.all([syncCalendar().catch(note('Calendar')), syncMail().catch(note('Gmail'))]) : null; })
      .then(function () {
        G.busy = false; UI.openMtg = null;
        G.error = G.token ? problems.join(' · ') : 'Google sign-in expired. Press Connect Google again.';
        // Forget "done" marks for auto-detected promises once they are a month old.
        Object.keys(P.det).forEach(function (k) { if (dayDiff(P.det[k], today()) > 30) delete P.det[k]; });
        savePlan(); render();
        if (G.token && !problems.length) toast('Gmail and Calendar are up to date.');
      });
  }
  function connectGoogle() {
    if (!SALES_GOOGLE_CLIENT_ID) {
      $('sources').open = true;
      $('sources').scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Add your Google client ID first. The steps are under Data sources.');
      return;
    }
    if (!(window.google && google.accounts && google.accounts.oauth2)) { toast('Google sign-in is still loading. Try again in a moment.'); return; }
    google.accounts.oauth2.initTokenClient({
      client_id: SALES_GOOGLE_CLIENT_ID,
      scope: SALES_GOOGLE_SCOPES,
      callback: function (resp) {
        if (!resp || resp.error || !resp.access_token) { G.error = 'Google did not grant access' + (resp && resp.error ? ' (' + resp.error + ')' : '') + '.'; render(); return; }
        G.token = resp.access_token;
        try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ t: G.token, exp: Date.now() + (Number(resp.expires_in) - 60) * 1000 })); } catch (_) {}
        syncGoogle();
      },
      error_callback: function (err) { G.error = 'Google sign-in was closed or blocked' + (err && err.type ? ' (' + err.type + ')' : '') + '.'; render(); }
    }).requestAccessToken();
  }
  $('btn-google').addEventListener('click', function () { if (G.token) syncGoogle(); else connectGoogle(); });

  /* ── Start ──────────────────────────────────────── */
  $('origin').textContent = location.origin;
  savePlan();
  render();
  if (SALES_GOOGLE_CLIENT_ID) {
    loadScript('https://accounts.google.com/gsi/client').catch(function () { G.error = 'Could not load Google sign-in.'; render(); });
    try {
      var saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
      if (saved && saved.t && saved.exp > Date.now()) { G.token = saved.t; syncGoogle(); }
    } catch (_) {}
  }
})();
