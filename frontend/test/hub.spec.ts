import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
test.beforeEach(async ({ context }) => {
  const response = await context.request.post('/api/auth/login', {
    headers: { Origin: process.env.UI_ORIGIN! },
    data: { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD },
  });
  expect(response.status()).toBe(201);
});
test('private session proxy and genuine empty/error states', async ({ page, context }) => {
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === 'agencyos_session');
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Strict');
  const me = await context.request.get('/api/auth/me');
  expect(me.status()).toBe(200);
  const denied = await context.request.post('/api/clients', {
    headers: { Origin: 'https://untrusted.example' },
    data: { name: 'Blocked', company: 'Blocked', contactName: 'Blocked' },
  });
  expect(denied.status()).toBe(403);
  await page.goto('/client-hub');
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  await page.getByLabel('Filter clients').fill('No matching client ' + randomUUID());
  await expect(page.getByText('No clients found')).toBeVisible();
  await page.goto('/client-hub/clients/' + randomUUID());
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Record not found');
});
test('client, structured requirement, review, revision, communication, private file and timeline flow', async ({
  page,
  context,
}, testInfo) => {
  const name = 'UI verification ' + testInfo.project.name + ' ' + randomUUID().slice(0, 8);
  await page.goto('/client-hub/clients/new');
  await page.getByLabel('Client name', { exact: true }).fill(name);
  await page.getByLabel('Company', { exact: true }).fill(name);
  await page.getByLabel('Primary contact', { exact: true }).fill('Test contact');
  await page.getByRole('button', { name: 'Save client', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const clientId = new URL(page.url()).pathname.split('/').pop()!;
  const clientUrl = '/client-hub/clients/' + clientId;
  await page.getByRole('link', { name: 'Requirements', exact: true }).click();
  await expect(page.getByText('No requirements found')).toBeVisible();
  await page.getByRole('link', { name: 'New requirement', exact: true }).click();
  await page.getByLabel('Requirement title', { exact: true }).fill('Verified client portal');
  await page
    .getByLabel('Business objective / problem', { exact: true })
    .fill('Collect structured briefs and preserve approvals.');
  await page.getByLabel('Requested services', { exact: true }).fill('Design, Web application');
  await page.getByLabel('Item title', { exact: true }).first().fill('Guided brief');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByLabel('Item title', { exact: true }).nth(1).fill('Approval history');
  await page.getByRole('button', { name: 'Move item 2 up', exact: true }).click();
  await expect(page.getByLabel('Item title', { exact: true }).first()).toHaveValue(
    'Approval history',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Minimum budget', { exact: true }).fill('200.10');
  await page.getByLabel('Maximum budget', { exact: true }).fill('100.20');
  await page.getByLabel('Currency', { exact: true }).fill('LKR');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Minimum budget must not exceed maximum budget',
  );
  await page.getByLabel('Maximum budget', { exact: true }).fill('500.20');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Verified client portal', exact: true }),
  ).toBeVisible();
  const requirementId = new URL(page.url()).pathname.split('/').pop()!;
  const requirementUrl = clientUrl + '/requirements/' + requirementId;
  await page.getByRole('link', { name: 'Review requirement', exact: true }).click();
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Confirm requirement', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirm requirement', exact: true }).click();
  await expect(page.getByText(/Confirmed by Demo reviewer on/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit requirement', exact: true })).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download confirmed package', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toContain('-v1.json');
  await page
    .getByLabel('Reason / review note', { exact: true })
    .fill('Client asked for a controlled revision');
  await page.getByRole('button', { name: 'Reopen as new draft version', exact: true }).click();
  await expect(page.getByText('Version 2 · Prepared by', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Edit requirement', exact: true }).click();
  await page.getByLabel('Requirement title', { exact: true }).fill('Verified portal revision');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Verified portal revision', exact: true }),
  ).toBeVisible();
  const snapshot = await context.request.get(
    '/api/requirements/' + requirementId + '/export?version=1',
  );
  expect((await snapshot.json()).data.title).toBe('Verified client portal');
  await page.goto(clientUrl + '?tab=communications');
  await page.getByRole('button', { name: 'Log communication', exact: true }).click();
  await page.getByLabel('Subject', { exact: true }).fill('Requirement review meeting');
  await page.getByLabel('Summary', { exact: true }).fill('Client clarified the approval workflow.');
  await page.getByLabel('Participants', { exact: true }).fill('Test contact, Reviewer');
  await page.getByLabel('Linked requirement', { exact: true }).selectOption(requirementId);
  await page.getByRole('button', { name: 'Save communication', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Requirement review meeting', exact: true }),
  ).toBeVisible();
  await page.goto(clientUrl + '?tab=files');
  await page.getByRole('button', { name: 'Upload file', exact: true }).click();
  await page.getByLabel('Supporting file', { exact: true }).setInputFiles({
    name: 'verified-brief.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('A private client brief'),
  });
  await page.getByLabel('Linked requirement', { exact: true }).selectOption(requirementId);
  await page.getByRole('button', { name: 'Upload privately', exact: true }).click();
  await expect(page.getByText('verified-brief.txt', { exact: true })).toBeVisible();
  const [fileDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download', exact: true }).click(),
  ]);
  expect(fileDownload.suggestedFilename()).toBe('verified-brief.txt');
  await page.goto(clientUrl + '?tab=notes');
  await page.getByRole('button', { name: 'Add internal note', exact: true }).click();
  await page
    .getByLabel('Internal note', { exact: true })
    .fill('Internal clarification kept separate from communications.');
  await page.getByLabel('Linked requirement', { exact: true }).selectOption(requirementId);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(
    page.getByText('Internal clarification kept separate from communications.', { exact: true }),
  ).toBeVisible();
  await page.goto(clientUrl + '?tab=timeline');
  await expect(page.getByText('Private file uploaded', { exact: true })).toBeVisible();
  await page.screenshot({
    path: 'test-results/timeline-' + testInfo.project.name + '.png',
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto(requirementUrl);
  await expect(page.getByText('Requirement review meeting', { exact: true })).toBeVisible();
  await page.screenshot({
    path: 'test-results/requirement-' + testInfo.project.name + '.png',
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Close navigation', exact: true }).last().click();
  }
});
