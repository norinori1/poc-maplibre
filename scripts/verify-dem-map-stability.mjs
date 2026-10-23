// Supply a Playwright Page, as for verify-dem-browser.mjs. Uses real DEM requests
// unless the caller explicitly intercepts them. No production dependency is needed.
export async function verifyDemMapStability(page, baseUrl = 'http://127.0.0.1:4173/poc-maplibre/') {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const settle = async () => {
    // MapLibre throttles its ResizeObserver; wait for the actual canvas resize.
    await page.waitForFunction(() => {
      const map = document.querySelector('#map').getBoundingClientRect();
      const canvas = document.querySelector('canvas.maplibregl-canvas').getBoundingClientRect();
      return Math.abs(map.width - canvas.width) < 1 && Math.abs(map.height - canvas.height) < 1;
    });
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }));
  };
  const geometry = () => page.evaluate(() => {
    const size = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };
    return {
      map: size('#map'), canvas: size('canvas.maplibregl-canvas'),
      markers: [...document.querySelectorAll('.spot-marker')].map((marker) => marker.style.transform),
    };
  });
  const checks = [];
  const viewports = [];
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on('pageerror', onError);
  try {
    for (const width of [1280, 761, 760, 375]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(baseUrl);
      await page.waitForFunction(() => !document.querySelector('#dem-provider').disabled);
      await settle();
      // Move away from the initial fit, so an accidental camera reset also fails.
      const canvas = page.locator('canvas.maplibregl-canvas');
      await canvas.hover({ position: { x: 120, y: 140 } });
      await page.mouse.down();
      await page.mouse.move(width > 760 ? 510 : 160, 190, { steps: 5 });
      await page.mouse.up();
      // Stop drag inertia by clicking on the map.
      await canvas.click({ position: { x: 120, y: 140 } });
      await settle();
      const baseline = await geometry();
      viewports.push({ width, height: 800, baseline });
      const stable = async (name) => {
        await settle();
        const actual = await geometry();
        assert(JSON.stringify(actual) === JSON.stringify(baseline),
          `${width}px ${name}: map/canvas/marker geometry changed: ${JSON.stringify({ baseline, actual })}`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${width}px ${name}: horizontal page overflow`);
        checks.push({ width, name });
      };
      await page.selectOption('#dem-provider', 'mapterhorn');
      await stable('GSI to Mapterhorn');
      await page.selectOption('#dem-provider', 'gsi');
      await stable('Mapterhorn to GSI');
      if (width > 760) {
        assert(baseline.map.height === 800, `${width}px: desktop map should fill the viewport`);
        const rect = await page.locator('#map').boundingBox();
        assert(Math.abs(rect.y) < 1, `${width}px: map scrolled out of the viewport`);
      } else {
        assert(baseline.map.height === 440, `${width}px: mobile map should retain 55dvh height`);
      }

      await page.locator('input[value="point"]').check();
      await canvas.click({ position: { x: 120, y: 140 } });
      await page.waitForFunction(() => document.querySelector('#elevation-result dl'));
      assert(await page.locator('#elevation-result').getAttribute('data-state') !== 'error', `${width}px: GSI point failed`);
      const coordinates = () => page.locator('#elevation-result dd').first().innerText();
      const point = await coordinates();
      await stable('point result');
      await page.selectOption('#dem-provider', 'mapterhorn');
      await page.waitForFunction(() => document.querySelector('#elevation-result dl')?.textContent.includes('Mapterhorn'));
      assert(await page.locator('#elevation-result').getAttribute('data-state') !== 'error', `${width}px: Mapterhorn point failed`);
      assert(await coordinates() === point, `${width}px: selected coordinates changed`);
      await stable('point provider switch');

      const finished = async () => {
        await page.waitForFunction(() => !document.querySelector('#profile-run').disabled
          && document.querySelector('#profile-status').textContent.startsWith('作成しました'));
        assert(await page.locator('#profile-status').getAttribute('data-state') !== 'error', `${width}px: profile failed`);
      };
      await page.locator('#profile-run').click();
      await finished();
      await stable('single profile');
      await page.selectOption('#dem-provider', 'gsi');
      await finished();
      await stable('profile provider switch');
      await page.locator('#profile-compare').click();
      await finished();
      await stable('comparison');
      await page.locator('#profile-stats summary').click();
      await stable('expanded samples');
      // Desktop map remains on screen while the long results panel scrolls.
      if (width > 760) {
        const rect = await page.locator('#map').boundingBox();
        assert(Math.abs(rect.y) < 1, `${width}px: map moved while scrolling results`);
      }
      // Reflow the same live map across the responsive breakpoint, then back.
      await page.setViewportSize({ width: width > 760 ? 375 : 1280, height: 800 });
      await settle();
      await page.setViewportSize({ width, height: 800 });
      await stable('viewport round trip');
    }
    assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
    return { timestamp: new Date().toISOString(), baseUrl,
      userAgent: await page.evaluate(() => navigator.userAgent), errors, viewports, checks };
  } finally { page.off('pageerror', onError); }
}
