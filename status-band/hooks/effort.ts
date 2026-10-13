import type { EffortStylePick } from '../types'

import { still } from './effort-kit'
import { EFFORT_STYLES } from './effort-styles'

export const EFFORT_STYLE_NAMES = Object.keys(EFFORT_STYLES)
// Lo stile di prima del giro: lo usa la fascia finche' la chat non ne ha pescato uno
const DEFAULT_STYLE = 'gelatina'

// Un numero a caso fra 0 e 1, escluso l'1
export function randomUnit() {
  return (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / 2 ** 32
}

// Lo stile dell'animazione per la chat: nella stessa conversazione resta quello gia' pescato (un reload della mod
// non lo cambia), una conversazione nuova ne pesca un altro. Uno stile tolto dal giro viene ripescato
export function pickEffortStyle(previous: EffortStylePick | null, conversation: string, random: number): EffortStylePick {
  if (previous?.conversation === conversation && previous.style in EFFORT_STYLES) {
    return previous
  }

  const index = Math.min(Math.floor(random * EFFORT_STYLE_NAMES.length), EFFORT_STYLE_NAMES.length - 1)

  return { conversation, style: EFFORT_STYLE_NAMES[index] ?? DEFAULT_STYLE }
}

// Le tacche dell'effort per l'app: quelle accese nel colore del livello, le altre in grigio. Mentre Claude
// lavora le accese si animano nello stile della chat
export function effortSvg(rank: number, color: string, isMoving: boolean, style: string = DEFAULT_STYLE) {
  const chosen = EFFORT_STYLES[style] ?? EFFORT_STYLES[DEFAULT_STYLE]
  const ticks =
    isMoving && rank >= 2 && chosen !== undefined ? chosen.moving(rank, color) : (chosen?.still ?? still)(rank, color)

  // Per animarsi l'SVG viene disegnato in un riquadro a parte, e col tema scuro l'app gli mette dietro uno sfondo
  // bianco: dichiarando che segue il tema, lo sfondo torna trasparente
  const root = isMoving ? ' style="color-scheme:light dark"' : ''
  const sheet = isMoving
    ? '<style>:root{color-scheme:light dark}html,body{background:transparent!important}</style>'
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 22" width="38" height="18"${root}>${sheet}${ticks}</svg>`
}
