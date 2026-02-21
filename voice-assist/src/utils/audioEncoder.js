/**
 * Audio encoding utilities for voice assistant
 * Converts browser audio to WAV format without backend conversion
 */

/**
 * Convert AudioBuffer or raw PCM data to WAV format
 * @param {Float32Array} audioData - PCM audio samples (-1 to 1)
 * @param {number} sampleRate - Sample rate (e.g., 16000)
 * @param {number} numChannels - Number of channels (1 for mono)
 * @returns {ArrayBuffer} WAV file data
 */
export function encodeWAV(audioData, sampleRate, numChannels = 1) {
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLength = audioData.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // PCM data (convert float32 to int16)
  floatTo16BitPCM(view, 44, audioData);

  return buffer;
}

/**
 * Write string to DataView
 */
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Convert Float32Array [-1, 1] to 16-bit PCM
 */
function floatTo16BitPCM(view, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

/**
 * Resample audio to target sample rate
 * @param {Float32Array} audioData - Input audio data
 * @param {number} fromRate - Current sample rate
 * @param {number} toRate - Target sample rate
 * @returns {Float32Array} Resampled audio
 */
export function resample(audioData, fromRate, toRate) {
  if (fromRate === toRate) return audioData;

  const ratio = fromRate / toRate;
  const newLength = Math.round(audioData.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexInt = Math.floor(srcIndex);
    const fraction = srcIndex - srcIndexInt;

    const sample1 = audioData[srcIndexInt] || 0;
    const sample2 = audioData[srcIndexInt + 1] || sample1;

    // Linear interpolation
    result[i] = sample1 + (sample2 - sample1) * fraction;
  }

  return result;
}

/**
 * Convert stereo to mono by averaging channels
 * @param {Float32Array} left - Left channel
 * @param {Float32Array} right - Right channel
 * @returns {Float32Array} Mono audio
 */
export function stereoToMono(left, right) {
  const mono = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    mono[i] = (left[i] + right[i]) / 2;
  }
  return mono;
}

/**
 * Calculate RMS (Root Mean Square) level of audio
 * @param {Float32Array} audioData - Audio samples
 * @returns {number} RMS value
 */
export function calculateRMS(audioData) {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  return Math.sqrt(sum / audioData.length);
}

/**
 * Convert Blob (webm/opus) to WAV using Web Audio API
 * @param {Blob} blob - Audio blob from MediaRecorder
 * @param {AudioContext} audioContext - Web Audio API context
 * @returns {Promise<ArrayBuffer>} WAV file data
 */
export async function convertBlobToWAV(blob, audioContext) {
  // Decode blob to AudioBuffer
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Get audio data from first channel (convert to mono if stereo)
  let audioData;
  if (audioBuffer.numberOfChannels === 1) {
    audioData = audioBuffer.getChannelData(0);
  } else {
    // Convert stereo to mono
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    audioData = stereoToMono(left, right);
  }

  // Resample to 16kHz (Whisper's preferred rate)
  const resampled = resample(audioData, audioBuffer.sampleRate, 16000);

  // Encode as WAV
  return encodeWAV(resampled, 16000, 1);
}
