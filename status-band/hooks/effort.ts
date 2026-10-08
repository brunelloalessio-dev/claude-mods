// Quanto dura un'onda per livello, da low a ultracode: piu' effort, piu' in fretta; low resta fermo
const WAVE_SECONDS = [0, 2.4, 1.6, 1.1, 0.7, 0.5]
const SLOTS = 6

// Le tacche dell'effort per l'app: quelle accese nel colore del livello, le altre in grigio. Mentre Claude
// lavora un'onda le attraversa, e da max in su si allungano anche
export function effortSvg(rank: number, color: string, isMoving: boolean) {
  const seconds = WAVE_SECONDS[rank - 1] ?? 0
  let ticks = ''

  for (let slot = 0; slot < SLOTS; slot += 1) {
    const isOn = slot < rank
    const begin = ((slot * seconds) / Math.max(1, rank)).toFixed(2)
    const timing = `dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"`
    const stretch =
      rank >= 5
        ? `<animate attributeName="height" values="12;20;12" ${timing}/><animate attributeName="y" values="5;1;5" ${timing}/>`
        : ''
    const wave =
      isOn && isMoving && seconds > 0
        ? `<animate attributeName="opacity" values="1;0.3;1" ${timing}/>${stretch}`
        : ''
    const paint = isOn ? `fill="${color}"` : 'fill="#888888" fill-opacity="0.35"'

    ticks += `<rect x="${slot * 8}" y="5" width="5" height="12" rx="1.5" ${paint}>${wave}</rect>`
  }

  // Per animarsi l'SVG viene disegnato in un riquadro a parte, e col tema scuro l'app gli mette dietro uno sfondo
  // bianco: dichiarando che segue il tema, lo sfondo torna trasparente
  const root = isMoving ? ' style="color-scheme:light dark"' : ''
  const sheet = isMoving
    ? '<style>:root{color-scheme:light dark}html,body{background:transparent!important}</style>'
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 22" width="38" height="18"${root}>${sheet}${ticks}</svg>`
}
