const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
const ffprobePath = require('@ffprobe-installer/ffprobe').path.replace('app.asar', 'app.asar.unpacked');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

let currentCommand = null;
let cancelled = false;

function isCancelled() {
  return cancelled;
}

function cancel() {
  cancelled = true;
  if (currentCommand) {
    currentCommand.kill('SIGKILL');
    currentCommand = null;
  }
}

function compress({ input, output, crf, codec, resolution, preset, audioCodec, audioBitrate, customArgs, fps, onProgress }) {
  cancelled = false;

  return new Promise((resolve, reject) => {
    const codecMap = { h264: 'libx264', h265: 'libx265', vp9: 'libvpx-vp9' };
    const videoCodec = codecMap[codec] || 'libx264';

    const outputOptions = [`-crf ${crf}`];
    // VP9 uses -b:v 0 instead of preset
    if (videoCodec !== 'libvpx-vp9') {
      outputOptions.push(`-preset ${preset}`);
    } else {
      outputOptions.push('-b:v 0');
    }
    if (videoCodec === 'libx265') {
      outputOptions.push('-tag:v hvc1'); // macOS compatibility
    }

    if (fps && fps !== 'original') {
      outputOptions.push(`-r ${fps}`);
    }

    // Custom ffmpeg args
    if (customArgs) {
      customArgs.split(' ').filter(Boolean).forEach((arg) => outputOptions.push(arg));
    }

    let cmd = ffmpeg(input).videoCodec(videoCodec).outputOptions(outputOptions);

    // Audio
    const ac = audioCodec || 'aac';
    if (ac === 'none') {
      cmd = cmd.noAudio();
    } else if (ac === 'copy') {
      cmd = cmd.audioCodec('copy');
    } else {
      const acMap = { aac: 'aac', mp3: 'libmp3lame', opus: 'libopus' };
      cmd = cmd.audioCodec(acMap[ac] || 'aac').audioBitrate(audioBitrate || '96k');
    }

    if (resolution && resolution !== 'original') {
      cmd = cmd.outputOptions([`-vf scale=-2:${resolution}`]);
    }

    currentCommand = cmd;

    cmd
      .on('progress', (p) => {
        const percent = Math.min(Math.round(p.percent || 0), 99);
        onProgress?.(percent);
      })
      .on('end', () => {
        currentCommand = null;
        resolve();
      })
      .on('error', (err) => {
        currentCommand = null;
        if (cancelled) {
          reject(new Error('Cancelled'));
        } else {
          reject(err);
        }
      })
      .save(output);
  });
}

function getFileInfo(filePath) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('ffprobe timeout')), 10000);

    ffmpeg.ffprobe(filePath, (err, metadata) => {
      clearTimeout(timeout);
      if (err) return reject(err);

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

      resolve({
        duration: metadata.format.duration,
        size: metadata.format.size,
        bitrate: metadata.format.bit_rate,
        video: videoStream
          ? {
              codec: videoStream.codec_name,
              width: videoStream.width,
              height: videoStream.height,
              fps: videoStream.r_frame_rate,
            }
          : null,
        audio: audioStream
          ? {
              codec: audioStream.codec_name,
              channels: audioStream.channels,
              sampleRate: audioStream.sample_rate,
            }
          : null,
      });
    });
  });
}

module.exports = { compress, getFileInfo, cancel, isCancelled };
