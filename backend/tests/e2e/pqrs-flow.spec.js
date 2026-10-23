import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupAdminApp, TEST_EMAIL, TEST_PASSWORD } from '../helpers/admin.js';

test.describe.serial('PQRS Flow browser smoke tests', () => {
  let app;

  test.beforeAll(async () => {
    app = await setupAdminApp();
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('submits a public request and tracks it from the public page', async ({ page }) => {
    await page.goto(`${app.baseUrl}/index.html`);
    await expect(page.getByRole('heading', { name: 'Submit a PQRS' })).toBeVisible();

    await page.selectOption('#type', 'petition');
    await page.fill('#subject', 'Streetlight outage on 3rd Avenue');
    await page.fill('#description', 'The streetlight at 3rd Avenue has been out for two weeks.');
    await page.fill('#requesterName', 'Jordan Smith');
    await page.fill('#requesterEmail', 'jordan.smith@example.com');

    await page.getByRole('button', { name: 'Submit PQRS' }).click();

    await expect(page.locator('#successPanel')).toBeVisible();
    const caseNumber = (await page.locator('#caseNumber').textContent())?.trim();
    expect(caseNumber).toMatch(/^PQRS-\d{4}-\d{6}$/);

    await page.goto(`${app.baseUrl}/track.html`);
    await page.fill('#caseNumber', caseNumber);
    await page.fill('#requesterEmail', 'jordan.smith@example.com');
    await page.getByRole('button', { name: 'Check status' }).click();

    await expect(page.locator('#resultCaseNumber')).toHaveText(caseNumber);
    await expect(page.locator('#statusBadge')).toBeVisible();
  });

  test('staff can log in and open the dashboard', async ({ page }) => {
    await page.goto(`${app.baseUrl}/admin/login.html`);
    await expect(page.getByRole('heading', { name: 'Staff login' })).toBeVisible();

    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('#adminName')).toContainText('Test Staff');
  });

  test('important public and staff pages remain accessible @a11y', async ({ page }) => {
    await page.goto(`${app.baseUrl}/index.html`);
    const publicResults = await new AxeBuilder({ page }).analyze();
    expect(publicResults.violations).toEqual([]);

    await page.goto(`${app.baseUrl}/track.html`);
    const trackingResults = await new AxeBuilder({ page }).analyze();
    expect(trackingResults.violations).toEqual([]);

    await page.goto(`${app.baseUrl}/admin/login.html`);
    const loginResults = await new AxeBuilder({ page }).analyze();
    expect(loginResults.violations).toEqual([]);

    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    const dashboardResults = await new AxeBuilder({ page }).analyze();
    expect(dashboardResults.violations).toEqual([]);
  });
});
