import { expect, test } from '@playwright/test';

test('foundation shell and separate agency sessions', async ({ page, context, browser }) => {
  const login = await context.request.post('/api/auth/login', {
    headers: { Origin: process.env.UI_ORIGIN! },
    data: { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD },
  });
  expect(login.status()).toBe(201);
  const loginBody = await login.json();
  expect(loginBody.data.accessToken).toBeUndefined();
  const me = (await (await context.request.get('/api/auth/me')).json()).data;
  const ownClients = (await (await context.request.get('/api/clients')).json()).data.items;
  await page.goto('/client-hub');
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
  const mobileNavigation = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await mobileNavigation.isVisible()) {
    await mobileNavigation.click();
    await expect(
      page.getByRole('button', { name: 'Close navigation', exact: true }).last(),
    ).toBeVisible();
  }
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation.getByRole('link')).toHaveCount(1);
  await expect(navigation.getByRole('link', { name: 'Clients', exact: true })).toBeVisible();
  await expect(page.getByAltText('Agency OS — Agency Operating System')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const other = await browser.newContext({ baseURL: process.env.UI_ORIGIN });
  try {
    const secondLogin = await other.request.post('/api/auth/login', {
      headers: { Origin: process.env.UI_ORIGIN! },
      data: {
        email: process.env.DEMO_SECONDARY_EMAIL,
        password: process.env.DEMO_SECONDARY_PASSWORD,
      },
    });
    expect(secondLogin.status()).toBe(201);
    const otherActor = (await (await other.request.get('/api/auth/me')).json()).data;
    expect(otherActor.agencyId).not.toBe(me.agencyId);
    const otherClients = (await (await other.request.get('/api/clients')).json()).data.items;
    expect(otherClients.length).toBeGreaterThan(0);
    expect(
      otherClients.every((client: { agencyId: string }) => client.agencyId === otherActor.agencyId),
    ).toBe(true);
    expect((await other.request.get('/api/clients/' + ownClients[0].id + '/hub')).status()).toBe(
      404,
    );
    expect(
      (await context.request.get('/api/clients/' + otherClients[0].id + '/hub')).status(),
    ).toBe(404);
    const secondPage = await other.newPage();
    await secondPage.goto('/client-hub');
    await expect(secondPage.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
    await expect(
      secondPage.getByRole('link', { name: 'Harbor Research Studio', exact: true }),
    ).toBeVisible();
    await expect(
      secondPage.getByRole('link', { name: 'Ceylon Craft Studio', exact: true }),
    ).toHaveCount(0);
  } finally {
    await other.close();
  }
});
