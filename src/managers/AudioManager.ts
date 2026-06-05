class AudioManager {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  // Nodes
  private ambientGain: GainNode | null = null;
  private jetpackGain: GainNode | null = null;
  
  // States
  private isJetpacking = false;

  public init() {
    if (this.isInitialized) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.isInitialized = true;
      
      this.setupJetpackNode();
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  public startAmbientDrone() {
    if (!this.ctx) return;
    
    // Create a deep, low frequency drone with layered oscillators
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    
    osc1.type = 'sine';
    osc2.type = 'triangle';
    
    osc1.frequency.value = 55.0; // Low A1
    osc2.frequency.value = 55.5; // Slight detune for phasing
    
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.15; // Keep it subtle
    
    // Lowpass filter to make it distant
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    
    // LFO for volume pulsing
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.1; // Very slow pulse
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.05;
    
    lfo.connect(lfoGain);
    lfoGain.connect(this.ambientGain.gain);
    
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(this.ambientGain);
    this.ambientGain.connect(this.ctx.destination);
    
    osc1.start();
    osc2.start();
    lfo.start();
  }

  public playScannerPing() {
    if (!this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime); // High pitch ping
    osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.5);
    
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.8);
    
    // Add delay/echo
    const delay = this.ctx.createDelay();
    delay.delayTime.value = 0.3;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.4;
    
    delay.connect(feedback);
    feedback.connect(delay);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    gain.connect(delay);
    delay.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 1.0);
  }

  private setupJetpackNode() {
    if (!this.ctx) return;
    
    // Brown noise generator (simulating deep rushing thrust)
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02; // Brown noise algorithm
      lastOut = output[i];
      output[i] *= 3.5; // Compensate for low volume
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400; // Muffled rumbling
    
    this.jetpackGain = this.ctx.createGain();
    this.jetpackGain.gain.value = 0; // Starts silent
    
    noise.connect(filter);
    filter.connect(this.jetpackGain);
    this.jetpackGain.connect(this.ctx.destination);
    
    noise.start();
  }

  public setJetpackActive(active: boolean) {
    if (!this.ctx || !this.jetpackGain || this.isJetpacking === active) return;
    
    this.isJetpacking = active;
    
    // In Web Audio API, cancelScheduledValues stops previously scheduled ramps
    if (active) {
      this.jetpackGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.jetpackGain.gain.setTargetAtTime(0.6, this.ctx.currentTime, 0.1);
    } else {
      this.jetpackGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.jetpackGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.2);
    }
  }

  public playLowOxygenWarning() {
    if (!this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.setValueAtTime(600, this.ctx.currentTime + 0.1); // Harsh two-tone beep
    
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.3); // Quick fade out
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }
}

export const audioManager = new AudioManager();
