import { events } from "../utils/EventBus";

class AudioManager {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  // Nodes
  private ambientGain: GainNode | null = null;
  private jetpackGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // States
  private isJetpacking = false;

  constructor() {
    // Feel SFX are event-driven; every handler no-ops until init() runs
    // (which happens on the start-screen click, satisfying autoplay policy).
    events.on("player:footstep", () => this.playFootstep());
    events.on("player:land", (impactSpeed) =>
      this.playLanding(Math.min(1, impactSpeed / 20)),
    );
    events.on("player:jump", () => this.playJump());
    events.on("pickup:collected", () => this.playPickup());
    events.on("datapad:collected", () => this.playPickup());
    events.on("beacon:collected", () => this.playBeaconActivate());
  }

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

  /** Cached 0.3s white-noise buffer shared by the percussive SFX. */
  private getNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noiseBuffer) {
      const len = Math.floor(this.ctx.sampleRate * 0.3);
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  /** Short filtered noise tap — regolith crunch underfoot. */
  public playFootstep() {
    if (!this.ctx) return;
    const buffer = this.getNoiseBuffer();
    if (!buffer) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 320 + Math.random() * 280; // vary each step
    filter.Q.value = 1.2;

    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(t);
    src.stop(t + 0.1);
  }

  /** Weighty thump scaled by impact: low sine drop + noise crunch. */
  public playLanding(intensity: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.2);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.25 * intensity, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);

    const buffer = this.getNoiseBuffer();
    if (buffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.12 * intensity, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(t);
      src.stop(t + 0.16);
    }
  }

  /** Airy upward whoosh on takeoff. */
  public playJump() {
    if (!this.ctx) return;
    const buffer = this.getNoiseBuffer();
    if (!buffer) return;
    const t = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(1100, t + 0.15);
    filter.Q.value = 2.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(t);
    src.stop(t + 0.2);
  }

  /** Bright two-note chime for oxygen canisters. */
  public playPickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [660, 990].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t + i * 0.09;
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  }

  /** Rising triad with echo — a beacon coming online is a big moment. */
  public playBeaconActivate() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    const delay = this.ctx.createDelay();
    delay.delayTime.value = 0.25;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.35;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(this.ctx.destination);

    [440, 554, 659, 880].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = t + i * 0.12;
      gain.gain.setValueAtTime(0.14, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      gain.connect(delay);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  }

  /** Snappy descending zap for the arc cutter. */
  public playArcFire() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1900, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.09);
    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  /** Low dissonant rumble-chirp when storm-spawn vent from the ground. */
  public playCreatureAlert() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [92, 118].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.6, t + 0.6);
      gain.gain.setValueAtTime(0.0001, t + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.07, t + 0.15 + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.85);
    });
  }

  /** Glassy shatter when a storm-spawn dies. */
  public playCreatureDeath() {
    if (!this.ctx) return;
    const noise = this.getNoiseBuffer();
    if (!noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(2400, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(t);
    src.stop(t + 0.32);

    // A falling chime under the shatter
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1320, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.25);
    og.gain.setValueAtTime(0.08, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(og);
    og.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  public playUIClick() {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.05);
      
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 0.06);
    } catch (e) {
      console.warn("Error playing UI click", e);
    }
  }
}

export const audioManager = new AudioManager();
