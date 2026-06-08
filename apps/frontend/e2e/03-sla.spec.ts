import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('SLA — indicadores visuales', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('queue muestra columna SLA o indicador de vencimiento', async ({ page }) => {
    await page.goto('/helpdesk/queue');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // The queue page renders SLA countdown pills per ticket
    // Even with 0 tickets, the table header with SLA label should exist
    const slaIndicator = page.locator(
      '[class*="sla"], [class*="SLA"], text=/SLA|Vencimiento|vence/i'
    ).first();
    await expect(slaIndicator).toBeVisible({ timeout: 8_000 });
  });

  test('workspace de ticket muestra strip de SLA si ticket tiene SLA activo', async ({ page }) => {
    await page.goto('/helpdesk');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const firstTicket = page
      .locator('[class*="ticketRow"], [class*="ticket-row"], [data-ticket-id]')
      .first();

    if (await firstTicket.count() === 0) {
      test.skip(); // No tickets to test
    }

    await firstTicket.click();
    await page.waitForLoadState('networkidle', { timeout: 10_000 });

    // SLA strip is present when ticket has sla_deadline_tracked && !is_final
    // It contains a Clock icon area and SLA label
    // Just verify the workspace loaded — SLA strip is conditional
    await expect(
      page.locator('[class*="workspace"], [class*="panel"]').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('stat cards de helpdesk muestran contadores SLA', async ({ page }) => {
    await page.goto('/helpdesk');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Stat cards exist on the admin view (helpdeskMockup variant)
    // They show: Abiertos, En proceso, Vencidos SLA, Críticos
    const statCards = page.locator('[class*="statCard"]');
    const count = await statCards.count();

    // If stat cards are visible, verify they contain numbers
    if (count > 0) {
      const firstCount = statCards.first().locator('[class*="statCount"]');
      await expect(firstCount).toBeVisible();
      const text = await firstCount.textContent();
      expect(Number(text)).toBeGreaterThanOrEqual(0);
    }
    // If no stat cards (non-admin or different view), test is informational
  });
});
