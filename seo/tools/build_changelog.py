#!/usr/bin/env python3
"""Builds one page's SEO changelog PDF from its JSON source.

    python3 seo/tools/build_changelog.py seo/changelogs/src/01-home.json

Writes seo/changelogs/01-home.pdf (same name, .pdf, one folder up).

Text fields accept a little inline markup:
    **bold**     `code`     [label](https://link)
"""
import json
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Frame, KeepTogether,
                                NextPageTemplate, PageTemplate, Paragraph, Spacer, Table,
                                TableStyle)

# ── Brand palette (same values as the site) ─────────────────────────────────
NAVY = colors.HexColor('#080D1A')
GOLD = colors.HexColor('#C8943C')
GOLD_DARK = colors.HexColor('#8A6220')
IVORY = colors.HexColor('#F5EDD6')
INK = colors.HexColor('#1B2333')
MUTED = colors.HexColor('#5B6779')
RULE = colors.HexColor('#DDD6C3')
TINT = colors.HexColor('#FAF7EE')
CODE_BG = colors.HexColor('#F3F1EA')
PRIORITY = {
    'Critical': colors.HexColor('#B42318'),
    'High': colors.HexColor('#B5730F'),
    'Medium': colors.HexColor('#3B5B7A'),
    'Low': colors.HexColor('#6B7686'),
}
AREA_COLOR = {
    'Technical': colors.HexColor('#3B5B7A'),
    'Text': colors.HexColor('#2F6B4F'),
    'Tracking': colors.HexColor('#7A4B8C'),
}

# ── Fonts ───────────────────────────────────────────────────────────────────
def _register(name, paths):
    for p in paths:
        if Path(p).exists():
            pdfmetrics.registerFont(TTFont(name, p))
            return True
    return False

LIB = '/usr/share/fonts/truetype/liberation/'
DJV = '/usr/share/fonts/truetype/dejavu/'
JBM = '/usr/share/fonts/truetype/jetbrains-mono/'
_register('Body', [LIB + 'LiberationSans-Regular.ttf', DJV + 'DejaVuSans.ttf'])
_register('Body-Bold', [LIB + 'LiberationSans-Bold.ttf', DJV + 'DejaVuSans-Bold.ttf'])
_register('Body-Italic', [LIB + 'LiberationSans-Italic.ttf', DJV + 'DejaVuSans.ttf'])
_register('Body-BoldItalic', [LIB + 'LiberationSans-BoldItalic.ttf', DJV + 'DejaVuSans-Bold.ttf'])
_register('Mono', [JBM + 'JetBrainsMono-Regular.ttf', DJV + 'DejaVuSansMono.ttf'])
_register('Mono-Bold', [JBM + 'JetBrainsMono-Bold.ttf', DJV + 'DejaVuSansMono-Bold.ttf'])
_register('Sym', [DJV + 'DejaVuSans.ttf'])
pdfmetrics.registerFontFamily('Body', normal='Body', bold='Body-Bold', italic='Body-Italic', boldItalic='Body-BoldItalic')
pdfmetrics.registerFontFamily('Mono', normal='Mono', bold='Mono-Bold', italic='Mono', boldItalic='Mono-Bold')

# Characters the body font lacks are drawn with DejaVu Sans (check marks, single Arabic letters).
_SYM = re.compile('([؀-ۿ✓✗▸◆→←]+)')


