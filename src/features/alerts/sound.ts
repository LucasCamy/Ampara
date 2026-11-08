import { SOUND_VIBRATE, type AlertSound, type AlertVolume } from '../../domain/alerts'

/**
 * Sons dos avisos, gerados na hora com Web Audio: sem arquivo para baixar, funcionam offline e cabem em
 * poucas linhas. Cada categoria tem um motivo curto e reconhecível de olhos fechados:
 *  - remédio: dois tons subindo (ding-dong)          - água: uma gota curta
 *  - ajuda: três notas subindo, duas vezes (insiste)  - rede de apoio: dois tons descendo, graves
 *  - do par: sino suave                                - casa e contas: um clique neutro
 * O navegador só libera áudio depois de um toque na página: unlockAudio() roda no primeiro toque.
 */

interface Note {
  /** Hz */
  f: number
  /** início em s */
  at: number
  /** duração em s */
  d: number
  /** sino: senoide com cauda longa; senão triângulo curto */
  bell?: boolean
  /** a nota cai de altura (gota) */
  drop?: boolean
}

const MOTIFS: Record<AlertSound, Note[]> = {
  med: [
    { f: 660, at: 0, d: 0.18 },
    { f: 880, at: 0.2, d: 0.32 },
  ],
  water: [{ f: 1200, at: 0, d: 0.09, drop: true }],
  help: [
    { f: 784, at: 0, d: 0.14 },
    { f: 988, at: 0.16, d: 0.14 },
    { f: 1175, at: 0.32, d: 0.28 },
    { f: 784, at: 0.75, d: 0.14 },
    { f: 988, at: 0.91, d: 0.14 },
    { f: 1175, at: 1.07, d: 0.28 },
  ],
  support: [
    { f: 523, at: 0, d: 0.2 },
    { f: 392, at: 0.22, d: 0.34 },
  ],
  partner: [
    { f: 1047, at: 0, d: 0.6, bell: true },
    { f: 1568, at: 0.02, d: 0.5, bell: true },
  ],
  home: [{ f: 600, at: 0, d: 0.05 }],
}

const GAIN: Record<AlertVolume, number> = { LOW: 0.08, MEDIUM: 0.18, HIGH: 0.32 }

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    return null
  }
  return ctx
}

/** Primeiro toque na página: cria/retoma o áudio para que os avisos possam tocar depois sozinhos */
export function installAudioUnlock() {
  if (typeof window === 'undefined') return
  const unlock = () => {
    const c = audio()
    if (c && c.state === 'suspended') void c.resume().catch(() => undefined)
    if (c?.state === 'running') {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
}

export function playSound(sound: AlertSound, volume: AlertVolume) {
  const c = audio()
  if (!c) return
  if (c.state === 'suspended') void c.resume().catch(() => undefined)
  const t0 = c.currentTime + 0.02
  const peak = GAIN[volume]
  for (const n of MOTIFS[sound]) {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = n.bell ? 'sine' : 'triangle'
    osc.frequency.setValueAtTime(n.f, t0 + n.at)
    if (n.drop) osc.frequency.exponentialRampToValueAtTime(n.f * 0.55, t0 + n.at + n.d)
    const tail = n.bell ? 0.6 : 0.08
    g.gain.setValueAtTime(0, t0 + n.at)
    g.gain.linearRampToValueAtTime(peak, t0 + n.at + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + n.at + n.d + tail)
    osc.connect(g).connect(c.destination)
    osc.start(t0 + n.at)
    osc.stop(t0 + n.at + n.d + tail + 0.05)
  }
}

/** Vibração do Android (o iPhone não tem a API: não faz nada) */
export function vibrate(sound: AlertSound) {
  const pattern = SOUND_VIBRATE[sound]
  if (!pattern.length || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    /* sem permissão (iframe, aba em segundo plano): ignora */
  }
}
