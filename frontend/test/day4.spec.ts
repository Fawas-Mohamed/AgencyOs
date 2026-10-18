import { expect, test, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { Requirement, RequirementContent } from '../lib/types/hub';

const origin = () => ({ Origin: process.env.UI_ORIGIN! });
async function login(context: BrowserContext, secondary = false) {
  const response = await context.request.post('/api/auth/login', {
    headers: origin(),
    data: {
      email: secondary ? process.env.DEMO_SECONDARY_EMAIL : process.env.DEMO_EMAIL,
      password: secondary ? process.env.DEMO_SECONDARY_PASSWORD : process.env.DEMO_PASSWORD,
    },
  });
  expect(response.status()).toBe(201);
}
async function fixture(context: BrowserContext) {
  const name = 'Day 4 check ' + randomUUID().slice(0, 8);
  const clientResponse = await context.request.post('/api/clients', {
    headers: origin(),
    data: { name, company: name, contactName: 'Review contact' },
  });
  expect(clientResponse.status()).toBe(201);
  const client = (await clientResponse.json()).data;
  const response = await context.request.post('/api/clients/' + client.id + '/requirements', {
    headers: origin(),
    data: {
      title: 'Original brief',
      objective: 'A clear client objective',
      services: ['Design'],
      referenceLinks: [],
      items: [
        {
          title: 'Original item',
          description: 'Stable order',
          category: 'Feature',
          priority: 'HIGH',
          notes: '',
        },
      ],
    },
  });
  expect(response.status()).toBe(201);
  const requirement = (await response.json()).data as Requirement;
  const clientUrl = '/client-hub/clients/' + client.id;
  return {
    client,
    requirement,
    clientUrl,
    requirementUrl: clientUrl + '/requirements/' + requirement.id,
  };
}
function content(record: Requirement): RequirementContent {
  const {
    title,
    objective,
    services,
    designPreferences,
    referenceLinks,
    constraints,
    assumptions,
    internalRecommendations,
    clientNotes,
    timeline,
    targetDate,
    budgetMin,
    budgetMax,
    currency,
  } = record;
  return {
    title,
    objective,
    services,
    designPreferences,
    referenceLinks,
    constraints,
    assumptions,
    internalRecommendations,
    clientNotes,
    timeline,
    targetDate,
    budgetMin,
    budgetMax,
    currency,
    items: record.items.map(({ title, description, category, priority, notes }) => ({
      title,
      description,
      category,
      priority,
      notes,
    })),
  };
}
test.beforeEach(async ({ context }) => login(context));

test('real stale edits retain input and require explicit recovery', async ({
  page,
  context,
}, info) => {
  const f = await fixture(context);
  await page.goto(f.requirementUrl + '/edit');
  await page.getByLabel('Requirement title', { exact: true }).fill('My unsaved scope');
  const update = await context.request.patch('/api/requirements/' + f.requirement.id, {
    headers: origin(),
    data: {
      ...content(f.requirement),
      title: 'Newer saved scope',
      expectedVersion: f.requirement.lockVersion,
    },
  });
  expect(update.status()).toBe(200);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Requirement changed');
  await expect(page.getByLabel('Requirement title', { exact: true })).toHaveValue(
    'My unsaved scope',
  );
  await expect(page.getByRole('region', { name: 'Edit conflict recovery' })).toContainText(
    'Newer saved scope',
  );
  await page.screenshot({
    path: 'test-results/conflict-' + info.project.name + '.png',
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const [draft] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download my unsaved draft', exact: true }).click(),
  ]);
  expect(draft.suggestedFilename()).toContain('unapproved-draft-');
  await page.getByRole('button', { name: 'Replace form with latest', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Requirement title', { exact: true })).toHaveValue(
    'My unsaved scope',
  );
  await page.getByRole('button', { name: 'Replace form with latest', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Load latest record', exact: true })
    .click();
  await expect(page.getByLabel('Requirement title', { exact: true })).toHaveValue(
    'Newer saved scope',
  );
  await expect(page.getByRole('region', { name: 'Edit conflict recovery' })).toHaveCount(0);
});

test('native field errors, unsaved navigation, focus trap and duplicate submission prevention', async ({
  page,
}, info) => {
  await page.goto('/client-hub');
  await page.getByRole('link', { name: 'New client', exact: true }).click();
  const name = 'Guarded client ' + randomUUID().slice(0, 8);
  await page.getByLabel('Client name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save client', exact: true }).click();
  await expect(page.getByLabel('Company', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Discard changes', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'Cancel', exact: true })).toBeFocused();
  await expect(page.getByLabel('Client name', { exact: true })).toHaveValue(name);
  // A reload uses the browser's native beforeunload prompt.
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  const [prompt] = await Promise.all([
    page.waitForEvent('dialog'),
    page.evaluate(() => {
      setTimeout(() => location.reload(), 0);
    }),
  ]);
  expect(prompt.type()).toBe('beforeunload');
  await prompt.dismiss();
  await expect(page.getByLabel('Client name', { exact: true })).toHaveValue(name);
  await page.goBack();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/clients\/new$/);
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'New client', exact: true }).click();
  await page.getByLabel('Client name', { exact: true }).fill(name);
  await page.getByLabel('Company', { exact: true }).fill('Real company');
  await page.getByLabel('Primary contact', { exact: true }).fill('Real contact');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let posts = 0;
  await page.route('**/api/clients', async (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      await gate;
    }
    await route.continue(); // Forward the real request; no mocked response.
  });
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/clients') && r.request().method() === 'POST',
  );
  await page.locator('main form').evaluate((element: HTMLFormElement) => {
    element.requestSubmit();
    element.requestSubmit();
  });
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  release();
  expect((await response).status()).toBe(201);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  expect(posts).toBe(1);
  await expect(
    page.getByRole('navigation', { name: 'Client workspace sections' }).getByRole('link'),
  ).toHaveCount(6);
  await page.screenshot({
    path: 'test-results/workspace-' + info.project.name + '.png',
    fullPage: true,
  });
  if (info.project.name !== 'desktop') {
    const originalViewport = page.viewportSize()!;
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator('.app-body')).not.toHaveAttribute('inert', '');
    await page.setViewportSize(originalViewport);
    await expect(
      page.getByRole('button', { name: 'Open navigation', exact: true }),
    ).toHaveAttribute('aria-expanded', 'false');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('upload rejection retains inputs and real denied download offers retry', async ({
  page,
  context,
}, info) => {
  const f = await fixture(context);
  await page.goto(f.clientUrl + '?tab=files');
  await page.getByRole('button', { name: 'Upload file', exact: true }).click();
  await page.getByLabel('Supporting file', { exact: true }).setInputFiles({
    name: 'invalid.png',
    mimeType: 'image/png',
    buffer: Buffer.from('Not an actual PNG'),
  });
  await page.getByRole('button', { name: 'Upload privately', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  expect(
    await page
      .getByLabel('Supporting file', { exact: true })
      .evaluate((e: HTMLInputElement) => e.files?.[0]?.name),
  ).toBe('invalid.png');
  await page.getByLabel('Supporting file', { exact: true }).setInputFiles({
    name: 'private-day4.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('A real private text attachment'),
  });
  await page.getByRole('button', { name: 'Upload privately', exact: true }).click();
  await expect(page.getByText('private-day4.txt', { exact: true })).toBeVisible();
  await login(context, true); // Genuine different-agency session, while the old screen remains open.
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Record not found');
  await expect(page).toHaveURL(/\?tab=files$/);
  await page.screenshot({
    path: 'test-results/download-error-' + info.project.name + '.png',
    fullPage: true,
  });
  await login(context);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Retry', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('private-day4.txt');
});

test('review reasons, cancelable confirmation and terminal archival preserve history', async ({
  page,
  context,
}, info) => {
  const f = await fixture(context);
  await page.goto(f.requirementUrl + '/review');
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await page.getByRole('button', { name: 'Request changes', exact: true }).click();
  await expect(page.getByLabel('Reason / review note', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await page.getByLabel('Reason / review note', { exact: true }).fill('Clarify the agreed scope');
  await page.getByRole('button', { name: 'Request changes', exact: true }).click();
  await expect(
    page.getByText('Requirement moved to Changes Requested.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm requirement', exact: true }).click();
  await page.screenshot({
    path: 'test-results/review-dialog-' + info.project.name + '.png',
    fullPage: false,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Confirm requirement', exact: true }),
  ).toBeFocused();
  const before = (await (await context.request.get('/api/requirements/' + f.requirement.id)).json())
    .data;
  expect(before.status).toBe('UNDER_REVIEW');
  await page.getByRole('button', { name: 'Confirm requirement', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm version', exact: true })
    .click();
  await expect(page.getByText(/Confirmed by Demo reviewer on/)).toBeVisible();
  await page.getByLabel('Reason / review note', { exact: true }).fill('Client engagement closed');
  await page.getByRole('button', { name: 'Archive requirement', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Archive requirement', exact: true })
    .click();
  await expect(page.getByText('Active version: 1 · Archived', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit requirement', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download version 1', exact: true })).toBeVisible();
  expect(
    (
      await context.request.get('/api/requirements/' + f.requirement.id + '/export?version=1')
    ).status(),
  ).toBe(200);
});
