// I mattoni delle animazioni dell'effort: sei tacche in un SVG 46x22, ognuna larga 5 e alta 12, poggiata a y 17

export const SLOTS = 6

// Per livello, da low a ultracode: quanto dura un giro dell'animazione e quanto si muove. Piu' effort, piu' in
// fretta e piu' ampio; low resta fermo
export const SECONDS = [0, 1.6, 1.3, 1.05, 0.85, 0.68]
export const AMOUNT = [0, 0.45, 0.6, 0.75, 0.9, 1]

export const OFF = 'fill="#888888" fill-opacity="0.35"'
// Un riflesso bianco sopra la tacca, invisibile finche' l'animazione non lo accende
export const GLINT = 'fill="#ffffff" opacity="0"'

// Curve dei tratti: su che rallenta, giu' che accelera, lineare, morbida ai due capi
export const UP = '0.2 0.7 0.4 1'
export const DOWN = '0.6 0 0.8 0.3'
export const LINEAR = '0 0 1 1'
export const SMOOTH = '0.4 0 0.6 1'

// Ordine sparso fra le sei tacche, per non farle partire insieme
export const SCATTER = [0, 0.37, 0.71, 0.13, 0.52, 0.88]

export type Timing = {
  seconds: number
  begin?: number
  keyTimes?: number[]
  // Una curva per ogni tratto fra due keyTimes
  splines?: string[]
  isDiscrete?: boolean
}

export function round(value: number) {
  return Number(value.toFixed(4))
}

export function animate(attribute: string, values: (number | string)[], timing: Timing) {
  const { seconds, begin = 0, keyTimes, splines, isDiscrete } = timing
  const list = values.map(value => (typeof value === 'number' ? round(value) : value)).join(';')
  const times = keyTimes ? ` keyTimes="${keyTimes.map(round).join(';')}"` : ''
  const mode = isDiscrete
    ? ' calcMode="discrete"'
    : splines
      ? ` calcMode="spline" keySplines="${splines.join(';')}"`
      : ''

  return `<animate attributeName="${attribute}" values="${list}"${times}${mode} dur="${round(seconds)}s" begin="${round(begin)}s" repeatCount="indefinite"/>`
}

export function rect(x: number, y: number, width: number, height: number, radius: number, paint: string, inner = '') {
  return `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="${radius}" ${paint}>${inner}</rect>`
}

export function fill(color: string) {
  return `fill="${color}"`
}

export function left(slot: number) {
  return slot * 8
}

export function tick(slot: number, paint: string, inner = '') {
  return rect(left(slot), 5, 5, 12, 1.5, paint, inner)
}

// Le sei tacche: le accese disegnate da `draw`, le spente grigie e ferme
export function row(rank: number, draw: (slot: number) => string, drawOff = (slot: number) => tick(slot, OFF)) {
  let out = ''

  for (let slot = 0; slot < SLOTS; slot += 1) {
    out += slot < rank ? draw(slot) : drawOff(slot)
  }

  return out
}

// Le tacche ferme: quelle accese nel colore del livello
export function still(rank: number, color: string) {
  return row(rank, slot => tick(slot, fill(color)))
}

// Altezza che cambia restando poggiata sulla base
export function grow(heights: number[], timing: Timing) {
  return animate('height', heights, timing) + animate('y', heights.map(height => 17 - height), timing)
}

// Battito: la tacca si gonfia dal centro, e la larghezza cresce la meta' dell'altezza
export function pulse(slot: number, scales: number[], timing: Timing) {
  const heights = scales.map(scale => 12 * scale)
  const widths = scales.map(scale => 5 * (1 + (scale - 1) * 0.5))

  return (
    animate('height', heights, timing) +
    animate('y', heights.map(height => 11 - height / 2), timing) +
    animate('width', widths, timing) +
    animate('x', widths.map(width => left(slot) + (5 - width) / 2), timing)
  )
}

// Andata e ritorno sulle tacche accese, senza ripetere i capi: 0, 1, 2, 1
export function pingPong(count: number) {
  const path: number[] = []

  for (let slot = 0; slot < count; slot += 1) {
    path.push(slot)
  }

  for (let slot = count - 2; slot >= 1; slot -= 1) {
    path.push(slot)
  }

  return path
}

export function spread(count: number, curve: string) {
  return Array<string>(count).fill(curve)
}

// Il colore schiarito verso il bianco: 0 lo lascia com'e', 1 e' bianco
export function lighten(color: string, amount: number) {
  const value = parseInt(color.slice(1), 16)
  const channel = (part: number) =>
    Math.round(part + (255 - part) * amount)
      .toString(16)
      .padStart(2, '0')

  return `#${channel(value >> 16)}${channel((value >> 8) & 255)}${channel(value & 255)}`
}

// Un alone sfocato; l'id serve alle tacche che lo usano con filter="url(#id)"
export function blur(id: string, deviation: number) {
  return `<defs><filter id="${id}" x="-100%" y="-50%" width="300%" height="200%"><feGaussianBlur stdDeviation="${deviation}"/></filter></defs>`
}
