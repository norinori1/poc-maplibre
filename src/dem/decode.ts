// 国土地理院 標高PNG: x = 2^16·R + 2^8·G + B。x < 2^23 なら h = x × 0.01 m、
// x = 2^23 は欠測、x > 2^23 は (x - 2^24) × 0.01 m(負の標高)。
const NO_DATA = 2 ** 23;
const RANGE = 2 ** 24;

/** 1画素のRGBを標高(m)へ変換する。欠測は null(0 m にはしない)。 */
export function decodeGsiElevation(r: number, g: number, b: number): number | null {
  const x = r * 65536 + g * 256 + b;
  if (x === NO_DATA) return null;
  return (x < NO_DATA ? x : x - RANGE) * 0.01;
}
