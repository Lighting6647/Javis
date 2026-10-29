import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INITIAL_PROJECTS } from '../src/data/projectsData.js';
import {
  calculateCrc16,
  generatePromptPayPayload,
  signFounderApproval,
  buildQuotationFromApproval,
} from '../src/utils/quotationGenerator.js';
import {
  SYSTEM_RUNTIMES,
  WORKSPACE_DOCTOR_ITEMS,
  calculateWorkspaceDoctorSummary,
  buildWorkspaceSnapshotManifest,
} from '../src/utils/migrationDoctor.js';
import {
  ALL_PROJECT_DESIGN_TOKENS,
  generateTailwindConfigForProject,
} from '../src/data/designTokensData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('D:\\Light Projects Data has 15 mapped applications pointing to D:\\Light', () => {
  assert.equal(INITIAL_PROJECTS.length, 15, 'Should track all 15 active projects in D:\\Light');
  for (const project of INITIAL_PROJECTS) {
    assert.ok(
      project.path.startsWith('D:\\Light\\'),
      `Project ${project.id} path (${project.path}) must start with D:\\Light\\`
    );
    assert.equal(project.gates.gate1.status, 'passed');
    assert.equal(project.gates.gate2.status, 'passed');
    assert.equal(project.gates.gate3.status, 'passed');
    assert.equal(project.gates.gate4.status, 'passed');
  }
});

test('AiCompanyHubView component contains all 6 AI departments, 8 commercial products, and Founder guardrails', () => {
  const hubFile = path.join(__dirname, '../src/components/dashboard/AiCompanyHubView.jsx');
  const content = fs.readFileSync(hubFile, 'utf8');

  const expectedDeptIds = [
    'dept-mkt',
    'dept-sales',
    'dept-onboard',
    'dept-support',
    'dept-finance',
    'dept-exec',
  ];
  for (const deptId of expectedDeptIds) {
    assert.ok(content.includes(deptId), `Missing AI department ${deptId}`);
  }

  const expectedFolders = [
    'D:\\\\Light\\\\Inventoty AI Light',
    'D:\\\\Light\\\\บัตรคอน Light',
    'D:\\\\Light\\\\Pass App Light',
    'D:\\\\Light\\\\Fitness',
    'D:\\\\Light\\\\Tracking Light',
    'D:\\\\Light\\\\บัญชี Light\\\\accounting-app',
    'D:\\\\Light\\\\IOS,Asset Light',
    'D:\\\\Light\\\\แดชบอร์ด Light',
  ];
  for (const folder of expectedFolders) {
    assert.ok(content.includes(folder), `Missing commercial product folder ${folder}`);
  }

  assert.ok(content.includes('ส่วนลดเกิน 10%'), 'Missing >10% discount guardrail check');
  assert.ok(content.includes('20,000'), 'Missing >20,000 THB/yr deal guardrail check');
  assert.ok(content.includes('JavisVoiceBar'), 'Missing JavisVoiceBar integration');
  assert.ok(content.includes('QuotationPreviewModal'), 'Missing QuotationPreviewModal integration');
});

test('Quotation Generator, PromptPay EMVCo CRC-16, and Founder Digital Signature work accurately', () => {
  const payload = generatePromptPayPayload('0899998877', 34668);
  assert.ok(payload.startsWith('000201010212'), 'PromptPay payload must start with EMVCo header');
  assert.equal(payload.slice(-4), calculateCrc16(payload.slice(0, -4)), 'CRC-16 checksum must match');

  const sig1 = signFounderApproval('AP-201', 32400, 15);
  const sig2 = signFounderApproval('AP-201', 32400, 15);
  assert.equal(sig1, sig2, 'Digital signature must be deterministic');
  assert.ok(sig1.startsWith('KROB-SIG-'), 'Signature must start with KROB-SIG-');

  const quote = buildQuotationFromApproval({
    id: 'AP-201',
    title: 'ขออนุมัติส่วนลด 15% — ลูกค้า FitLab Gym 3 สาขา',
    detail: 'ลูกค้าขอเหมาจ่ายรายปี Fitness + Pass App ยอดสุทธิ ฿32,400/ปี',
  });
  assert.equal(quote.quoteNo, 'QT-202610-201');
  assert.equal(quote.netAmount, 32400);
  assert.equal(quote.discountPercent, 15);
  assert.equal(quote.vatAmount, 2268);
  assert.equal(quote.grandTotal, 34668);
  assert.ok(quote.signature.startsWith('KROB-SIG-'));
});

