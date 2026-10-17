// Supply an existing Playwright Page. Six navigations clear the application's in-memory cache;
// HTTP cache remains enabled. Do not run as a large/repeated external tile load test.
export async function measureDemMatrix(page, baseUrl = 'http://127.0.0.1:4173/poc-maplibre/') {
  const receipts = [];
  for (const route of ['marunouchi', 'kudanzaka']) {
    for (const spacing of ['5', '10', '20']) {
      await page.goto(baseUrl);
      await page.waitForFunction(() => !document.querySelector('#profile-compare').disabled);
      await page.locator('#route-select').selectOption(route);
      await page.locator('#profile-spacing').selectOption(spacing);
      await page.locator('#profile-smoothing').selectOption('30');
      for (const cache of ['app-cold', 'app-warm']) {
        await page.locator('#profile-compare').click();
        await page.waitForFunction(() => !document.querySelector('#profile-compare').disabled
          && document.querySelector('#profile-status').textContent.startsWith('作成しました'));
        receipts.push({ route, spacing: Number(spacing), cache,
          status: await page.locator('#profile-status').innerText(),
          tables: await page.locator('#profile-stats table').evaluateAll((tables) => tables.map((t) =>
            Array.from(t.rows, (r) => Array.from(r.cells, (c) => c.textContent)))),
          chartPaths: await page.locator('#profile-chart path').count() });
      }
    }
  }
  return { timestamp: new Date().toISOString(), url: page.url(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    scripts: await page.locator('script[src]').evaluateAll((scripts) => scripts.map((s) => s.src)), receipts };
}
