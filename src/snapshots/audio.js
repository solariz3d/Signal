/**
 * AUDIO — Desktop loopback capture + AnalyserNode setup
 *
 * Uses getDisplayMedia with audio:'loopback' handler in main process.
 * Returns frequency data via an AnalyserNode for the renderer to consume.
 */

class SignalAudio {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.freqData = null;
    this.stream = null;
    this.isCapturing = false;
  }

  async start() {
    if (this.isCapturing) return true;

    try {
      // CRITICAL: Must request both audio AND video on Windows.
      // The video track gets stopped immediately — we only want audio.
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { width: 320, height: 240, frameRate: 30 }
      });

      const audioTracks = this.stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.error('[audio] No audio track in display media stream');
        return false;
      }
      console.log('[audio] Audio track:', audioTracks[0].label, audioTracks[0].getSettings());

      // Stop video tracks — we only need audio
      this.stream.getVideoTracks().forEach(t => t.stop());

      // Build audio graph
      this.ctx = new AudioContext();
      const source = this.ctx.createMediaStreamSource(this.stream);

      // Create analyser — fftSize 2048 gives 1024 frequency bins
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.75;
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -10;

      // CRITICAL: Connect source to analyser but NOT to destination
      // (otherwise the system audio plays back through speakers = echo feedback)
      source.connect(this.analyser);

      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.isCapturing = true;

      console.log('[audio] Capture started. sampleRate:', this.ctx.sampleRate, 'bins:', this.freqData.length);
      return true;
    } catch (err) {
      console.error('[audio] Start failed:', err);
      return false;
    }
  }

  /**
   * Get latest frequency data. Returns null if not capturing.
   */
  getFrequencyData() {
    if (!this.isCapturing || !this.analyser) return null;
    this.analyser.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.isCapturing = false;
  }
}

window.SignalAudio = SignalAudio;
