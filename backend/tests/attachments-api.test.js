import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env.js';
import { createAttachmentRepository } from '../src/repositories/attachments.repository.js';
import { deleteAttachmentRecord } from '../src/services/attachments.service.js';
import { setupAdminApp } from './helpers/admin.js';

const apps = [];
after(async () => {
  await Promise.all(apps.map((app) => app.close()));
});

async function setup() {
  const app = await setupAdminApp();
  apps.push(app);
  return app;
}

function insertAttachment(repository, pqrsId, storageId, visibility, uploadedBy) {
  return repository.insert({
    pqrsId,
    storageId,
    originalName: `${visibility}.txt`,
    safeName: `${storageId}.txt`,
    mimeType: 'text/plain',
    extension: '.txt',
    sizeBytes: 4,
    visibility,
    uploadedBy,
    uploadedAt: '2026-11-02T12:00:00.000Z',
  });
}

test('public attachment listing requires verified email and excludes internal metadata', async () => {
  const app = await setup();
  const [request] = app.addRequests(1);
  const repository = createAttachmentRepository(app.db);
  insertAttachment(repository, request.id, 'public-file', 'public', 'citizen');
  insertAttachment(repository, request.id, 'internal-file', 'internal', 'staff');

  const client = app.client();
  assert.equal((await client.get(`/api/pqrs/${request.caseNumber}/attachments`)).status, 404);
  assert.equal(
    (
      await client.get(
        `/api/pqrs/${request.caseNumber}/attachments?requesterEmail=${encodeURIComponent(request.requesterEmail)}`,
      )
    ).status,
    404,
  );

  const listed = await client.get(`/api/pqrs/${request.caseNumber}/attachments`, {
    headers: { 'X-Requester-Email': request.requesterEmail },
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get('cache-control'), 'no-store');
  assert.deepEqual(
    listed.json.data.map(({ name }) => name),
    ['public.txt'],
  );
  assert.doesNotMatch(listed.text, /internal\.txt|uploadedBy|visibility/);
});

test('public attachment upload requires the matching requester email', async () => {
  const app = await setup();
  const [request] = app.addRequests(1);
  const before = app.db.prepare('SELECT COUNT(*) AS count FROM attachments').get().count;
  const form = new FormData();
  form.append('files', new Blob(['safe file content'], { type: 'text/plain' }), 'evidence.txt');

  const denied = await fetch(`${app.baseUrl}/api/pqrs/${request.caseNumber}/attachments`, {
    method: 'POST',
    body: form,
  });
  assert.equal(denied.status, 404);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS count FROM attachments').get().count, before);

  form.append('requesterEmail', request.requesterEmail);
  const accepted = await fetch(`${app.baseUrl}/api/pqrs/${request.caseNumber}/attachments`, {
    method: 'POST',
    body: form,
  });
  assert.equal(accepted.status, 201);
  const uploaded = await accepted.json();
  assert.equal(uploaded.data.length, 1);
  assert.equal(uploaded.data[0].name, 'evidence.txt');

  const attachmentId = uploaded.data[0].id;
  deleteAttachmentRecord({
    repository: createAttachmentRepository(app.db),
    storageDir: env.attachments.storageDir,
    attachmentId,
  });
});