test('Workspace Migration Doctor tracks all 17 folders in D:\\Light and 4 core runtimes', () => {
  assert.equal(WORKSPACE_DOCTOR_ITEMS.length, 17, 'Should track all 17 folders in D:\\Light');
  assert.equal(SYSTEM_RUNTIMES.length, 4, 'Should track Node.js, PowerShell, Git, and Python runtimes');

  const summary = calculateWorkspaceDoctorSummary();
  assert.equal(summary.totalFolders, 17);
  assert.equal(summary.readyFolders, 17);
  assert.equal(summary.overallHealthPercent, 100);

  const manifest = buildWorkspaceSnapshotManifest();
  assert.ok(manifest.snapshotId.startsWith('SNAP-DLIGHT-'));
  assert.equal(manifest.projects.length, 17);
});

test('Impeccable Design System standardizes all 17 projects with curated zero-AI-slop palettes and Tailwind configs', () => {
  assert.equal(ALL_PROJECT_DESIGN_TOKENS.length, 17, 'All 17 projects must have defined design tokens');

  for (const proj of ALL_PROJECT_DESIGN_TOKENS) {
    assert.ok(proj.name, 'Project must have a name');
    assert.ok(proj.palette.primary.startsWith('#'), `${proj.id} primary color must be a hex code`);
    assert.ok(proj.palette.accent.startsWith('#'), `${proj.id} accent color must be a hex code`);
    assert.ok(proj.palette.background.startsWith('#'), `${proj.id} background must be a hex code`);
    assert.ok(proj.typography.display, `${proj.id} must have a display font`);
    assert.equal(proj.impeccableScore, 100, `${proj.id} must have 100/100 Impeccable score`);

    const twConfig = generateTailwindConfigForProject(proj);
    assert.ok(twConfig.includes(proj.palette.primary), 'Tailwind config must include primary brand color');
    assert.ok(twConfig.includes(proj.palette.accent), 'Tailwind config must include accent brand color');
  }

  // Live Theme Preview verification
  const defaultTheme = ALL_PROJECT_DESIGN_TOKENS.find((p) => p.id === 'ceo-master');
  assert.ok(defaultTheme, 'Default CEO Master theme must exist');
  assert.equal(defaultTheme.palette.primary, '#06b6d4');
  assert.equal(defaultTheme.palette.accent, '#10b981');
});

test('J.A.R.V.I.S. MARK 3 Neural Brain processes Thai voice commands and dispatches system actions accurately', async () => {
  const { processJarvisCommand, SYSTEM_TELEMETRY } = await import('../src/utils/jarvisBrain.js');
  
  assert.equal(SYSTEM_TELEMETRY.codename, 'J.A.R.V.I.S. MARK 3');
  assert.equal(SYSTEM_TELEMETRY.status, 'ACTIVE');

  // 1. Audit Command
  const auditRes = processJarvisCommand('ช่วยตรวจระบบทั้งหมดหน่อย');
  assert.equal(auditRes.action, 'RUN_AUDIT');
  assert.ok(auditRes.reply.includes('17 โปรเจกต์'));

  // 2. POS Query
  const posRes = processJarvisCommand('ระบบ pos ขายหน้าร้านเป็นยังไง');
  assert.equal(posRes.action, 'NAV_DASHBOARD');
  assert.ok(posRes.reply.includes('฿390'));

  // 3. Ticket Query
  const ticketRes = processJarvisCommand('ดูระบบบัตรคอนเสิร์ตหน่อย');
  assert.ok(ticketRes.reply.includes('ThaiTicket'));

  // 4. Quotation Command
  const quoteRes = processJarvisCommand('ออกใบเสนอราคาพร้อมเพย์');
  assert.equal(quoteRes.action, 'OPEN_QUOTATION');

  // 5. Theme Command
  const themeRes = processJarvisCommand('สลับธีมสีแดงคอนเสิร์ต');
  assert.equal(themeRes.action, 'CHANGE_THEME');
  assert.equal(themeRes.brandId, 'concert-ticket');
});
