class VADProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};
    this.threshold = opts.threshold || 0.01; // RMS threshold
    this.hangoverMs = opts.hangoverMs || 300; // milliseconds to wait before declaring speech end
    this.sampleRate = sampleRate; // global in AudioWorkletProcessor

    this.frameBuffer = [];
    this.inSpeech = false;
    this.lastSpeechTime = 0;
    this._sendLevelEvery = opts.levelIntervalMs || 100; // send level updates every X ms (ms)
    // AudioWorklet provides a global currentTime (in seconds)
    this._lastLevelSent = currentTime; // seconds

    this.port.onmessage = (ev) => {
      // handle config updates
      if (ev.data && ev.data.type === "config") {
        const cfg = ev.data.payload || {};
        if (typeof cfg.threshold === "number") this.threshold = cfg.threshold;
        if (typeof cfg.hangoverMs === "number")
          this.hangoverMs = cfg.hangoverMs;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Typically input[0] is an array of channels
    const channelData = input[0];
    if (!channelData) return true;

    // Compute RMS for the frame
    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
      const s = channelData[i];
      sum += s * s;
    }
    const rms = Math.sqrt(sum / channelData.length);

    // currentTime is a global AudioWorklet time in seconds
    const now = currentTime;
    // Send periodic level updates
    if (now - this._lastLevelSent >= this._sendLevelEvery / 1000) {
      this.port.postMessage({ type: "level", rms });
      this._lastLevelSent = now;
    }

    if (rms >= this.threshold) {
      // voiced frame
      if (!this.inSpeech) {
        this.inSpeech = true;
        this.port.postMessage({ type: "speechstart", timestamp: now });
      }
      this.lastSpeechTime = now;
    } else {
      // silence frame
      if (this.inSpeech) {
        const elapsedMs = (now - this.lastSpeechTime) * 1000;
        if (elapsedMs > this.hangoverMs) {
          this.inSpeech = false;
          this.port.postMessage({ type: "speechend", timestamp: now });
        }
      }
    }

    return true;
  }
}

registerProcessor("vad-processor", VADProcessor);
