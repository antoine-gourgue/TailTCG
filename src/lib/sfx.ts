/**
 * Effets sonores des boosters, synthétisés avec la Web Audio API : aucun
 * fichier à charger, rien à licencier. Tout est court et discret. Le son
 * ne démarre qu'après un geste de l'utilisateur (règle des navigateurs),
 * ce qui est toujours le cas ici (déchirer, retourner).
 */

const KEY = "sfx";
let ctx: AudioContext | null = null;
let muted: boolean | null = null;

export function isMuted(): boolean {
  if (muted == null) {
    try {
      muted = localStorage.getItem(KEY) === "off";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(KEY, v ? "off" : "on");
  } catch {}
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Bruit blanc filtré, enveloppe attaque/relâche */
function noise(
  ac: AudioContext,
  { duration, from, to, gain, type = "bandpass", q = 1, attack = 0.01 }: {
    duration: number;
    from: number;
    to: number;
    gain: number;
    type?: BiquadFilterType;
    q?: number;
    attack?: number;
  },
  at = ac.currentTime
) {
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(to, at + duration);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(at);
  src.stop(at + duration + 0.05);
}

/** Note pure avec décroissance */
function tone(
  ac: AudioContext,
  freq: number,
  { duration, gain, type = "sine", delay = 0 }: { duration: number; gain: number; type?: OscillatorType; delay?: number }
) {
  const at = ac.currentTime + delay;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

export type Sfx = "tear" | "pop" | "flip" | "land" | "rare" | "ultra";

export function play(name: Sfx) {
  if (isMuted()) return;
  const ac = audio();
  if (!ac) return;
  switch (name) {
    case "tear":
      // Déchirure du plastique : souffle rugueux qui monte, puis un claquement
      noise(ac, { duration: 0.42, from: 900, to: 3200, gain: 0.35, q: 0.8, attack: 0.05 });
      noise(ac, { duration: 0.08, from: 4000, to: 1500, gain: 0.25, type: "highpass" }, ac.currentTime + 0.38);
      break;
    case "pop":
      // Les cartes jaillissent : whoosh descendant + petit éclat
      noise(ac, { duration: 0.35, from: 2400, to: 300, gain: 0.3, q: 1.2, attack: 0.02 });
      tone(ac, 880, { duration: 0.18, gain: 0.08, type: "triangle" });
      tone(ac, 1320, { duration: 0.22, gain: 0.06, type: "triangle", delay: 0.06 });
      break;
    case "flip":
      // Carte qu'on retourne : frottement bref + petit clic
      noise(ac, { duration: 0.12, from: 1800, to: 600, gain: 0.22, q: 0.7 });
      tone(ac, 1500, { duration: 0.04, gain: 0.05, type: "square", delay: 0.09 });
      break;
    case "land":
      tone(ac, 160, { duration: 0.09, gain: 0.12 });
      break;
    case "rare":
      // Carillon court, montée d'arpège
      [784, 988, 1175, 1568].forEach((f, i) => tone(ac, f, { duration: 0.5, gain: 0.09, delay: i * 0.07 }));
      tone(ac, 3136, { duration: 0.6, gain: 0.03, delay: 0.28 });
      break;
    case "ultra":
      // Grand carillon + nappe grave : la carte qui fait la soirée
      tone(ac, 98, { duration: 1.1, gain: 0.14, type: "triangle" });
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(ac, f, { duration: 0.9, gain: 0.09, delay: i * 0.08 }));
      [2093, 2637, 3136].forEach((f, i) => tone(ac, f, { duration: 1.2, gain: 0.035, delay: 0.5 + i * 0.1 }));
      noise(ac, { duration: 0.5, from: 4000, to: 9000, gain: 0.05, type: "highpass", attack: 0.2 }, ac.currentTime + 0.3);
      break;
  }
}
