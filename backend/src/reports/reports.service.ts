import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { DataSource, Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { Profile, Reminder, Report, TestResult } from '../entities';
import { ProfilesService } from '../profiles/profiles.service';
import { ConfirmReportDto } from './reports.dto';
import { buildSummaryPdf } from './summary-pdf';
import { Point, trendOf } from './trends';

const DEMO_MIME = 'demo/none';
const ORDER: Record<string, number> = { critical: 0, high: 1, low: 1, borderline: 2, normal: 3 };
const DISCLAIMER_BN =
  'এটি শুধু তথ্য দেওয়ার জন্য, রোগ নির্ণয় বা চিকিৎসার বিকল্প নয়। সিদ্ধান্ত নেওয়ার আগে একজন রেজিস্টার্ড ডাক্তারের পরামর্শ নিন।';

/** Decide the real file type from its first bytes, so a renamed file can't sneak through. */
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 4 && buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length > 4 && buf.subarray(0, 4).toString() === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

@Injectable()
export class ReportsService {
  private uploadDir: string;
  constructor(
    @InjectRepository(Report) private reports: Repository<Report>,
    @InjectRepository(TestResult) private results: Repository<TestResult>,
    @InjectRepository(Reminder) private reminders: Repository<Reminder>,
    private profiles: ProfilesService,
    private ai: AiService,
    private ds: DataSource,
    cfg: ConfigService,
  ) { this.uploadDir = cfg.get('UPLOAD_DIR') || './uploads'; }

  // ---------- step 1: upload and let the AI read it ----------
  async upload(userId: string, profileId: string, file?: Express.Multer.File) {
    const profile = await this.profiles.getOwned(userId, profileId);
    if (!file) throw new BadRequestException('Please choose a file to upload.');
    const kind = sniff(file.buffer);
    if (!kind) throw new BadRequestException('Please upload a JPG, PNG or PDF file.');

    const extracted = await this.ai.extract(file.buffer, kind.mime, `report.${kind.ext}`);

    await fs.mkdir(this.uploadDir, { recursive: true });
    const filePath = join(this.uploadDir, `${randomUUID()}.${kind.ext}`);
    await fs.writeFile(filePath, file.buffer);

    const report = await this.reports.save(this.reports.create({
      profileId: profile.id, status: 'DRAFT', filePath, fileMime: kind.mime,
      quality: extracted.quality ?? null,
      draft: { tests: extracted.tests, message: extracted.message ?? null, extractor: extracted.extractor, meta: extracted.meta ?? null },
      // The report date and lab name read from the header: only suggestions, the user checks them before confirming.
      reportDate: /^\d{4}-\d{2}-\d{2}$/.test(extracted.meta?.report_date ?? '') ? extracted.meta.report_date : null,
      labName: typeof extracted.meta?.lab_name === 'string' ? extracted.meta.lab_name.slice(0, 120) : null,
    }));
    return this.view(report, []);
  }

  // ---------- step 2: user confirmed the values, interpret and save ----------
  async confirm(userId: string, reportId: string, dto: ConfirmReportDto) {
    const report = await this.getOwned(userId, reportId);
    const profile = await this.profiles.getOwned(userId, report.profileId);

    const codes = dto.tests.map((t) => t.code);
    if (new Set(codes).size !== codes.length) throw new BadRequestException('Each test can appear only once.');

    const out = await this.ai.interpret(
      dto.tests.map((t) => ({ code: t.code, value: t.value, printed_low: t.printedLow ?? null, printed_high: t.printedHigh ?? null })),
      profile.sex,
      profile.birthDate ? Math.floor((Date.now() - new Date(profile.birthDate).getTime()) / (365.25 * 86400_000)) : null,
    );
    if (!out.results?.length) throw new BadRequestException('None of these tests are supported yet.');

    const rows = await this.ds.transaction(async (tx) => {
      await tx.delete(TestResult, { reportId });          // confirming again replaces the old results
      await tx.delete(Reminder, { reportId });
      const saved = await tx.save(TestResult, out.results.map((r: any) => tx.create(TestResult, {
        reportId, code: r.code, name: r.name, nameBn: r.name_bn, value: r.value, unit: r.unit,
        rangeLow: r.low ?? null, rangeHigh: r.high ?? null, rangeSource: r.range_source ?? null,
        status: r.status, direction: r.direction || null, reason: r.reason, explanationBn: r.explanation_bn,
      })));
      report.status = 'CONFIRMED';
      report.reportDate = dto.reportDate ?? report.reportDate ?? new Date().toISOString().slice(0, 10);
      report.labName = dto.labName ?? report.labName;
      report.nextStep = out.next_step;
      report.summaryBn = out.summary_bn;
      report.warnings = out.warnings?.length ? out.warnings : null;
      await tx.save(Report, report);

      const rem = this.autoReminder(userId, profile, report, out);
      if (rem) await tx.save(Reminder, tx.create(Reminder, rem));
      return saved;
    });
    return this.view(report, rows);
  }

  private autoReminder(userId: string, profile: Profile, report: Report, out: any) {
    const urgency = out.next_step?.urgency;
    const days = ({ urgent: 3, soon: 14, routine: 90 } as Record<string, number>)[urgency];
    if (!days) return null;
    const names = out.results.filter((r: any) => r.status !== 'normal').map((r: any) => r.name_bn || r.name).slice(0, 4).join(', ');
    const title = urgency === 'routine' ? `আবার পরীক্ষা করে দেখুন: ${names}` : `ডাক্তারের সাথে কথা বলুন: ${names}`;
    const due = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
    return { userId, profileId: profile.id, title, dueDate: due, reportId: report.id, done: false };
  }

  // ---------- reading ----------
  async getOwned(userId: string, reportId: string) {
    const r = await this.reports.findOne({ where: { id: reportId }, relations: { profile: true } });
    if (!r || r.profile.userId !== userId) throw new NotFoundException('Report not found.');
    return r;
  }

  async get(userId: string, reportId: string) {
    const r = await this.getOwned(userId, reportId);
    return this.view(r, await this.results.find({ where: { reportId } }));
  }

  async history(userId: string, profileId: string) {
    await this.profiles.getOwned(userId, profileId);
    const list = await this.reports.find({ where: { profileId }, relations: { results: true }, order: { createdAt: 'DESC' } });
    return list.map((r) => ({
      id: r.id, status: r.status, reportDate: r.reportDate, labName: r.labName, createdAt: r.createdAt,
      testCount: r.results.length, flaggedCount: r.results.filter((t) => t.status !== 'normal').length,
      urgency: r.nextStep?.urgency ?? null, summaryBn: r.summaryBn,
    })).sort((a, b) => (b.reportDate ?? b.createdAt.toISOString()).localeCompare(a.reportDate ?? a.createdAt.toISOString()));
  }

  async remove(userId: string, reportId: string) {
    const r = await this.getOwned(userId, reportId);
    await this.reports.remove(r);
    if (r.fileMime !== DEMO_MIME) await fs.rm(r.filePath, { force: true });
    return { deleted: true };
  }

  async file(userId: string, reportId: string) {
    const r = await this.getOwned(userId, reportId);
    if (r.fileMime === DEMO_MIME) throw new NotFoundException('Demo reports have no original file.');
    return { path: join(process.cwd(), r.filePath), mime: r.fileMime };
  }

  // ---------- trends over time ----------
  private async points(profileId: string, code?: string) {
    const qb = this.results.createQueryBuilder('t')
      .innerJoinAndSelect('t.report', 'r')
      .where('r.profileId = :profileId AND r.status = :s', { profileId, s: 'CONFIRMED' });
    if (code) qb.andWhere('t.code = :code', { code });
    const rows = await qb.getMany();
    const byCode: Record<string, { name: string; nameBn: string; unit: string; points: Point[] }> = {};
    for (const t of rows) {
      const g = (byCode[t.code] ??= { name: t.name, nameBn: t.nameBn, unit: t.unit, points: [] });
      g.points.push({
        date: t.report.reportDate ?? t.report.createdAt.toISOString().slice(0, 10),
        value: t.value, status: t.status, rangeLow: t.rangeLow, rangeHigh: t.rangeHigh, reportId: t.reportId,
      });
    }
    for (const g of Object.values(byCode)) g.points.sort((a, b) => a.date.localeCompare(b.date));
    return byCode;
  }

  async trends(userId: string, profileId: string, code?: string) {
    await this.profiles.getOwned(userId, profileId);
    const byCode = await this.points(profileId, code);
    return Object.entries(byCode).map(([c, g]) => ({
      code: c, name: g.name, nameBn: g.nameBn, unit: g.unit, points: g.points,
      latest: g.points[g.points.length - 1], ...trendOf(g.points),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---------- doctor summary ----------
  async summaryPdf(userId: string, reportId: string) {
    const report = await this.getOwned(userId, reportId);
    if (report.status !== 'CONFIRMED') throw new BadRequestException('Confirm the report values first.');
    const results = (await this.results.find({ where: { reportId } })).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    const all = await this.points(report.profileId);
    const reportDate = report.reportDate ?? report.createdAt.toISOString().slice(0, 10);
    const previous: Record<string, { date: string; value: number }[]> = {};
    for (const r of results) {
      previous[r.code] = (all[r.code]?.points ?? []).filter((p) => p.reportId !== reportId && p.date <= reportDate)
        .map((p) => ({ date: p.date, value: p.value }));
    }
    return buildSummaryPdf(report.profile, report, results, previous);
  }

  private view(report: Report, results: TestResult[]) {
    const sorted = [...results].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    const { profile, results: _r, filePath, ...rest } = report as any;
    return { ...rest, results: sorted, disclaimerBn: DISCLAIMER_BN };
  }

  // ---------- share with a doctor (read-only link) ----------
  async share(userId: string, reportId: string, days = 7) {
    const r = await this.getOwned(userId, reportId);
    if (r.status !== 'CONFIRMED') throw new BadRequestException('Confirm the report values first.');
    r.shareToken = randomBytes(24).toString('base64url');
    r.shareExpires = new Date(Date.now() + days * 86400_000);
    await this.reports.save(r);
    return { token: r.shareToken, expiresAt: r.shareExpires };
  }

  async unshare(userId: string, reportId: string) {
    const r = await this.getOwned(userId, reportId);
    r.shareToken = null; r.shareExpires = null;
    await this.reports.save(r);
    return { ok: true };
  }

  private async bySharedToken(token: string) {
    const r = await this.reports.findOne({ where: { shareToken: token }, relations: { profile: true } });
    if (!r || !r.shareExpires || r.shareExpires < new Date()) throw new NotFoundException('This link has expired or was turned off.');
    return r;
  }

  /** What a doctor sees: results and the patient's first name, sex and age. No email, phone or account details. */
  async shared(token: string) {
    const r = await this.bySharedToken(token);
    const results = (await this.results.find({ where: { reportId: r.id } })).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    return {
      patient: { name: r.profile.name, sex: r.profile.sex, birthDate: r.profile.birthDate },
      reportDate: r.reportDate, labName: r.labName, nextStep: r.nextStep, warnings: r.warnings, expiresAt: r.shareExpires,
      results: results.map((t) => ({
        code: t.code, name: t.name, value: t.value, unit: t.unit, rangeLow: t.rangeLow, rangeHigh: t.rangeHigh,
        status: t.status, reason: t.reason,
      })),
    };
  }

  async sharedPdf(token: string) {
    const r = await this.bySharedToken(token);
    return this.summaryPdf(r.profile.userId, r.id);
  }

  // ---------- demo data for presentations ----------
  async seedDemo(userId: string) {
    const existing = await this.profiles.list(userId);
    if (existing.some((p) => p.name.endsWith('(demo)'))) throw new ForbiddenException('Demo data is already loaded.');
    const profile = await this.profiles.create(userId, { name: 'Rahim Uddin (demo)', relation: 'father', sex: 'male', birthDate: '1975-03-10' });
    const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
    const steps: [number, string, Record<string, number>][] = [
      [330, 'Square Hospital Lab', { hemoglobin: 12.4, wbc: 7.2, platelets: 250, fbs: 7.8, hba1c: 8.1, cholesterol: 245, ldl: 165, hdl: 38, triglycerides: 210, creatinine: 1.0, alt: 52, vitamin_d: 14 }],
      [220, 'Popular Diagnostic', { hemoglobin: 12.9, wbc: 7.0, platelets: 262, fbs: 7.2, hba1c: 7.4, cholesterol: 225, ldl: 150, hdl: 40, triglycerides: 190, creatinine: 1.0, alt: 48, vitamin_d: 18 }],
      [110, 'Popular Diagnostic', { hemoglobin: 13.4, wbc: 7.4, platelets: 255, fbs: 6.6, hba1c: 6.8, cholesterol: 205, ldl: 128, hdl: 42, triglycerides: 165, creatinine: 0.9, alt: 38, vitamin_d: 24 }],
      [14, 'Square Hospital Lab', { hemoglobin: 13.9, wbc: 7.1, platelets: 268, fbs: 5.9, hba1c: 6.1, cholesterol: 190, ldl: 112, hdl: 45, triglycerides: 150, creatinine: 0.9, alt: 34, vitamin_d: 31 }],
    ];
    for (const [ago, lab, vals] of steps) {
      const rep = await this.reports.save(this.reports.create({
        profileId: profile.id, status: 'DRAFT', filePath: '', fileMime: DEMO_MIME, quality: null, draft: { tests: [], message: null },
      }));
      await this.confirm(userId, rep.id, { reportDate: day(ago), labName: lab, tests: Object.entries(vals).map(([code, value]) => ({ code, value })) } as any);
      if (ago !== 14) await this.reminders.delete({ reportId: rep.id }); // only the newest report keeps its reminder
    }
    return { profileId: profile.id };
  }
}
