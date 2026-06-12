import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  validateTemplateId,
  validateTemplateUpdateBody,
  resolveInlineTemplate,
  resolveRenderData,
} from '../src/common/utils/templateValidation.js';
import { TemplateRendererService } from '../src/modules/template/TemplateRendererService.js';
import { TemplateRepository } from '../src/modules/template/TemplateRepository.js';
import { TemplateService } from '../src/modules/template/TemplateService.js';
import { NotFoundError, ValidationError } from '../src/common/exceptions/AppError.js';

const prismaStub = { client: { template: { findUnique: async () => null, update: async () => ({}), upsert: async () => ({}) } } };

test('validateTemplateId rejects empty and invalid characters', () => {
  assert.throws(() => validateTemplateId(''), ValidationError);
  assert.throws(() => validateTemplateId('../etc'), ValidationError);
  assert.equal(validateTemplateId('employment-form'), 'employment-form');
});

test('validateTemplateUpdateBody rejects non-objects', () => {
  assert.throws(() => validateTemplateUpdateBody(null), /JSON object/);
  assert.throws(() => validateTemplateUpdateBody('not-json'), /JSON object/);
  assert.deepEqual(validateTemplateUpdateBody({ fields: {} }), { fields: {} });
});

test('resolveInlineTemplate accepts template or body field', () => {
  assert.equal(resolveInlineTemplate({ template: 'Hi {{name}}' }), 'Hi {{name}}');
  assert.equal(resolveInlineTemplate({ body: 'Hi {{name}}' }), 'Hi {{name}}');
  assert.throws(() => resolveInlineTemplate({}), /template/);
});

test('resolveRenderData prefers data wrapper', () => {
  assert.deepEqual(resolveRenderData({ data: { name: 'A' } }), { name: 'A' });
  assert.deepEqual(resolveRenderData({ name: 'A' }), { name: 'A' });
});

test('TemplateRepository create writes new template file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tpl-test-'));
  const repo = new TemplateRepository(prismaStub as never, dir);
  const created = await repo.create('new-template', {
    id: 'new-template',
    name: 'New Template',
    body: 'Hello {{name}}',
    fields: { name: { label: 'Name' } },
  });
  assert.equal(created.name, 'New Template');
  assert.equal(await repo.exists('new-template'), true);
  await fs.rm(dir, { recursive: true, force: true });
});

test('TemplateRepository create rejects duplicate id', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tpl-test-'));
  const repo = new TemplateRepository(prismaStub as never, dir);
  await repo.create('dup', { id: 'dup', name: 'One' });
  await assert.rejects(() => repo.create('dup', { id: 'dup', name: 'Two' }), ValidationError);
  await fs.rm(dir, { recursive: true, force: true });
});

test('TemplateRepository partial update merges with existing file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tpl-test-'));
  const id = 'test-template';
  await fs.writeFile(
    path.join(dir, `${id}.json`),
    JSON.stringify({ id, name: 'Original', fields: { a: { label: 'A' } } }),
    'utf8',
  );

  const repo = new TemplateRepository(prismaStub as never, dir);
  const updated = await repo.update(id, { name: 'Updated' });

  assert.equal(updated.name, 'Updated');
  assert.deepEqual(updated.fields, { a: { label: 'A' } });

  const onDisk = JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8'));
  assert.equal(onDisk.name, 'Updated');
  assert.deepEqual(onDisk.fields, { a: { label: 'A' } });

  await fs.rm(dir, { recursive: true, force: true });
});

test('TemplateRepository update throws NotFoundError for missing template', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tpl-test-'));
  const repo = new TemplateRepository(prismaStub as never, dir);
  await assert.rejects(() => repo.update('missing-id', { name: 'X' }), NotFoundError);
  await fs.rm(dir, { recursive: true, force: true });
});

test('TemplateService renderInline and renderById', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tpl-test-'));
  const id = 'render-test';
  await fs.writeFile(
    path.join(dir, `${id}.json`),
    JSON.stringify({ id, body: 'Hello {{name}}, passport {{passport}}' }),
    'utf8',
  );

  const repo = new TemplateRepository(prismaStub as never, dir);
  const service = new TemplateService(repo, new TemplateRendererService());

  assert.equal(
    service.renderInline({ template: 'Rank: {{rank}}', data: { rank: 'Captain' } }),
    'Rank: Captain',
  );

  const result = await service.renderById(id, { data: { name: 'John', passport: 'P1' } });
  assert.equal(result.rendered, 'Hello John, passport P1');

  await assert.rejects(
    () => service.renderById('does-not-exist', { data: {} }),
    NotFoundError,
  );

  await fs.rm(dir, { recursive: true, force: true });
});
