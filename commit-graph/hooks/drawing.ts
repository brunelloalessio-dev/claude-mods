import type { GraphRow, Segment } from '../types'

// L'Svg è un'immagine e non legge il tema: colori fissi che reggono sia il chiaro sia lo scuro
const ORANGE = '#D97757'
const GRAY = '#8a8a8a'

export const ROW_HEIGHT = 22
export const BUTTON_ROW_HEIGHT = 30
const PAD = 9
const MAX_SPACING = 12
const MIN_SPACING = 6
// Con tanti rami affiancati le corsie si stringono, perché il grafo non mangi la barra laterale
const MAX_GRAPH = 110

export type Geometry = { spacing: number; width: number }

export function geometry(lanes: number): Geometry {
  const gaps = Math.max(1, lanes - 1)
  const spacing = Math.max(MIN_SPACING, Math.min(MAX_SPACING, Math.floor(MAX_GRAPH / gaps)))

  return { spacing, width: PAD * 2 + (lanes - 1) * spacing }
}

const x = (lane: number, at: Geometry) => PAD + lane * at.spacing

function stroke(style: number): string {
  if (style === 1) {
    return `stroke="${ORANGE}"`
  }

  return style === 2 ? `stroke="${GRAY}" stroke-dasharray="3 3"` : `stroke="${GRAY}"`
}

function trace([fromLane, fromY, toLane, toY]: Segment, height: number, at: Geometry): string {
  const ys = [0, height / 2, height]
  const x1 = x(fromLane, at)
  const x2 = x(toLane, at)
  const y1 = ys[fromY] ?? 0
  const y2 = ys[toY] ?? height

  // Tangenti verticali ai due capi: sul bordo della riga il tratto prosegue dritto in quella accanto
  return x1 === x2
    ? `M${x1} ${y1}V${y2}`
    : `M${x1} ${y1}C${x1} ${y1 + (y2 - y1) * 0.7} ${x2} ${y1 + (y2 - y1) * 0.3} ${x2} ${y2}`
}

// Un solo path per stile: con quindici rami affiancati le righe restano leggere anche con mille commit.
// Prima i tratti grigi, poi quelli arancio sopra
function paths(segments: Segment[], height: number, at: Geometry): string {
  return [0, 2, 1]
    .map(style => {
      const d = segments
        .filter(segment => segment[4] === style)
        .map(segment => trace(segment, height, at))
        .join('')

      return d === '' ? '' : `<path d="${d}" fill="none" ${stroke(style)} stroke-width="1.5"/>`
    })
    .join('')
}

function dot(row: GraphRow, height: number, at: Geometry): string {
  const cx = x(row.lane, at)
  const cy = height / 2

  switch (row.kind) {
    case 3:
      return `<circle cx="${cx}" cy="${cy}" r="3.5" fill="none" stroke="${GRAY}" stroke-width="1.2" stroke-dasharray="2 2"/>`
    case 2:
      return `<circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="${ORANGE}" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="2" fill="${ORANGE}"/>`
    case 1:
      return `<circle cx="${cx}" cy="${cy}" r="3" fill="${ORANGE}"/>`
    default:
      return `<circle cx="${cx}" cy="${cy}" r="3" fill="${GRAY}"/>`
  }
}

function svg(body: string, height: number, at: Geometry): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${at.width}" height="${height}" viewBox="0 0 ${at.width} ${height}">${body}</svg>`
}

export function rowSvg(row: GraphRow, at: Geometry): string {
  return svg(paths(row.segments, ROW_HEIGHT, at) + dot(row, ROW_HEIGHT, at), ROW_HEIGHT, at)
}

// Sotto una riga aperta le linee proseguono dritte accanto al dettaglio: sono quelle che escono dal bordo basso
export function gapSvg(row: GraphRow | null, height: number, at: Geometry): string {
  const byLane = new Map<number, number>()

  for (const [, , toLane, toY, style] of row?.segments ?? []) {
    if (toY === 2 && byLane.get(toLane) !== 1) {
      byLane.set(toLane, style)
    }
  }

  const lines: Segment[] = [...byLane].map(([lane, style]) => [lane, 0, lane, 2, style])

  return svg(paths(lines, height, at), height, at)
}
