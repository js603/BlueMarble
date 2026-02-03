
// Procedural Audio Generator for Nebula Marble
// Theme: C Major Pentatonic, Shuffle Rhythm, Upbeat
// Instruments: Marimba, Piano-ish, Bass, Drums

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let isPlaying = false;
let isMuted = false;

// Scheduling
let nextNoteTime = 0.0;
let currentBeat = 0; // 0 to 7 (8th notes in 4/4 bar)
const BPM = 110;
const LOOKAHEAD = 25.0; // ms
const SCHEDULE_AHEAD_TIME = 0.1; // s
let timerID: number | null = null;

// Scale: C Major Pentatonic (C, D, E, G, A)
// Extended range for melody
const SCALE = [
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.00, // G4
  440.00, // A4
  523.25, // C5
  587.33, // D5
  659.25, // E5
  783.99, // G5
];

export const initAudio = () => {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3; // Master volume
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
};

export const startBGM = () => {
    if (!audioCtx) initAudio();
    if (isPlaying) return;
    
    isPlaying = true;
    currentBeat = 0;
    // Start slightly in future
    nextNoteTime = audioCtx!.currentTime + 0.1;
    scheduler();
};

export const stopBGM = () => {
    isPlaying = false;
    if (timerID !== null) window.clearTimeout(timerID);
};

export const toggleMute = (mute: boolean) => {
    isMuted = mute;
    if (masterGain && audioCtx) {
        const now = audioCtx.currentTime;
        // Smooth fade
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setTargetAtTime(isMuted ? 0 : 0.3, now, 0.1);
    }
};

function scheduler() {
    if (!audioCtx) return;
    while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_TIME) {
        scheduleNote(currentBeat, nextNoteTime);
        advanceNote();
    }
    if (isPlaying) {
        timerID = window.setTimeout(scheduler, LOOKAHEAD);
    }
}

function advanceNote() {
    const secondsPerBeat = 60.0 / BPM;
    // 4/4 Shuffle Rhythm (Swing)
    // Even beats (1, 2, 3, 4) are longer (approx 60-66%)
    // Odd beats (and) are shorter (approx 33-40%)
    const swingFactor = 0.60; 
    
    // currentBeat is 8th note index (0-7)
    // 0 is downbeat, 1 is upbeat
    if (currentBeat % 2 === 0) {
        nextNoteTime += secondsPerBeat * swingFactor;
    } else {
        nextNoteTime += secondsPerBeat * (1 - swingFactor);
    }
    
    currentBeat++;
    if (currentBeat === 8) {
        currentBeat = 0;
    }
}

function scheduleNote(beat: number, time: number) {
    if (!audioCtx || !masterGain) return;

    // --- Rhythm Section ---
    
    // Kick: Beats 1 (0) and 3 (4)
    if (beat === 0 || beat === 4) {
        playKick(time);
    }
    
    // Snare: Beats 2 (2) and 4 (6)
    // Add ghost notes occasionally on off-beats for groove
    if (beat === 2 || beat === 6) {
        playSnare(time);
    }

    // Hi-Hat: Every 8th note, accent on downbeats
    playHiHat(time, beat % 2 === 0);

    // --- Bass Section ---
    // Root on 1, 5th on 3
    if (beat === 0) playBass(time, 130.81); // C3
    if (beat === 4) playBass(time, 196.00); // G3

    // --- Melody Section (Marimba) ---
    // Improvisational Pentatonic
    // Play on random beats, higher chance on downbeats
    // Avoid playing too dense
    const density = beat % 2 === 0 ? 0.7 : 0.4;
    
    if (Math.random() < density) {
        // Pick a note
        const noteIdx = Math.floor(Math.random() * SCALE.length);
        const freq = SCALE[noteIdx];
        playMarimba(time, freq);
        
        // Occasionally play a harmony (3rd interval approx)
        if (Math.random() < 0.3) {
             const harmonyIdx = (noteIdx + 2) % SCALE.length;
             playMarimba(time, SCALE[harmonyIdx], 0.5); // Lower volume
        }
    }
}

// --- Synthesizers ---

function playKick(time: number) {
    if (!audioCtx || !masterGain) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
    
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
    
    osc.start(time);
    osc.stop(time + 0.5);
}

function playSnare(time: number) {
    if (!audioCtx || !masterGain) return;
    
    // Noise
    const bufferSize = audioCtx.sampleRate * 0.1; // 0.1s noise
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;
    
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.5, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    
    // Tonal snap
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, time);
    const oscGain = audioCtx.createGain();
    oscGain.gain.setValueAtTime(0.3, time);
    oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    
    noise.start(time);
    osc.start(time);
    osc.stop(time + 0.2);
}

function playHiHat(time: number, accent: boolean) {
    if (!audioCtx || !masterGain) return;
    
    // High freq noise
    const bufferSize = audioCtx.sampleRate * 0.05;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const bandpass = audioCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 10000;
    
    const gain = audioCtx.createGain();
    const vol = accent ? 0.3 : 0.1;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
    
    noise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(masterGain);
    
    noise.start(time);
}

function playBass(time: number, freq: number) {
    if (!audioCtx || !masterGain) return;
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.linearRampToValueAtTime(0.3, time + 0.1);
    gain.gain.linearRampToValueAtTime(0, time + 0.5); // Decay
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start(time);
    osc.stop(time + 0.5);
}

function playMarimba(time: number, freq: number, volume = 0.4) {
    if (!audioCtx || !masterGain) return;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.01); // Quick attack
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.4); // Decay
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start(time);
    osc.stop(time + 0.4);
}
    