/**
 * Tests for lib/compressor.js
 *
 * Mocks fluent-ffmpeg so no real ffmpeg binary is needed.
 * Verifies that compress() passes the correct flags to ffmpeg
 * based on the options it receives.
 */

// ---- fluent-ffmpeg mock ----
// Each test gets a fresh instance via beforeEach.
let mockCmd;

function makeMockCmd() {
  const cmd = {
    videoCodec: jest.fn().mockReturnThis(),
    audioCodec: jest.fn().mockReturnThis(),
    audioBitrate: jest.fn().mockReturnThis(),
    noAudio: jest.fn().mockReturnThis(),
    outputOptions: jest.fn().mockReturnThis(),
    on: jest.fn(),
    save: jest.fn(),
    kill: jest.fn(),
  };

  // .on('end', cb) and .on('error', cb) — trigger via helpers exposed on cmd
  cmd.on.mockImplementation((event, cb) => {
    if (event === 'end')      cmd._onEnd   = cb;
    if (event === 'error')    cmd._onError = cb;
    if (event === 'progress') cmd._onProgress = cb;
    return cmd;
  });

  return cmd;
}

const mockFfmpeg = jest.fn();
mockFfmpeg.setFfmpegPath  = jest.fn();
mockFfmpeg.setFfprobePath = jest.fn();
mockFfmpeg.ffprobe        = jest.fn();

jest.mock('fluent-ffmpeg',   () => mockFfmpeg);
jest.mock('ffmpeg-static',   () => '/mock/ffmpeg');
jest.mock('@ffprobe-installer/ffprobe',  () => ({ path: '/mock/ffprobe' }));

// Load module AFTER mocks are set up
const compressor = require('../lib/compressor');

// ---- helpers ----
const BASE_OPTS = {
  input:        '/input/video.mp4',
  output:       '/output/video_compressed.mp4',
  crf:          23,
  codec:        'h264',
  resolution:   'original',
  preset:       'medium',
  audioCodec:   'aac',
  audioBitrate: '96k',
  customArgs:   '',
  onProgress:   jest.fn(),
};

function compress(overrides = {}) {
  return compressor.compress({ ...BASE_OPTS, ...overrides });
}

// Resolve the promise by triggering the 'end' event on the mock command
function resolveCmd() {
  mockCmd._onEnd?.();
}

function rejectCmd(err) {
  mockCmd._onError?.(err);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCmd = makeMockCmd();
  mockFfmpeg.mockReturnValue(mockCmd);
});

// =============================================================================
// Video codec mapping
// =============================================================================
describe('video codec mapping', () => {
  test('h264 → libx264', async () => {
    const p = compress({ codec: 'h264' });
    resolveCmd();
    await p;
    expect(mockCmd.videoCodec).toHaveBeenCalledWith('libx264');
  });

  test('h265 → libx265', async () => {
    const p = compress({ codec: 'h265' });
    resolveCmd();
    await p;
    expect(mockCmd.videoCodec).toHaveBeenCalledWith('libx265');
  });

  test('vp9 → libvpx-vp9', async () => {
    const p = compress({ codec: 'vp9' });
    resolveCmd();
    await p;
    expect(mockCmd.videoCodec).toHaveBeenCalledWith('libvpx-vp9');
  });

  test('unknown codec falls back to libx264', async () => {
    const p = compress({ codec: 'unknown' });
    resolveCmd();
    await p;
    expect(mockCmd.videoCodec).toHaveBeenCalledWith('libx264');
  });
});

