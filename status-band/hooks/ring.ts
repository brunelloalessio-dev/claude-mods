import { TONES, WARM_GRAY } from './palette'
import type { Tone } from './palette'

// I colori dell'arco per soglia stanno nella palette: l'SVG e' un'immagine e non legge il tema dell'app
const RADIUS = 14
const LENGTH = 2 * Math.PI * RADIUS
const FONT = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

// Un anello sottile con la percentuale al centro: traccia grigia semitrasparente (regge tema chiaro e scuro) e
// arco colorato. Il numero prende il colore dell'arco, che si legge su entrambi i temi
export function ringSvg(percent: number, tone: Tone) {
  const value = Math.min(100, Math.max(0, percent))
  const arc = (value / 100) * LENGTH
  const color = TONES[tone]

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="30" height="30">',
    `<circle cx="18" cy="18" r="${RADIUS}" fill="none" stroke="${WARM_GRAY}" stroke-opacity="0.35" stroke-width="2.5"/>`,
    `<circle cx="18" cy="18" r="${RADIUS}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${arc.toFixed(1)} ${LENGTH.toFixed(1)}" transform="rotate(-90 18 18)"/>`,
    `<text x="18" y="22.5" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="600" fill="${color}">${Math.round(value)}</text>`,
    '</svg>',
  ].join('')
}
