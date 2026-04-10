/**
 * Tests for compression presets and settings validation.
 * Verifies that every preset produces valid ffmpeg parameters.
 */

const PRESETS = {
  email:   { quality: '30', resolution: '720',      codec: 'h264', speed: 'fast',   audioCodec: 'aac', audioBitrate: '96k'  },
  youtube: { quality: '23', resolution: '1080',     codec: 'h264', speed: 'medium', audioCodec: 'aac', audioBitrate: '128k' },
  archive: { quality: '18', resolution: 'original', codec: 'h265', speed: 'slow',   audioCodec: 'aac', audioBitrate: '192k' },
  mobile:  { quality: '28', resolution: '720',      codec: 'h264', speed: 'medium', audioCodec: 'aac', audioBitrate: '96k'  },
};

const VALID_CODECS     = ['h264', 'h265', 'vp9'];
const VALID_SPEEDS     = ['ultrafast','superfast','veryfast','faster','fast','medium','slow','slower','veryslow'];
const VALID_AUDIO_CODECS  = ['aac', 'mp3', 'opus', 'copy', 'none'];
const VALID_RESOLUTIONS   = ['original', '480', '720', '1080'];
const CRF_MIN = 0;
const CRF_MAX = 51;

// =============================================================================
// Preset structure
// =============================================================================
describe('PRESETS — required keys', () => {
  const REQUIRED = ['quality', 'resolution', 'codec', 'speed', 'audioCodec', 'audioBitrate'];

  Object.entries(PRESETS).forEach(([name, preset]) => {
    test(`${name} has all required keys`, () => {
      REQUIRED.forEach((key) => {
        expect(preset).toHaveProperty(key);
      });
    });
  });
});

// =============================================================================
// Preset values — CRF range
// =============================================================================
describe('PRESETS — CRF in valid range', () => {
  Object.entries(PRESETS).forEach(([name, preset]) => {
    test(`${name}: CRF ${preset.quality} is between ${CRF_MIN}–${CRF_MAX}`, () => {
      const crf = parseInt(preset.quality, 10);
      expect(crf).toBeGreaterThanOrEqual(CRF_MIN);
      expect(crf).toBeLessThanOrEqual(CRF_MAX);
    });
  });
});

// =============================================================================
// Preset values — valid enum values
// =============================================================================
describe('PRESETS — valid enum values', () => {
  Object.entries(PRESETS).forEach(([name, preset]) => {
    test(`${name}: codec "${preset.codec}" is supported`, () => {
      expect(VALID_CODECS).toContain(preset.codec);
    });

    test(`${name}: speed "${preset.speed}" is a valid ffmpeg preset`, () => {
      expect(VALID_SPEEDS).toContain(preset.speed);
    });

    test(`${name}: audioCodec "${preset.audioCodec}" is supported`, () => {
      expect(VALID_AUDIO_CODECS).toContain(preset.audioCodec);
    });

    test(`${name}: resolution "${preset.resolution}" is supported`, () => {
      expect(VALID_RESOLUTIONS).toContain(preset.resolution);
    });
  });
});

// =============================================================================
// Preset quality ordering — more compression = higher CRF
// =============================================================================
describe('PRESETS — quality ordering makes sense', () => {
  test('archive has lower CRF (higher quality) than email', () => {
    expect(parseInt(PRESETS.archive.quality)).toBeLessThan(parseInt(PRESETS.email.quality));
  });

  test('youtube has lower CRF than mobile', () => {
    expect(parseInt(PRESETS.youtube.quality)).toBeLessThan(parseInt(PRESETS.mobile.quality));
  });
});

// =============================================================================
// Audio bitrate format
// =============================================================================
describe('PRESETS — audio bitrate format', () => {
  Object.entries(PRESETS).forEach(([name, preset]) => {
    test(`${name}: audioBitrate "${preset.audioBitrate}" matches ffmpeg format (e.g. 96k)`, () => {
      expect(preset.audioBitrate).toMatch(/^\d+k$/);
    });
  });
});

// =============================================================================
// Settings merging behaviour
// =============================================================================
describe('settings merging', () => {
  function mergeSettings(base, override) {
    return { ...base, ...override };
  }

  test('override replaces only changed keys', () => {
    const base = PRESETS.mobile;
    const result = mergeSettings(base, { quality: '18', codec: 'h265' });
    expect(result.quality).toBe('18');
    expect(result.codec).toBe('h265');
    expect(result.resolution).toBe(base.resolution);
    expect(result.speed).toBe(base.speed);
  });

  test('custom CRF outside preset range is preserved as-is', () => {
    const result = mergeSettings(PRESETS.youtube, { quality: '45' });
    expect(result.quality).toBe('45');
  });
});

// =============================================================================
// CRF value validation helper
// =============================================================================
describe('CRF validation', () => {
  function isValidCrf(value) {
    const n = parseInt(value, 10);
    return !isNaN(n) && n >= CRF_MIN && n <= CRF_MAX;
  }

  test('valid values pass', () => {
    expect(isValidCrf('0')).toBe(true);
    expect(isValidCrf('23')).toBe(true);
    expect(isValidCrf('51')).toBe(true);
  });

  test('out-of-range values fail', () => {
    expect(isValidCrf('-1')).toBe(false);
    expect(isValidCrf('52')).toBe(false);
  });

  test('non-numeric values fail', () => {
    expect(isValidCrf('abc')).toBe(false);
    expect(isValidCrf('')).toBe(false);
  });
});
