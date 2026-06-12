/**
 * Chinese Business License regression suite.
 *
 * Env:
 *   CBL_REGRESSION_GENERATE=1  — auto-generate mini fixture set if missing
 *   CBL_REGRESSION_LIMIT=30    — cap documents (default 30)
 *   CBL_BENCHMARK_MODE=text    — text pipeline (default)
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { test } from 'node:test';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'testing/chinese-business-license-fixtures/manifest.json');
const REPORT_PATH = path.join(ROOT, 'reports/latest-report.md');

function runCommand(cmd: string, args: string[], env: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, ...env },
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function manifestExists(): Promise<boolean> {
  try {
    await fs.access(MANIFEST_PATH);
    return true;
  } catch {
    return false;
  }
}

test('synthetic generator produces manifest with expected styles', async () => {
  if (!(await manifestExists())) {
    if (process.env.CBL_REGRESSION_GENERATE !== '1') {
      console.log('Skipping — run CBL_REGRESSION_GENERATE=1 or npm run generate:chinese-business-license');
      return;
    }
    await runCommand('npm', ['run', 'generate:chinese-business-license'], { CBL_GEN_PER_STYLE: '2' });
  }

  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as {
    total: number;
    styles: string[];
    documents: unknown[];
  };

  assert.ok(manifest.total >= 20, `expected >=20 documents, got ${manifest.total}`);
  assert.equal(manifest.styles.length, 10);
  assert.ok(manifest.documents.length >= 20);
});

test(
  'regression benchmark produces accuracy report',
  { timeout: 600_000 },
  async () => {
    if (!(await manifestExists())) {
      await runCommand('npm', ['run', 'generate:chinese-business-license'], { CBL_GEN_PER_STYLE: '2' });
    }

    const limit = String(process.env.CBL_REGRESSION_LIMIT || 30);
    await runCommand('npm', ['run', 'benchmark:chinese-business-license'], {
      CBL_BENCHMARK_LIMIT: limit,
      CBL_BENCHMARK_MODE: process.env.CBL_BENCHMARK_MODE || 'text',
    });

    const report = await fs.readFile(REPORT_PATH, 'utf8');
    assert.ok(report.includes('Overall Accuracy'));
    assert.ok(report.includes('creditCode'));
  },
);

test(
  'clean style-a documents meet pass thresholds',
  { timeout: 120_000 },
  async () => {
    if (!(await manifestExists())) {
      await runCommand('npm', ['run', 'generate:chinese-business-license'], { CBL_GEN_PER_STYLE: '2' });
    }

    await runCommand('npm', ['run', 'benchmark:chinese-business-license'], {
      CBL_BENCHMARK_STYLE_FILTER: 'style-a',
      CBL_BENCHMARK_MODE: 'text',
      CBL_BENCHMARK_STRICT: '1',
    });
  },
);

test('unseen company names are preserved without hardcoded corrections', async () => {
  const { extractChineseBusinessLicenseFields } = await import(
    '../src/modules/extraction/chinese-business-license/chineseBusinessLicenseExtract.js'
  );

  const text = [
    '营业执照',
    '统一社会信用代码 914406067778330440',
    '名称杭州西湖云计算有限公司注册资本壹仟万元人民币',
    '类型有限责任公司成立日期2018年03月20日',
    '法定代表人赵敏住所杭州市西湖区文三路66号',
    '经营范围信息技术服务；数据处理服务',
    '登记机关杭州市市场监督管理局',
  ].join('\n');

  const result = await extractChineseBusinessLicenseFields(text, 85);
  assert.equal(result.fields.companyName.value, '杭州西湖云计算有限公司');
  assert.equal(result.fields.companyName.raw, '杭州西湖云计算有限公司');
});
