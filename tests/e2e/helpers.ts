import { expect, type Page } from 'playwright/test';

/** Data fixa do cenário do projeto: quarta-feira, 14/10/2026, meio-dia em São Paulo. */
export const DIA_INICIAL = new Date('2026-10-14T12:00:00-03:00');

/** Coleta erros de console/página e violações de CSP para checar no fim do teste. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  void page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP bloqueou ${e.violatedDirective}: ${e.blockedURI}`),
    );
  });
  return errors;
}

export async function openApp(page: Page, hash = '#/', date: Date = DIA_INICIAL): Promise<void> {
  await page.clock.setFixedTime(date);
  await page.goto(hash);
  await expect(page.locator('main h1')).toBeVisible();
}

/** Navega por hash e espera o título da nova tela. */
export async function go(page: Page, hash: string, title?: RegExp | string): Promise<void> {
  await page.evaluate((h) => (location.hash = h), hash);
  if (title) await expect(page.locator('main h1')).toHaveText(title);
  else await expect(page.locator('main h1')).toBeVisible();
}

/** Lê as sessões salvas no IndexedDB real do navegador. */
export async function storedSessions(
  page: Page,
): Promise<
  { kind: string; activityId: string; summary?: { attempts: number; successes: number } }[]
> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('claudio-futebol-ai');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('sessions', 'readonly');
          const all = tx.objectStore('sessions').getAll();
          all.onsuccess = () => {
            resolve(all.result);
            db.close();
          };
          all.onerror = () => reject(all.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}