// =============================================================================
// Output options — CRF, preset, H.265 tag, VP9 bitrate, custom args
// =============================================================================
describe('outputOptions', () => {
  function getOutputOptions() {
    // Collect all args from every outputOptions() call
    return mockCmd.outputOptions.mock.calls.flat(2);
  }

  test('CRF is included in output options', async () => {
    const p = compress({ crf: 18 });
    resolveCmd();
    await p;
    expect(getOutputOptions()).toContain('-crf 18');
  });

  test('preset is included for h264', async () => {
    const p = compress({ codec: 'h264', preset: 'slow' });
    resolveCmd();
    await p;
    expect(getOutputOptions()).toContain('-preset slow');
  });

  test('preset is included for h265', async () => {
    const p = compress({ codec: 'h265', preset: 'fast' });
    resolveCmd();
    await p;
    expect(getOutputOptions()).toContain('-preset fast');
  });

  test('VP9 uses -b:v 0 instead of -preset', async () => {
    const p = compress({ codec: 'vp9', preset: 'medium' });
    resolveCmd();
    await p;
    const opts = getOutputOptions();
    expect(opts).toContain('-b:v 0');
    expect(opts.find((o) => o.startsWith('-preset'))).toBeUndefined();
  });

  test('h265 adds -tag:v hvc1 for macOS compatibility', async () => {
    const p = compress({ codec: 'h265' });
    resolveCmd();
    await p;
    expect(getOutputOptions()).toContain('-tag:v hvc1');
  });

  test('h264 does NOT add -tag:v hvc1', async () => {
    const p = compress({ codec: 'h264' });
    resolveCmd();
    await p;
    expect(getOutputOptions()).not.toContain('-tag:v hvc1');
  });

  test('custom args are appended to output options', async () => {
    const p = compress({ customArgs: '-vf hflip -metadata title=test' });
    resolveCmd();
    await p;
    const opts = getOutputOptions();
    expect(opts).toContain('-vf');
    expect(opts).toContain('hflip');
    expect(opts).toContain('-metadata');
    expect(opts).toContain('title=test');
  });

  test('empty customArgs adds nothing extra', async () => {
    const p = compress({ customArgs: '' });
    resolveCmd();
    await p;
    // Should not throw or add empty strings
    const opts = getOutputOptions();
    expect(opts.filter((o) => o === '')).toHaveLength(0);
  });

  test('resolution scaling added when not "original"', async () => {
    const p = compress({ resolution: '720' });
    resolveCmd();
    await p;
    expect(getOutputOptions()).toContain('-vf scale=-2:720');
  });

  test('resolution "original" — no scaling flag added', async () => {
    const p = compress({ resolution: 'original' });
    resolveCmd();
    await p;
    const hasScale = getOutputOptions().some((o) => o.startsWith('-vf scale'));
    expect(hasScale).toBe(false);
  });
});

// =============================================================================
// Audio options
// =============================================================================
describe('audio options', () => {
  test('aac → audioCodec("aac") + audioBitrate', async () => {
    const p = compress({ audioCodec: 'aac', audioBitrate: '128k' });
    resolveCmd();
    await p;
    expect(mockCmd.audioCodec).toHaveBeenCalledWith('aac');
    expect(mockCmd.audioBitrate).toHaveBeenCalledWith('128k');
  });

  test('mp3 → audioCodec("libmp3lame")', async () => {
    const p = compress({ audioCodec: 'mp3', audioBitrate: '192k' });
    resolveCmd();
    await p;
    expect(mockCmd.audioCodec).toHaveBeenCalledWith('libmp3lame');
  });

  test('opus → audioCodec("libopus")', async () => {
    const p = compress({ audioCodec: 'opus', audioBitrate: '96k' });
    resolveCmd();
    await p;
    expect(mockCmd.audioCodec).toHaveBeenCalledWith('libopus');
  });

  test('copy → audioCodec("copy"), no audioBitrate', async () => {
    const p = compress({ audioCodec: 'copy' });
    resolveCmd();
    await p;
    expect(mockCmd.audioCodec).toHaveBeenCalledWith('copy');
    expect(mockCmd.audioBitrate).not.toHaveBeenCalled();
  });

  test('none → noAudio(), no audioCodec set', async () => {
    const p = compress({ audioCodec: 'none' });
    resolveCmd();
    await p;
    expect(mockCmd.noAudio).toHaveBeenCalled();
    expect(mockCmd.audioCodec).not.toHaveBeenCalled();
  });

  test('missing audioCodec defaults to aac', async () => {
    const p = compress({ audioCodec: undefined });
    resolveCmd();
    await p;
    expect(mockCmd.audioCodec).toHaveBeenCalledWith('aac');
  });

  test('missing audioBitrate defaults to 96k', async () => {
    const p = compress({ audioCodec: 'aac', audioBitrate: undefined });
    resolveCmd();
    await p;
    expect(mockCmd.audioBitrate).toHaveBeenCalledWith('96k');
  });
});

