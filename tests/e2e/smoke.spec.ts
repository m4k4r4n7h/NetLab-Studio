import { test, expect } from '@playwright/test';

test('loads the app and places a device from the palette', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible();
  await expect(page.getByLabel('Device palette')).toBeVisible();
  await expect(page.getByText('Restoring local workspace…')).toBeHidden();

  await page.getByRole('button', { name: 'End Devices' }).click();
  await page.getByTestId('palette-pc').click();

  await expect(page.getByText('1 devices')).toBeVisible();
  await expect(page.getByText('PC0').first()).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
});

test('opens and closes the about dialog from the help menu', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('menuitem', { name: /About NetLab Studio/ }).click();

  const dialog = page.getByRole('dialog', { name: 'About NetLab Studio' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Version 1\.0\.0/)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('switches to the dark theme and remembers the choice', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('menuitem', { name: /Preferences/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Preferences' });
  await dialog.getByRole('radio', { name: 'Dark theme' }).check();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(23, 28, 33)');
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(23, 28, 33)');

  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('menuitem', { name: /Preferences/ }).click();
  await page.getByRole('dialog', { name: 'Preferences' }).getByRole('radio', { name: 'Light theme' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(232, 232, 232)');
});

test('loads the guided lab list', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('toolbar', { name: 'Main toolbar' }).getByRole('button', { name: 'Labs and templates' }).click();
  const dialog = page.getByRole('dialog', { name: 'Learning Center' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('1. Build a Basic LAN').first()).toBeVisible();
  await expect(dialog.getByText('10. Troubleshoot an Incorrect Default Gateway').first()).toBeVisible();
});

test('fits a generated topology inside the visible canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');

  await page.getByRole('toolbar', { name: 'Main toolbar' }).getByRole('button', { name: 'Labs and templates' }).click();
  const dialog = page.getByRole('dialog', { name: 'Learning Center' });
  await dialog.getByRole('button', { name: /Templates/ }).click();
  await dialog.getByRole('button', { name: /Two-Subnet Corporate Network/ }).click();
  await dialog.getByRole('button', { name: 'Load Template' }).click();

  const canvas = await page.getByTestId('topology-canvas').boundingBox();
  expect(canvas).not.toBeNull();
  if (!canvas) return;

  const nodes = await page.locator('.canvas-device').all();
  expect(nodes).toHaveLength(7);
  for (const node of nodes) {
    const box = await node.boundingBox();
    expect(box).not.toBeNull();
    if (!box) continue;
    expect(box.x).toBeGreaterThanOrEqual(canvas.x);
    expect(box.y).toBeGreaterThanOrEqual(canvas.y);
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width);
    expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height);
  }
});

test('opens the simulation drawer on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/');

  const toggle = page.getByRole('button', { name: 'Show simulation panel' });
  await expect(toggle).toBeVisible();
  await toggle.click();

  await expect(page.locator('.app-shell')).toHaveClass(/simulation-drawer-open/);
  await expect(page.getByRole('complementary', { name: 'Simulation panel' })).toBeVisible();

  await page.getByRole('button', { name: 'Close simulation panel' }).click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/simulation-drawer-open/);
});

test('reloads offline and restores the saved project', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker));
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await page.getByRole('button', { name: 'End Devices' }).click();
  await page.getByTestId('palette-pc').click();
  await expect(page.locator('.dirty-pill')).toHaveText('Saved', { timeout: 10_000 });

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByText('1 devices')).toBeVisible();
  await expect(page.locator('.canvas-device').filter({ hasText: 'PC0' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible();

  await context.setOffline(false);
});
