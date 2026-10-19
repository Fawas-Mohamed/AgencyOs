import { expect, test } from '@playwright/test';

test('Day 5 loading and long content remain usable with real responses', async ({
  page,
  context,
}, info) => {
  const headers = { Origin: process.env.UI_ORIGIN! };
  expect(
    (
      await context.request.post('/api/auth/login', {
        headers,
        data: { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD },
      })
    ).status(),
  ).toBe(201);
  const word = 'LongContent'.repeat(14);
  const created = await context.request.post('/api/clients', {
    headers,
    data: { name: word, company: word, contactName: 'Fictional reviewer' },
  });
  expect(created.status()).toBe(201);
  const client = (await created.json()).data;
  const requirementResponse = await context.request.post(
    '/api/clients/' + client.id + '/requirements',
    {
      headers,
      data: {
        title: 'LongScope'.repeat(20),
        objective: 'UnbrokenObjective'.repeat(400),
        services: ['Design'.repeat(16)],
        referenceLinks: ['https://example.com/' + 'reference'.repeat(80)],
        items: [
          {
            title: word,
            description: 'ItemDescription'.repeat(240),
            category: 'Feature',
            priority: 'HIGH',
            notes: 'Notes'.repeat(300),
          },
        ],
        assumptions: 'Internal assumption '.repeat(120),
      },
    },
  );
  expect(requirementResponse.status()).toBe(201);
  const requirement = (await requirementResponse.json()).data;
  const base = '/client-hub/clients/' + client.id;
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const arrived = new Promise<void>((resolve) => {
    entered = resolve;
  });
  // Hold, then forward the actual backend response. No response fixture or fake success.
  await page.route('**/api/clients/' + client.id + '/hub', async (route) => {
    entered();
    await held;
    await route.continue();
  });
  await page.goto(base);
  await arrived;
  await expect(page.getByRole('main').getByRole('status')).toContainText('Loading');
  release();
  await expect(page.getByRole('heading', { name: word, exact: true })).toBeVisible();
  await page.unroute('**/api/clients/' + client.id + '/hub');
  for (const url of [
    base,
    base + '?tab=requirements',
    base + '/requirements/' + requirement.id,
    base + '/requirements/' + requirement.id + '/edit',
  ]) {
    await page.goto(url);
    await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({
    path: 'test-results/day5-long-' + info.project.name + '.png',
    fullPage: true,
  });
});