// =============================================================================
// Progress callback
// =============================================================================
describe('progress callback', () => {
  test('calls onProgress with clamped percent', async () => {
    const onProgress = jest.fn();
    const p = compress({ onProgress });
    mockCmd._onProgress?.({ percent: 55.7 });
    resolveCmd();
    await p;
    expect(onProgress).toHaveBeenCalledWith(56);
  });

  test('clamps progress to max 99 before done', async () => {
    const onProgress = jest.fn();
    const p = compress({ onProgress });
    mockCmd._onProgress?.({ percent: 105 });
    resolveCmd();
    await p;
    expect(onProgress).toHaveBeenCalledWith(99);
  });

  test('handles missing percent gracefully (defaults to 0)', async () => {
    const onProgress = jest.fn();
    const p = compress({ onProgress });
    mockCmd._onProgress?.({});
    resolveCmd();
    await p;
    expect(onProgress).toHaveBeenCalledWith(0);
  });
});

// =============================================================================
// Promise resolution / rejection
// =============================================================================
describe('promise lifecycle', () => {
  test('resolves when ffmpeg fires "end"', async () => {
    const p = compress();
    resolveCmd();
    await expect(p).resolves.toBeUndefined();
  });

  test('rejects with ffmpeg error', async () => {
    const p = compress();
    rejectCmd(new Error('ffmpeg crashed'));
    await expect(p).rejects.toThrow('ffmpeg crashed');
  });

  test('rejects with "Cancelled" message when cancel() was called', async () => {
    const p = compress();
    compressor.cancel();
    rejectCmd(new Error('SIGKILL'));
    await expect(p).rejects.toThrow('Cancelled');
  });
});

// =============================================================================
// cancel / isCancelled
// =============================================================================
describe('cancel / isCancelled', () => {
  test('isCancelled() is false before compression starts', async () => {
    const p = compress();
    expect(compressor.isCancelled()).toBe(false);
    resolveCmd();
    await p;
  });

  test('isCancelled() is true after cancel()', async () => {
    const p = compress().catch(() => {});
    compressor.cancel();
    expect(compressor.isCancelled()).toBe(true);
    rejectCmd(new Error('killed'));
    await p;
  });

  test('cancel() calls kill on the current command', async () => {
    const p = compress().catch(() => {});
    compressor.cancel();
    expect(mockCmd.kill).toHaveBeenCalledWith('SIGKILL');
    rejectCmd(new Error('killed'));
    await p;
  });
});

// =============================================================================
// getFileInfo
// =============================================================================
describe('getFileInfo', () => {
  const mockMetadata = {
    format: { duration: 120.5, size: 50000000, bit_rate: '3000000' },
    streams: [
      {
        codec_type: 'video',
        codec_name: 'h264',
        width: 1920,
        height: 1080,
        r_frame_rate: '30000/1001',
      },
      {
        codec_type: 'audio',
        codec_name: 'aac',
        channels: 2,
        sample_rate: '48000',
      },
    ],
  };

  beforeEach(() => {
    mockFfmpeg.ffprobe.mockImplementation((_path, cb) => cb(null, mockMetadata));
  });

  test('returns duration, size, bitrate from format', async () => {
    const info = await compressor.getFileInfo('/video.mp4');
    expect(info.duration).toBe(120.5);
    expect(info.size).toBe(50000000);
    expect(info.bitrate).toBe('3000000');
  });

  test('returns parsed video stream info', async () => {
    const info = await compressor.getFileInfo('/video.mp4');
    expect(info.video).toEqual({
      codec: 'h264',
      width: 1920,
      height: 1080,
      fps: '30000/1001',
    });
  });

  test('returns parsed audio stream info', async () => {
    const info = await compressor.getFileInfo('/video.mp4');
    expect(info.audio).toEqual({
      codec: 'aac',
      channels: 2,
      sampleRate: '48000',
    });
  });

  test('video is null when no video stream present', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_path, cb) =>
      cb(null, {
        format: { duration: 10, size: 1000, bit_rate: '128000' },
        streams: [{ codec_type: 'audio', codec_name: 'mp3', channels: 2, sample_rate: '44100' }],
      })
    );
    const info = await compressor.getFileInfo('/audio.mp3');
    expect(info.video).toBeNull();
    expect(info.audio.codec).toBe('mp3');
  });

  test('rejects when ffprobe returns an error', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_path, cb) => cb(new Error('corrupt file')));
    await expect(compressor.getFileInfo('/bad.mp4')).rejects.toThrow('corrupt file');
  });
});
