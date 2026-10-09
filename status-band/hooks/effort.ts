// Per livello, da low a ultracode: quanto dura un tremolio e quanto si deforma la barra. Piu' effort, piu' in
// fretta e piu' ampio; low resta fermo
const JELLY_SECONDS = [0, 1.6, 1.3, 1.05, 0.85, 0.68]
const JELLY_AMOUNT = [0, 0.45, 0.6, 0.75, 0.9, 1]
const SLOTS = 6

// Il tremolio della gelatina: la barra si allunga, si schiaccia e si assesta, sempre poggiata sulla base
const JELLY_HEIGHTS = [12, 16, 9, 14, 11, 12.5, 12]
const JELLY_TIMES = '0;0.15;0.32;0.5;0.66;0.82;1'
const JELLY_SPLINES = Array(JELLY_HEIGHTS.length - 1)
  .fill('0.4 0 0.6 1')
  .join(';')

function round(value: number) {
  return Number(value.toFixed(2))
}

// Una barra che tremola: altezza, larghezza e posizione cambiano insieme, cosi' la base resta ferma e la barra
// si allarga quando si schiaccia, come una gelatina
function jelly(slot: number, seconds: number, amount: number) {
  const heights = JELLY_HEIGHTS.map(height => 12 + (height - 12) * amount)
  const widths = heights.map(height => 5 * Math.sqrt(12 / height))
  const timing = `keyTimes="${JELLY_TIMES}" calcMode="spline" keySplines="${JELLY_SPLINES}" dur="${seconds}s" begin="${round(slot * seconds * 0.1)}s" repeatCount="indefinite"`
  const animate = (attribute: string, values: number[]) =>
    `<animate attributeName="${attribute}" values="${values.map(round).join(';')}" ${timing}/>`

  return (
    animate('height', heights) +
    animate('y', heights.map(height => 17 - height)) +
    animate('width', widths) +
    animate('x', widths.map(width => slot * 8 + (5 - width) / 2))
  )
}

// Le tacche dell'effort per l'app: quelle accese nel colore del livello, le altre in grigio. Mentre Claude
// lavora le accese tremolano come gelatina, una dopo l'altra
export function effortSvg(rank: number, color: string, isMoving: boolean) {
  const seconds = JELLY_SECONDS[rank - 1] ?? 0
  const amount = JELLY_AMOUNT[rank - 1] ?? 0
  let ticks = ''

  for (let slot = 0; slot < SLOTS; slot += 1) {
    const isOn = slot < rank
    const wobble = isOn && isMoving && seconds > 0 ? jelly(slot, seconds, amount) : ''
    const paint = isOn ? `fill="${color}"` : 'fill="#888888" fill-opacity="0.35"'

    ticks += `<rect x="${slot * 8}" y="5" width="5" height="12" rx="1.5" ${paint}>${wobble}</rect>`
  }

  // Per animarsi l'SVG viene disegnato in un riquadro a parte, e col tema scuro l'app gli mette dietro uno sfondo
  // bianco: dichiarando che segue il tema, lo sfondo torna trasparente
  const root = isMoving ? ' style="color-scheme:light dark"' : ''
  const sheet = isMoving
    ? '<style>:root{color-scheme:light dark}html,body{background:transparent!important}</style>'
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 22" width="38" height="18"${root}>${sheet}${ticks}</svg>`
}
