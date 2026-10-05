import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_FLOW,
  buildTimeline,
  describeStatus,
  describeWait,
  formatDateTime,
  typeLabel,
} from '../../frontend/js/status.js';

test('the flow follows the order of the roadmap', () => {
  assert.deepEqual(STATUS_FLOW, ['filed', 'in_progress', 'answered', 'closed']);
});

test('every status in the flow has a label and a description', () => {
  for (const status of STATUS_FLOW) {
    const info = describeStatus(status);
    assert.ok(info.label.length > 0, status);
    assert.ok(info.description.length > 0, status);
  }
});

test('an unknown status gets a safe text', () => {
  assert.equal(describeStatus('mystery').label, 'Unknown');
  assert.equal(describeStatus(undefined).label, 'Unknown');
});

test('typeLabel names the four types and keeps unknown ones as they are', () => {
  assert.equal(typeLabel('petition'), 'Petition');
  assert.equal(typeLabel('complaint'), 'Complaint');
  assert.equal(typeLabel('claim'), 'Claim');
  assert.equal(typeLabel('suggestion'), 'Suggestion');
  assert.equal(typeLabel('other'), 'other');
});

test('the timeline marks the first step as current when the request was just filed', () => {
  assert.deepEqual(
    buildTimeline('filed').map((step) => step.state),
    ['current', 'upcoming', 'upcoming', 'upcoming'],
  );
});

test('the timeline marks the earlier steps as done', () => {
  assert.deepEqual(
    buildTimeline('answered').map((step) => step.state),
    ['done', 'done', 'current', 'upcoming'],
  );
  assert.deepEqual(
    buildTimeline('closed').map((step) => step.state),
    ['done', 'done', 'done', 'current'],
  );
});

test('the timeline keeps every step even when the status is unknown', () => {
  const timeline = buildTimeline('mystery');

  assert.equal(timeline.length, 4);
  assert.ok(timeline.every((step) => step.state === 'upcoming'));
});

test('the timeline uses the labels of the statuses', () => {
  assert.deepEqual(
    buildTimeline('filed').map((step) => step.label),
    ['Received', 'In progress', 'Answered', 'Closed'],
  );
});

test('formatDateTime writes the date in words', () => {
  const text = formatDateTime('2026-10-04T15:30:00.000Z', { locale: 'en-US', timeZone: 'UTC' });

  assert.match(text, /October/);
  assert.match(text, /2026/);
});

test('formatDateTime returns an empty string for an invalid date', () => {
  assert.equal(formatDateTime('not a date'), '');
  assert.equal(formatDateTime(undefined), '');
});

test('describeWait speaks in minutes', () => {
  assert.equal(describeWait(30), 'less than a minute');
  assert.equal(describeWait(60), 'about 1 minute');
  assert.equal(describeWait(61), 'about 2 minutes');
  assert.equal(describeWait(900), 'about 15 minutes');
});

test('describeWait returns an empty string when there is nothing to say', () => {
  assert.equal(describeWait(0), '');
  assert.equal(describeWait(NaN), '');
  assert.equal(describeWait(undefined), '');
});

test('the status helpers are the same file the browser loads', async () => {
  const module = await import('../../frontend/js/status.js');

  assert.equal(typeof module.buildTimeline, 'function');
});
