// Run against a Vite development server; pass scripts/dem-rgb-fixtures.json as fixtures.
// This tests the actual decoder module, separately from production UI verification.
export async function verifyDemRgb(page, fixtures) {
  return page.evaluate(async (expected) => {
    const { decodeTileImage } = await import('/poc-maplibre/src/dem/loader.ts');
    const level = { label: 'fixture', zoom: 16, urlTemplate: '', tileSize: 512, encoding: 'terrarium' };
    const results = {};
    for (const format of ['PNG', 'WEBP']) {
      const blob = await (await fetch('data:image/' + format.toLowerCase() + ';base64,' + expected[format])).blob();
      const data = await decodeTileImage(blob, level);
      const values = Array.from(data.slice(0, 5), (v) => Number.isNaN(v) ? null : v);
      if (JSON.stringify(values) !== JSON.stringify([100.5, -0.25, 0, null, null])) throw Error('RGB/alpha mismatch: ' + format);
      results[format] = values;
    }
    const response = await fetch('https://tiles.mapterhorn.com/16/58208/25804.webp');
    if (!response.ok) throw Error('Real tile request failed: ' + response.status);
    const blob = await response.blob();
    const data = await decodeTileImage(blob, level);
    const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0); bitmap.close();
    const rgba = context.getImageData(0, 0, 512, 512).data;
    const rgb = new Uint8Array(512 * 512 * 3);
    for (let i = 0; i < 512 * 512; i++) rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', rgb)),
      (b) => b.toString(16).padStart(2, '0')).join('');
    // A future upstream update requires a new independent Python/Pillow reference digest.
    if (hash !== expected.realTileRgbSha256) throw Error('Real tile RGB digest mismatch or upstream data changed');
    return { fixtures: results, realTile: { url: response.url, status: response.status, bytes: blob.size,
      rgbSha256: hash, firstElevations: Array.from(data.slice(0, 5)) }, browser: navigator.userAgent };
  }, fixtures);
}
