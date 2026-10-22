import PDFDocument from 'pdfkit';
import { Profile, Report, TestResult } from '../entities';

const STATUS_LABEL: Record<string, string> = {
  normal: 'Normal', borderline: 'Borderline', low: 'LOW', high: 'HIGH', critical: 'CRITICAL',
};

function age(birth: string | null): string {
  if (!birth) return 'not given';
  const years = Math.floor((Date.now() - new Date(birth).getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${years} years`;
}

function rangeText(r: TestResult): string {
  if (r.rangeLow != null && r.rangeHigh != null) return `${r.rangeLow} - ${r.rangeHigh}`;
  if (r.rangeHigh != null) return `< ${r.rangeHigh}`;
  if (r.rangeLow != null) return `> ${r.rangeLow}`;
  return '-';
}

const TEAL = '#0e6e8c';
const INK = '#1a2b33';
const MUTED = '#5b6b73';
const LINE = '#d9e1e5';
const STATUS_COLOR: Record<string, string> = { low: '#b42318', high: '#b42318', critical: '#b42318', borderline: '#a86a00', normal: '#2b7a4b' };
const STATUS_BG: Record<string, string> = { low: '#fdecea', high: '#fdecea', critical: '#fdecea', borderline: '#fff4dc', normal: '#ffffff' };

const M = 40;            // page margin
const W = 595.28 - M * 2; // usable width
const COLS = [
  { key: 'name', x: 0, w: 190, label: 'Test' },
  { key: 'value', x: 190, w: 80, label: 'Result', align: 'right' as const },
  { key: 'unit', x: 278, w: 70, label: 'Unit' },
  { key: 'range', x: 348, w: 90, label: 'Reference' },
  { key: 'status', x: 438, w: W - 438, label: 'Status' },
];

/** previous: earlier readings per test code (oldest first), used to show change over time. */
export function buildSummaryPdf(
  profile: Profile, report: Report, results: TestResult[], previous: Record<string, { date: string; value: number }[]>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const bottom = () => doc.page.height - 60;
    const ensure = (h: number) => { if (doc.y + h > bottom()) { doc.addPage(); doc.y = M; } };

    // ---- header band
    doc.rect(0, 0, doc.page.width, 78).fill(TEAL);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('MediLens', M, 22);
    doc.font('Helvetica').fontSize(10).fillColor('#d6eaf0').text('Lab report summary for the treating doctor', M, 48);
    doc.font('Helvetica').fontSize(9).fillColor('#d6eaf0')
      .text(`Generated ${new Date().toISOString().slice(0, 10)}`, M, 30, { width: W, align: 'right' });

    // ---- patient box
    let y = 96;
    doc.roundedRect(M, y, W, 78, 6).lineWidth(0.8).strokeColor(LINE).stroke();
    const cell = (label: string, value: string, cx: number, cy: number, w: number) => {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), cx, cy, { width: w });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(value, cx, cy + 11, { width: w });
    };
    cell('Patient', profile.name, M + 14, y + 12, 230);
    cell('Sex', profile.sex ? profile.sex[0].toUpperCase() + profile.sex.slice(1) : 'Not given', M + 270, y + 12, 100);
    cell('Age', age(profile.birthDate), M + 400, y + 12, 100);
    cell('Report date', report.reportDate ?? 'Not given', M + 14, y + 45, 230);
    cell('Laboratory', report.labName ?? 'Not given', M + 270, y + 45, 230);

    // ---- headline
    const flagged = results.filter((r) => r.status !== 'normal');
    const normal = results.filter((r) => r.status === 'normal');
    y += 94;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK)
      .text(`${results.length} tests reviewed: `, M, y, { continued: true })
      .fillColor(flagged.length ? '#b42318' : '#2b7a4b')
      .text(flagged.length ? `${flagged.length} outside the reference range` : 'all within the reference range', { continued: true })
      .fillColor(INK).text('');
    doc.y = y + 26;

    const header = () => {
      const top = doc.y;
      doc.rect(M, top, W, 20).fill('#eef3f5');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED);
      COLS.forEach((c) => doc.text(c.label.toUpperCase(), M + c.x + 6, top + 6, { width: c.w - 12, align: c.align ?? 'left' }));
      doc.y = top + 20;
    };
    const row = (r: TestResult, extra?: string[]) => {
      const lines = extra ?? [];
      const textH = lines.reduce((h, l) => h + doc.font('Helvetica').fontSize(8.5).heightOfString(l, { width: W - 24 }) + 2, 0);
      const h = 22 + (lines.length ? textH + 4 : 0);
      ensure(h + 20);
      if (doc.y < M + 1) header();
      const top = doc.y;
      if (r.status !== 'normal') doc.rect(M, top, W, h).fill(STATUS_BG[r.status]);
      const cy = top + 6;
      const cells: Record<string, string> = {
        name: r.name, value: String(r.value), unit: r.unit, range: rangeText(r), status: STATUS_LABEL[r.status],
      };
      COLS.forEach((c) => {
        const bold = c.key === 'value' || c.key === 'status' || (c.key === 'name' && r.status !== 'normal');
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
          .fillColor(c.key === 'status' || (c.key === 'value' && r.status !== 'normal') ? STATUS_COLOR[r.status] : INK)
          .text(cells[c.key], M + c.x + 6, cy, { width: c.w - 12, align: c.align ?? 'left', lineBreak: false, ellipsis: true });
      });
      let ty = top + 22;
      lines.forEach((l) => {
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(l, M + 12, ty, { width: W - 24 });
        ty += doc.heightOfString(l, { width: W - 24 }) + 2;
      });
      doc.moveTo(M, top + h).lineTo(M + W, top + h).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.y = top + h;
    };
    const section = (title: string) => {
      ensure(70);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(TEAL).text(title, M, doc.y + 8, { width: W });
      doc.y += 8; header();
    };

    // ---- flagged
    section('Results outside the reference range');
    if (!flagged.length) { doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('None.', M + 6, doc.y + 6); doc.y += 24; }
    for (const r of flagged) {
      const extra = [r.reason.replace(/your report/g, 'the report')];
      const hist = (previous[r.code] || []).slice(-3);
      if (hist.length) extra.push('Earlier readings: ' + hist.map((h) => `${h.value} (${h.date})`).join(',  '));
      row(r, extra);
    }

    // ---- normal
    section('Results within the reference range');
    if (!normal.length) { doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('None.', M + 6, doc.y + 6); doc.y += 24; }
    for (const r of normal) row(r);

    // ---- next step
    const step = report.nextStep;
    if (step?.specialist) {
      ensure(80);
      const top = doc.y + 18;
      doc.roundedRect(M, top, W, 52, 6).fillAndStroke('#eaf4f7', '#bcd9e2');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED).text('SUGGESTED NEXT STEP', M + 14, top + 10);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(`${step.specialist}  -  ${step.urgency_text}`, M + 14, top + 25, { width: W - 28 });
      doc.y = top + 62;
    }

    // ---- disclaimer
    ensure(60);
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED).text(
      'This summary was generated automatically from a laboratory report uploaded by the patient. The values were confirmed ' +
      'by the patient. It is not a diagnosis and does not replace clinical judgement. Please verify against the original laboratory report.',
      M, doc.y + 6, { width: W },
    );

    // ---- footer on every page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // footer sits inside the bottom margin; stops PDFKit adding blank pages
      doc.font('Helvetica').fontSize(8).fillColor(MUTED);
      doc.text(`MediLens  |  ${profile.name}`, M, doc.page.height - 38, { width: W / 2, lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, M + W / 2, doc.page.height - 38, { width: W / 2, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}
