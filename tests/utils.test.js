/**
 * Tests for renderer utility functions.
 * Extracted here to keep them testable without a browser context.
 */

// ---- Functions under test (duplicated from renderer.js) ----
// If these are ever extracted to lib/utils.js, import from there instead.

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(seconds) {
  if (!seconds) return '?';
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function parseFraction(str) {
  const parts = String(str).split('/');
  if (parts.length === 2) return Number(parts[0]) / Number(parts[1]);
  return Number(str);
}

// =============================================================================
// formatBytes
// =============================================================================
describe('formatBytes', () => {
  test('0 or falsy → "0 B"', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(null)).toBe('0 B');
    expect(formatBytes(undefined)).toBe('0 B');
  });

  test('bytes (< 1 KB) shown as integer B', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1)).toBe('1 B');
  });

  test('kilobytes shown with one decimal', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 100)).toBe('100.0 KB');
  });

  test('megabytes shown with one decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 50.5)).toBe('50.5 MB');
  });

  test('gigabytes shown with one decimal', () => {
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
    expect(formatBytes(1024 ** 3 * 2.5)).toBe('2.5 GB');
  });

  test('does not go beyond GB', () => {
    // 2 TB — should still display as GB (no TB unit defined)
    const result = formatBytes(1024 ** 4 * 2);
    expect(result).toMatch(/GB$/);
  });
});

// =============================================================================
// formatDuration
// =============================================================================
describe('formatDuration', () => {
  test('falsy input → "?"', () => {
    expect(formatDuration(0)).toBe('?');
    expect(formatDuration(null)).toBe('?');
    expect(formatDuration(undefined)).toBe('?');
  });

  test('seconds only (< 1 min)', () => {
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDuration(9)).toBe('0:09');
  });

  test('minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(3599)).toBe('59:59');
  });

  test('hours minutes seconds', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(7384)).toBe('2:03:04');
  });

  test('rounds fractional seconds', () => {
    expect(formatDuration(90.6)).toBe('1:31');
    expect(formatDuration(90.4)).toBe('1:30');
  });
});

// =============================================================================
// parseFraction
// =============================================================================
describe('parseFraction', () => {
  test('NTSC 30fps fraction', () => {
    expect(parseFraction('30000/1001')).toBeCloseTo(29.97, 2);
  });

  test('exact 30fps fraction', () => {
    expect(parseFraction('30/1')).toBe(30);
  });

  test('24fps fraction', () => {
    expect(parseFraction('24000/1001')).toBeCloseTo(23.976, 3);
  });

  test('plain numeric string', () => {
    expect(parseFraction('25')).toBe(25);
  });

  test('integer number passthrough', () => {
    expect(parseFraction(60)).toBe(60);
  });
});
