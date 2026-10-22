/**
 * End-to-end test. Needs: PostgreSQL (see .env) and the Python AI service running on AI_SERVICE_URL.
 * Run:  npm run test:e2e
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

const SAMPLE = join(__dirname, '..', '..', 'samples', 'sample_report.jpg');

describe('MediLens backend', () => {
  let app: INestApplication;
  let http: any;
  const email = `joy${Date.now()}@example.com`;
  let token = '', otherToken = '';
  let selfId = '', motherId = '', reportId = '';
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    setupApp(app);
    await app.init();
    http = app.getHttpServer();
  });
  afterAll(async () => { await app.close(); });

  it('rejects requests without a token', async () => {
    await request(http).get('/profiles').expect(401);
  });

  it('registers, blocks duplicates, logs in', async () => {
    const r = await request(http).post('/auth/register').send({ name: 'Joy', email, password: 'password123' }).expect(201);
    token = r.body.token;
    await request(http).post('/auth/register').send({ name: 'Joy', email, password: 'password123' }).expect(409);
    await request(http).post('/auth/login').send({ email, password: 'wrongwrong' }).expect(401);
    await request(http).post('/auth/login').send({ email, password: 'password123' }).expect(201);
    await request(http).get('/auth/me').set(auth()).expect(200);
    const o = await request(http).post('/auth/register')
      .send({ name: 'Other', email: `o${Date.now()}@example.com`, password: 'password123' }).expect(201);
    otherToken = o.body.token;
  });

  it('has a self profile and can add family members', async () => {
    const list = await request(http).get('/profiles').set(auth()).expect(200);
    expect(list.body).toHaveLength(1);
    selfId = list.body[0].id;
    const m = await request(http).post('/profiles').set(auth())
      .send({ name: 'Rahima Begum', relation: 'mother', sex: 'female' }).expect(201);
    motherId = m.body.id;
    await request(http).post('/profiles').set(auth()).send({ name: 'x', sex: 'other' }).expect(400);
  });

  it("does not let another user touch my family's data", async () => {
    await request(http).get(`/profiles/${motherId}/reports`).set(auth(otherToken)).expect(404);
    await request(http).patch(`/profiles/${motherId}`).set(auth(otherToken)).send({ name: 'hacked' }).expect(404);
  });

  it('rejects files that are not JPG, PNG or PDF', async () => {
    await request(http).post(`/profiles/${motherId}/reports`).set(auth())
      .attach('file', Buffer.from('hello, not an image'), 'fake.jpg').expect(400);
  });

  it('uploads a report photo and returns the values the AI read', async () => {
    const r = await request(http).post(`/profiles/${motherId}/reports`).set(auth())
      .attach('file', readFileSync(SAMPLE), 'report.jpg').expect(201);
    reportId = r.body.id;
    expect(r.body.status).toBe('DRAFT');
    expect(r.body.draft.tests.length).toBeGreaterThan(5);
    expect(r.body.filePath).toBeUndefined();
  });

  it('confirms the values and stores Bangla explanations', async () => {
    const draft = (await request(http).get(`/reports/${reportId}`).set(auth())).body.draft.tests;
    const tests = draft.map((t: any) => ({ code: t.code, value: t.value, printedLow: t.printed_low, printedHigh: t.printed_high }));
    const r = await request(http).post(`/reports/${reportId}/confirm`).set(auth())
      .send({ tests, reportDate: '2026-01-10', labName: 'Test Lab' }).expect(201);
    expect(r.body.status).toBe('CONFIRMED');
    expect(r.body.results.length).toBe(tests.length);
    expect(r.body.results[0].explanationBn).toMatch(/[ঀ-৿]/);
    expect(r.body.summaryBn).toMatch(/[ঀ-৿]/);
    expect(r.body.disclaimerBn).toBeTruthy();
  });

  it('builds history and a trend after a second report', async () => {
    const second = await request(http).post(`/profiles/${motherId}/reports`).set(auth())
      .attach('file', readFileSync(SAMPLE), 'report.jpg').expect(201);
    await request(http).post(`/reports/${second.body.id}/confirm`).set(auth())
      .send({ reportDate: '2026-06-10', tests: [{ code: 'hba1c', value: 6.2 }, { code: 'fbs', value: 5.0 }] }).expect(201);
    await request(http).post(`/reports/${reportId}/confirm`).set(auth()).send({
      reportDate: '2026-01-10', tests: [{ code: 'hba1c', value: 7.4 }, { code: 'fbs', value: 8.1 }],
    }).expect(201);

    const hist = await request(http).get(`/profiles/${motherId}/reports`).set(auth()).expect(200);
    expect(hist.body.map((h: any) => h.reportDate)).toEqual(['2026-06-10', '2026-01-10']);

    const t = await request(http).get(`/profiles/${motherId}/trends?code=hba1c`).set(auth()).expect(200);
    expect(t.body[0].points.map((p: any) => p.value)).toEqual([7.4, 6.2]);
    expect(t.body[0].trend).toBe('improving');
  });

  it('rejects unknown tests and duplicates', async () => {
    await request(http).post(`/reports/${reportId}/confirm`).set(auth())
      .send({ tests: [{ code: 'not_a_test', value: 1 }] }).expect(400);
    await request(http).post(`/reports/${reportId}/confirm`).set(auth())
      .send({ tests: [{ code: 'fbs', value: 5 }, { code: 'fbs', value: 6 }] }).expect(400);
  });

  it('creates a follow-up reminder automatically and supports reminder CRUD', async () => {
    const list = await request(http).get(`/reminders?profileId=${motherId}&pending=true`).set(auth()).expect(200);
    expect(list.body.length).toBeGreaterThan(0);
    const id = list.body[0].id;
    await request(http).patch(`/reminders/${id}`).set(auth()).send({ done: true }).expect(200);
    await request(http).patch(`/reminders/${id}`).set(auth(otherToken)).send({ done: true }).expect(404);
    const c = await request(http).post('/reminders').set(auth())
      .send({ profileId: selfId, title: 'Repeat HbA1c', dueDate: '2026-12-01' }).expect(201);
    await request(http).delete(`/reminders/${c.body.id}`).set(auth()).expect(200);
  });

  it('produces the doctor summary PDF', async () => {
    const r = await request(http).get(`/reports/${reportId}/summary.pdf`).set(auth())
      .buffer().parse((res: any, cb: any) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); })
      .expect(200);
    expect(r.headers['content-type']).toContain('application/pdf');
    expect((r.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    await request(http).get(`/reports/${reportId}/summary.pdf`).set(auth(otherToken)).expect(404);
  });

  it('deletes a report', async () => {
    await request(http).delete(`/reports/${reportId}`).set(auth()).expect(200);
    await request(http).get(`/reports/${reportId}`).set(auth()).expect(404);
  });
});