def fmt(text, code_size=8.3):
    """Escape text for a reportlab Paragraph and apply the inline markup."""
    t = escape(str(text))
    t = re.sub(r'`([^`]+)`', lambda m: '<font name="Mono" size="%s" color="#3A2E12">%s</font>' % (code_size, m.group(1)), t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', r'<link href="\2" color="#8A6220"><u>\1</u></link>', t)
    t = _SYM.sub(r'<font name="Sym">\1</font>', t)
    return t.replace('\n', '<br/>')


# ── Styles ──────────────────────────────────────────────────────────────────
def S(name, **kw):
    base = dict(fontName='Body', fontSize=9.6, leading=13.6, textColor=INK, spaceAfter=0, spaceBefore=0)
    base.update(kw)
    return ParagraphStyle(name, **base)

ST = {
    'body': S('body'),
    'bullet': S('bullet', leftIndent=12, bulletIndent=0, spaceAfter=3.5),
    'small': S('small', fontSize=8.4, leading=11.8, textColor=MUTED),
    'section': S('section', fontName='Body-Bold', fontSize=14, leading=18, textColor=NAVY),
    'eyebrow': S('eyebrow', fontName='Body-Bold', fontSize=7.4, leading=10, textColor=GOLD_DARK),
    'group': S('group', fontName='Body-Bold', fontSize=10.6, leading=14, textColor=NAVY),
    'item_title': S('item_title', fontName='Body-Bold', fontSize=10, leading=13.4, textColor=NAVY),
    'th': S('th', fontName='Body-Bold', fontSize=8, leading=10.5, textColor=MUTED),
    'td': S('td', fontSize=8.9, leading=12.2),
    'td_bold': S('td_bold', fontName='Body-Bold', fontSize=8.9, leading=12.2, textColor=NAVY),
    'code': S('code', fontName='Mono', fontSize=7.7, leading=10.8, textColor=colors.HexColor('#2A2415'), wordWrap='CJK'),
    'label': S('label', fontName='Body-Bold', fontSize=7.2, leading=10.8, textColor=MUTED),
    'note': S('note', fontName='Body-Italic', fontSize=8.8, leading=12.2, textColor=GOLD_DARK),
    'prio': S('prio', fontName='Body-Bold', fontSize=7.4, leading=10),
    'action': S('action', fontSize=9.2, leading=13),
}

PAGE_W, PAGE_H = letter
MARGIN_X = 0.8 * inch
BAND_H = 1.72 * inch
CONTENT_W = PAGE_W - 2 * MARGIN_X


class NumberedCanvas(pdfcanvas.Canvas):
    """Writes 'Page x of y' once the total is known."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            self.setFont('Body', 7.6)
            self.setFillColor(MUTED)
            self.drawRightString(PAGE_W - MARGIN_X, 0.5 * inch, 'Page %d of %d' % (self._pageNumber, total))
            super().showPage()
        super().save()


def build(src_path):
    src_path = Path(src_path)
    d = json.loads(src_path.read_text(encoding='utf-8'))
    out_path = src_path.parent.parent / (src_path.stem + '.pdf')

    footer_left = 'Rihla · SEO changelog · %s (%s)' % (d['page_name'], d['page_path'])

    def footer(c):
        c.setStrokeColor(RULE)
        c.setLineWidth(0.5)
        c.line(MARGIN_X, 0.68 * inch, PAGE_W - MARGIN_X, 0.68 * inch)
        c.setFont('Body', 7.6)
        c.setFillColor(MUTED)
        c.drawString(MARGIN_X, 0.5 * inch, footer_left)

    def first_page(c, doc):
        c.saveState()
        c.setFillColor(NAVY)
        c.rect(0, PAGE_H - BAND_H, PAGE_W, BAND_H, stroke=0, fill=1)
        c.setFillColor(GOLD)
        c.rect(0, PAGE_H - BAND_H - 2.2, PAGE_W, 2.2, stroke=0, fill=1)
        y = PAGE_H - 0.62 * inch
        c.setFillColor(GOLD)
        c.setFont('Body-Bold', 8)
        c.drawString(MARGIN_X, y, 'R I H L A    ·    S E O   C H A N G E L O G')
        c.setFillColor(IVORY)
        c.setFont('Body-Bold', 25)
        c.drawString(MARGIN_X, y - 0.47 * inch, d['page_name'])
        c.setFont('Mono', 9)
        c.setFillColor(colors.HexColor('#A9B4C4'))
        c.drawString(MARGIN_X, y - 0.74 * inch, '%s    ·    %s' % (d['page_url'], d['page_file']))
        # right column: page x of y, date, status pill
        rx = PAGE_W - MARGIN_X
        c.setFont('Body', 8.6)
        c.setFillColor(colors.HexColor('#A9B4C4'))
        c.drawRightString(rx, y, 'Page %d of %d on the site' % (d['index'], d['of']))
        c.drawRightString(rx, y - 0.19 * inch, d['date_long'])
        label = d.get('status', 'Done').upper()
        c.setFont('Body-Bold', 8)
        w = c.stringWidth(label, 'Body-Bold', 8) + 20
        c.setFillColor(GOLD)
        c.roundRect(rx - w, y - 0.62 * inch, w, 17, 8.5, stroke=0, fill=1)
        c.setFillColor(NAVY)
        c.drawCentredString(rx - w / 2, y - 0.62 * inch + 5.2, label)
        footer(c)
        c.restoreState()

    def later_page(c, doc):
        c.saveState()
        c.setFont('Body-Bold', 7.6)
        c.setFillColor(GOLD_DARK)
        c.drawString(MARGIN_X, PAGE_H - 0.55 * inch, 'RIHLA  ·  SEO CHANGELOG')
        c.setFont('Body', 7.6)
        c.setFillColor(MUTED)
        c.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 0.55 * inch, '%s  ·  %s' % (d['page_name'], d['date_long']))
        c.setStrokeColor(RULE)
        c.setLineWidth(0.5)
        c.line(MARGIN_X, PAGE_H - 0.64 * inch, PAGE_W - MARGIN_X, PAGE_H - 0.64 * inch)
        footer(c)
        c.restoreState()

    doc = BaseDocTemplate(
        str(out_path), pagesize=letter,
        title='SEO changelog: %s' % d['page_name'], author='Rihla',
        subject='SEO changes to %s' % d['page_url'],
    )
    bottom = 0.86 * inch
    first = Frame(MARGIN_X, bottom, CONTENT_W, PAGE_H - BAND_H - bottom - 0.24 * inch, id='first', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    later = Frame(MARGIN_X, bottom, CONTENT_W, PAGE_H - bottom - 0.86 * inch, id='later', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id='First', frames=[first], onPage=first_page),
        PageTemplate(id='Later', frames=[later], onPage=later_page),
    ])

    story = [NextPageTemplate('Later')]

    def section(eyebrow, title, intro=None):
        block = [Paragraph(fmt(eyebrow.upper()), ST['eyebrow']), Spacer(1, 2),
                 Paragraph(fmt(title), ST['section']), Spacer(1, 5)]
        if intro:
            block += [Paragraph(fmt(intro), ST['body']), Spacer(1, 7)]
        return block

    # ── In short ────────────────────────────────────────────────────────────
    story += section('Summary', 'In short')
    for line in d['in_short']:
        story.append(Paragraph(fmt(line), ST['bullet'], bulletText='•'))
    story.append(Spacer(1, 12))

    # ── Scorecard ───────────────────────────────────────────────────────────
    rows = [[Paragraph('WHAT', ST['th']), Paragraph('BEFORE', ST['th']), Paragraph('AFTER', ST['th'])]]
    for r in d['scorecard']:
        rows.append([Paragraph(fmt(r['metric']), ST['td_bold']), Paragraph(fmt(r['before']), ST['td']), Paragraph(fmt(r['after']), ST['td'])])
    t = Table(rows, colWidths=[CONTENT_W * 0.27, CONTENT_W * 0.33, CONTENT_W * 0.40], repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TINT),
        ('LINEBELOW', (0, 0), (-1, 0), 0.8, GOLD),
        ('LINEBELOW', (0, 1), (-1, -1), 0.4, RULE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story += [CondPageBreak(2.2 * inch)] + section('Scorecard', 'Before and after') + [t, Spacer(1, 16)]

    # ── Needs you ───────────────────────────────────────────────────────────
    story += [CondPageBreak(2.4 * inch)]
    story += section('Needs you', 'What I could not do for you', d.get('needs_you_intro'))
    for item in d['needs_you']:
        color = PRIORITY[item['priority']]
        prio = ParagraphStyle('p', parent=ST['prio'], textColor=color)
        inner = [Paragraph(item['priority'].upper(), prio), Spacer(1, 1.5),
                 Paragraph(fmt(item['title']), ST['item_title']), Spacer(1, 3),
                 Paragraph(fmt(item['detail']), ST['body'])]
        if item.get('action'):
            inner += [Spacer(1, 4), Paragraph('<b>What to do.</b> ' + fmt(item['action']), ST['action'])]
        if item.get('effort'):
            inner += [Spacer(1, 3), Paragraph('Effort: ' + fmt(item['effort']), ST['small'])]
        box = Table([['', inner]], colWidths=[4, CONTENT_W - 4])
        box.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, 0), color),
            ('BACKGROUND', (1, 0), (1, 0), TINT),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (0, 0), 0), ('RIGHTPADDING', (0, 0), (0, 0), 0),
            ('LEFTPADDING', (1, 0), (1, 0), 11), ('RIGHTPADDING', (1, 0), (1, 0), 11),
            ('TOPPADDING', (0, 0), (-1, -1), 9), ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
        ]))
        story += [KeepTogether([box]), Spacer(1, 7)]
    story.append(Spacer(1, 9))

    # ── What changed ────────────────────────────────────────────────────────
    story += [CondPageBreak(2.6 * inch)]
    story += section('Changelog', 'What changed on the branch', d.get('changes_intro'))
    n = 0
    for area in ('Technical', 'Text', 'Tracking'):
        items = [c for c in d['changes'] if c['area'] == area]
        if not items:
            continue
        head = ParagraphStyle('g', parent=ST['group'], textColor=AREA_COLOR[area])
        story += [CondPageBreak(1.6 * inch), Paragraph('%s  <font name="Body" size="8.6" color="#5B6779">%d change%s</font>' % (area, len(items), '' if len(items) == 1 else 's'), head), Spacer(1, 2)]
        rule = Table([['']], colWidths=[CONTENT_W], rowHeights=[1.2])
        rule.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), AREA_COLOR[area])]))
        story += [rule, Spacer(1, 7)]
        for c in items:
            n += 1
            block = [Paragraph('%d.  %s' % (n, fmt(c['title'])), ST['item_title']), Spacer(1, 2.5),
                     Paragraph(fmt(c['why']), ST['body'])]
            ba = []
            if c.get('before') is not None:
                ba.append([Paragraph('BEFORE', ST['label']), Paragraph(fmt(c['before'], 7.7), ST['code'])])
            if c.get('after') is not None:
                ba.append([Paragraph('AFTER', ST['label']), Paragraph(fmt(c['after'], 7.7), ST['code'])])
            if ba:
                tb = Table(ba, colWidths=[46, CONTENT_W - 46])
                tb.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), CODE_BG),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('LINEBELOW', (0, 0), (-1, -2), 0.4, colors.white),
                    ('TOPPADDING', (0, 0), (-1, -1), 4.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
                    ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
                ]))
                block += [Spacer(1, 5), tb]
            if c.get('note'):
                block += [Spacer(1, 4), Paragraph(fmt(c['note']), ST['note'])]
            block.append(Spacer(1, 11))
            story.append(KeepTogether(block))
        story.append(Spacer(1, 4))

    # ── Left alone ──────────────────────────────────────────────────────────
    if d.get('left_alone'):
        story += [CondPageBreak(2 * inch)]
        story += section('Checked', 'Looked at and left alone')
        for line in d['left_alone']:
            story.append(Paragraph(fmt(line), ST['bullet'], bulletText='•'))
        story.append(Spacer(1, 14))

    # ── How to check ────────────────────────────────────────────────────────
    if d.get('verify'):
        story += [CondPageBreak(2 * inch)]
        story += section('After you publish', 'How to check it worked', d.get('verify_intro'))
        for i, line in enumerate(d['verify'], 1):
            story.append(Paragraph(fmt(line), ST['bullet'], bulletText='%d.' % i))
        story.append(Spacer(1, 14))

    # ── Files ───────────────────────────────────────────────────────────────
    if d.get('files'):
        rows = [[Paragraph('FILE', ST['th']), Paragraph('WHAT CHANGED', ST['th'])]]
        for f in d['files']:
            rows.append([Paragraph(fmt(f['path'], 7.7), ST['code']), Paragraph(fmt(f['change']), ST['td'])])
        ft = Table(rows, colWidths=[CONTENT_W * 0.34, CONTENT_W * 0.66], repeatRows=1)
        ft.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), TINT),
            ('LINEBELOW', (0, 0), (-1, 0), 0.8, GOLD),
            ('LINEBELOW', (0, 1), (-1, -1), 0.4, RULE),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
            ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        story += [CondPageBreak(2 * inch)] + section('Files', 'Files touched') + [ft, Spacer(1, 14)]

    # ── Method and limits ───────────────────────────────────────────────────
    if d.get('method'):
        story += [CondPageBreak(1.6 * inch)]
        story += section('Method', 'How this was measured, and what was not')
        for line in d['method']:
            story.append(Paragraph(fmt(line, 7.6), ParagraphStyle('m', parent=ST['small'], leftIndent=12, spaceAfter=3.5), bulletText='•'))

    doc.build(story, canvasmaker=NumberedCanvas)
    return out_path


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: build_changelog.py seo/changelogs/src/<page>.json')
    print('wrote', build(sys.argv[1]))
