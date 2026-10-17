// Pass a Playwright Page from your browser harness; no production dependency is needed.
export async function verifyDemBrowser(page, baseUrl = 'http://127.0.0.1:4173/poc-maplibre/') {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const receipts = { timestamp: new Date().toISOString(), baseUrl, checks: [] };
  const check = (name, data = {}) => receipts.checks.push({ name, ...data });
  const ready = async () => page.waitForFunction(() => !document.querySelector('#profile-compare').disabled);
  const finished = async () => page.waitForFunction(() => !document.querySelector('#profile-compare').disabled
    && document.querySelector('#profile-status').textContent.startsWith('作成しました'));
  const errors = [];
  const failedAssets = [];
  const onError = (error) => errors.push(error.message);
  const onResponse = (r) => { if (r.url().includes('/poc-maplibre/assets/') && !r.ok()) failedAssets.push(r.url()); };
  page.on('pageerror', onError);
  page.on('response', onResponse);
  try {
    await page.goto(baseUrl);
    await ready();
    await page.locator('input[value="point"]').check();
    await page.locator('canvas.maplibregl-canvas').click({ position: { x: 100, y: 150 } });
    await page.waitForFunction(() => document.querySelector('#elevation-result dl'));
    const gsiPoint = await page.locator('#elevation-result').innerText();
    assert(gsiPoint.includes('GSI') && !gsiPoint.includes('取得できません'), 'GSI point failed');
    await page.locator('#dem-provider').selectOption('mapterhorn');
    await page.waitForFunction(() => document.querySelector('#elevation-result dl')?.textContent.includes('Mapterhorn'));
    const mapterhornPoint = await page.locator('#elevation-result').innerText();
    assert(!mapterhornPoint.includes('取得できません'), 'Mapterhorn point failed');
    check('real point and provider switch', { gsiPoint, mapterhornPoint });

    await page.locator('input[value="slope"]').check();
    await page.locator('canvas.maplibregl-canvas').click({ position: { x: 100, y: 150 } });
    await page.locator('canvas.maplibregl-canvas').click({ position: { x: 250, y: 180 } });
    await page.waitForFunction(() => document.querySelector('#elevation-result').textContent.includes('平均勾配'));
    const mapterhornSlope = await page.locator('#elevation-result').innerText();
    await page.locator('#dem-provider').selectOption('gsi');
    await page.waitForFunction(() => document.querySelector('#elevation-result dl')?.textContent.includes('GSI'));
    const gsiSlope = await page.locator('#elevation-result').innerText();
    assert(gsiSlope.includes('平均勾配') && mapterhornSlope.includes('平均勾配'), 'slope switch failed');
    check('real two-point slope with retained coordinates', { gsiSlope, mapterhornSlope });

    await page.locator('#profile-run').click(); await finished();
    await page.locator('#dem-provider').selectOption('mapterhorn'); await finished();
    let headings = await page.locator('#profile-stats table').first().locator('thead').innerText();
    assert(headings.includes('Mapterhorn') && !headings.includes('GSI'), 'profile provider switch failed');
    check('single-provider profile automatically recalculated');

    // Hold GSI completion, change provider, then allow the obsolete response to finish.
    await page.goto(baseUrl); await ready();
    let release;
    let started;
    const held = new Promise((resolve) => { release = resolve; });
    const requested = new Promise((resolve) => { started = resolve; });
    const delayGsi = async (route) => { started(); await held; await route.continue(); };
    await page.route('https://cyberjapandata.gsi.go.jp/**', delayGsi);
    await page.locator('#profile-run').click(); await requested;
    await page.locator('#dem-provider').selectOption('mapterhorn'); await finished();
    const before = await page.locator('#profile-stats').innerText();
    release();
    await page.waitForLoadState('networkidle');
    assert((await page.locator('#profile-stats').innerText()) === before, 'obsolete profile overwrote selected provider');
    await page.unroute('https://cyberjapandata.gsi.go.jp/**', delayGsi);
    check('delayed old profile cannot overwrite provider switch');

    // Point race: clear caches by navigation; start GSI, switch while the fetch is held.
    await page.goto(baseUrl); await ready();
    let releasePoint;
    let pointStarted;
    const heldPoint = new Promise((resolve) => { releasePoint = resolve; });
    const pointRequest = new Promise((resolve) => { pointStarted = resolve; });
    const delayPoint = async (route) => { pointStarted(); await heldPoint; await route.continue(); };
    await page.route('https://cyberjapandata.gsi.go.jp/**', delayPoint);
    await page.locator('input[value="point"]').check();
    await page.locator('canvas.maplibregl-canvas').click({ position: { x: 100, y: 150 } });
    await pointRequest;
    await page.locator('#dem-provider').selectOption('mapterhorn');
    await page.waitForFunction(() => document.querySelector('#elevation-result dl')?.textContent.includes('Mapterhorn'));
    const pointBefore = await page.locator('#elevation-result').innerText();
    releasePoint(); await page.waitForLoadState('networkidle');
    assert((await page.locator('#elevation-result').innerText()) === pointBefore, 'obsolete point overwrote selection');
    await page.unroute('https://cyberjapandata.gsi.go.jp/**', delayPoint);
    check('delayed old point cannot overwrite provider switch');

    // A missing/error Mapterhorn must not request GSI. These are simulated failure checks.
    for (const failure of ['404', 'network']) {
      await page.goto(baseUrl); await ready();
      await page.locator('#dem-provider').selectOption('mapterhorn');
      let gsiRequests = 0;
      const countGsi = (request) => { if (request.url().includes('cyberjapandata.gsi.go.jp')) gsiRequests++; };
      page.on('request', countGsi);
      const fail = (route) => failure === '404' ? route.fulfill({ status: 404, body: '' }) : route.abort('failed');
      await page.route('https://tiles.mapterhorn.com/**', fail);
      await page.locator('input[value="point"]').check();
      await page.locator('canvas.maplibregl-canvas').click({ position: { x: 100, y: 150 } });
      await page.waitForFunction(() => document.querySelector('#elevation-result').dataset.state === 'error');
      const message = await page.locator('#elevation-result').innerText();
      assert(message.includes(failure === '404' ? '範囲外' : '通信エラー'), 'wrong failure message');
      assert(gsiRequests === 0, 'implicit GSI fallback');
      await page.unroute('https://tiles.mapterhorn.com/**', fail);
      page.off('request', countGsi);
      check(`simulated ${failure}: no GSI fallback`, { message });
    }

    await page.goto(baseUrl); await ready();
    await page.locator('#route-select').selectOption('kudanzaka');
    await page.locator('#profile-spacing').selectOption('5');
    await page.locator('#profile-smoothing').selectOption('30');
    await page.locator('#profile-compare').click(); await finished();
    assert(await page.locator('#profile-chart path').count() === 4, 'raw/smoothed comparison paths missing');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('#profile-stats summary').click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile horizontal page overflow');
    assert((await page.locator('#dem-attribution').innerText()).includes('Mapterhorn'), 'DEM attribution missing');
    assert((await page.locator('.maplibregl-ctrl-attrib').innerText()).includes('OpenStreetMap'), 'OSM attribution missing');
    check('375px comparison, all sample rows, four chart series, attribution');
    await page.setViewportSize({ width: 1280, height: 900 });
    assert(failedAssets.length === 0, 'subpath asset failure');
    assert(errors.length === 0, 'uncaught browser error: ' + errors.join('; '));
    check('subpath assets and uncaught errors', { failedAssets, errors });
    return receipts;
  } finally {
    page.off('pageerror', onError);
    page.off('response', onResponse);
  }
}
