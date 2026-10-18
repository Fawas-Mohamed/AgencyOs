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
  await page
    .getByLabel('Item description', { exact: true })
    .nth(1)
    .fill('Preserve every approved version.');
  await page.getByLabel('Category / type', { exact: true }).nth(1).fill('Functional');
  await page.getByLabel('Priority', { exact: true }).nth(1).selectOption('MUST_HAVE');
  await page
    .getByLabel('Item notes', { exact: true })
    .nth(1)
    .fill('Approved scope stays immutable.');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByLabel('Item title', { exact: true }).nth(2).fill('Temporary item');
  await page.getByRole('button', { name: 'Remove item 3', exact: true }).click();
  await expect(page.getByLabel('Item title', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Move item 2 up', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Item title', { exact: true }).first()).toBeFocused();
  await page
    .getByLabel('Design / UI preferences', { exact: true })
    .fill('Compact accessible layouts.');
  await page
    .getByLabel('Reference websites and links', { exact: true })
    .fill('https://example.com/inspiration');
  await page.getByLabel('Target date', { exact: true }).fill('2027-12-15');
  await page
    .getByLabel('Expected timeline', { exact: true })
    .fill('Client preference: six weeks, subject to review.');
  await page
    .getByLabel('Client-provided constraints', { exact: true })
    .fill('Client requests compatibility with current systems.');
  await page
    .getByLabel('Additional client notes', { exact: true })
    .fill('Client will review the brief.');
  await page
    .getByLabel('Internal assumptions', { exact: true })
    .fill('Internal assumption: existing identity adapter is available.');
  await page
    .getByLabel('Internal recommendations', { exact: true })
    .fill('Review accessibility before approval.');
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
  await expect(page.getByLabel('Maximum budget', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByLabel('Requirement title', { exact: true })).toHaveValue(
    'Verified client portal',
  );
  await page.getByLabel('Maximum budget', { exact: true }).fill('500.20');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Verified client portal', exact: true }),
  ).toBeVisible();
  const requirementId = new URL(page.url()).pathname.split('/').pop()!;
  const requirementUrl = clientUrl + '/requirements/' + requirementId;
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
    page.getByRole('button', { name: 'Download', exact: true }).click(),
  ]);
  expect(fileDownload.suggestedFilename()).toBe('verified-brief.txt');
  await page.getByRole('button', { name: 'Add reference link', exact: true }).click();
  await page.getByLabel('Reference name', { exact: true }).fill('Approved inspiration');
  await page.getByLabel('Reference URL', { exact: true }).fill('https://example.com/brief');
  await page.getByLabel('Linked requirement', { exact: true }).selectOption(requirementId);
  await page.getByRole('button', { name: 'Save reference', exact: true }).click();
  await expect(page.getByText('Approved inspiration', { exact: true })).toBeVisible();
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
  await page.goto(requirementUrl);
  await page.getByRole('link', { name: 'Review requirement', exact: true }).click();
  await expect(page).toHaveURL(requirementUrl + '/review');
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Confirm requirement', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirm requirement', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm version', exact: true })
    .click();
  await expect(page.getByText(/Confirmed by Demo reviewer on/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit requirement', exact: true })).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download confirmed package', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toContain('-v1.json');
  const originalApproved = (
    await (
      await context.request.get('/api/requirements/' + requirementId + '/export?version=1')
    ).json()
  ).data;
  await page
    .getByLabel('Reason / review note', { exact: true })
    .fill('Client asked for a controlled revision');
  await page.getByRole('button', { name: 'Reopen as new draft version', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create draft revision', exact: true })
    .click();
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
  const approved = (await snapshot.json()).data;
  expect(approved).toEqual(originalApproved);
  expect(approved.title).toBe('Verified client portal');
  expect(approved.version).toBe(1);
  expect(approved.services).toEqual(['Design', 'Web application']);
  expect(approved.designPreferences).toBe('Compact accessible layouts.');
  expect(approved.referenceLinks).toEqual(['https://example.com/inspiration']);
  expect(approved.clientProvided).toMatchObject({
    budgetMin: '200.1', // Prisma Decimal JSON omits insignificant trailing zeroes.
    budgetMax: '500.2',
    currency: 'LKR',
    timeline: 'Client preference: six weeks, subject to review.',
    notes: 'Client will review the brief.',
  });
  expect(approved.clientProvided.targetDate.slice(0, 10)).toBe('2027-12-15');
  expect(approved.internal.assumptions).toBe(
    'Internal assumption: existing identity adapter is available.',
  );
  expect(approved.items[0]).toMatchObject({
    description: 'Preserve every approved version.',
    category: 'Functional',
    priority: 'MUST_HAVE',
    notes: 'Approved scope stays immutable.',
  });
  expect(approved.references.map((file: { originalName: string }) => file.originalName)).toEqual(
    expect.arrayContaining(['verified-brief.txt', 'Approved inspiration']),
  );
  expect(approved.items.map((item: { title: string }) => item.title)).toEqual([
    'Approval history',
    'Guided brief',
  ]);
  expect(
    (await context.request.get('/api/requirements/' + requirementId + '/export')).status(),
  ).toBe(409);
  await expect(page.getByText('Active version: 2 · Draft', { exact: true })).toBeVisible();
  await expect(page.getByText('Last confirmed version: 1', { exact: true })).toBeVisible();
  await page.goto(clientUrl + '?tab=timeline');
  await expect(page.getByText('Private file uploaded', { exact: true })).toBeVisible();
  await page.getByLabel('Timeline order', { exact: true }).selectOption('oldest');
  await expect(page.locator('.timeline-item').first()).toContainText('Client created');
  await page.getByLabel('Timeline order', { exact: true }).selectOption('newest');
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
