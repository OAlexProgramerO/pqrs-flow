import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';

const server = await startServer();
after(() => server.close());

async function get(path) {
  const res = await fetch(`${server.baseUrl}${path}`);
  return { status: res.status, body: await res.text() };
}

test('the page has the success panel and its buttons', async () => {
  const { status, body } = await get('/');

  assert.equal(status, 200);
  for (const id of ['formSection', 'successPanel', 'caseNumber', 'copyBtn', 'newRequestBtn']) {
    assert.ok(body.includes(`id="${id}"`), `missing #${id}`);
  }
});

test('the page has a hidden anti-bot field', async () => {
  const { body } = await get('/');

  assert.ok(body.includes('name="website"'));
  assert.ok(body.includes('class="hp-field"'));
});

test('the form script uses the API client and the shared rules', async () => {
  const { body } = await get('/js/form.js');

  assert.ok(body.includes("from './api.js'"));
  assert.ok(body.includes("from '/shared/validation.js'"));
});

test('the API client is served', async () => {
  const { status, body } = await get('/js/api.js');

  assert.equal(status, 200);
  assert.ok(body.includes('export class ApiError'));
  assert.ok(body.includes('export function createPqrs'));
});

test('the stylesheet has the success panel and the bot trap', async () => {
  const { body } = await get('/css/styles.css');

  assert.ok(body.includes('.success-panel'));
  assert.ok(body.includes('.hp-field'));
});
