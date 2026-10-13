// Le animazioni dell'effort fra cui ogni chat ne pesca una, scelte da anteprima il 13 ott 2026. Ognuna disegna le
// sei tacche mentre Claude lavora, dal livello medium in su; da ferme le tacche sono quelle di `still`, tranne
// dove lo stile ne da' una sua
import {
  AMOUNT,
  DOWN,
  GLINT,
  LINEAR,
  OFF,
  SCATTER,
  SECONDS,
  SMOOTH,
  UP,
  animate,
  blur,
  fill,
  grow,
  left,
  lighten,
  pingPong,
  pulse,
  rect,
  row,
  spread,
  tick,
} from './effort-kit'
import type { Timing } from './effort-kit'

type Draw = (rank: number, color: string) => string

export type EffortStyle = { moving: Draw; still?: Draw }

const at = (values: number[], rank: number) => values[rank - 1] ?? 0

// Gelatina: le tacche si allungano, si schiacciano e si assestano, allargandosi quando si schiacciano
const JELLY_HEIGHTS = [12, 16, 9, 14, 11, 12.5, 12]
const JELLY_TIMES = [0, 0.15, 0.32, 0.5, 0.66, 0.82, 1]

function gelatina(rank: number, color: string) {
  const seconds = at(SECONDS, rank)
  const heights = JELLY_HEIGHTS.map(height => 12 + (height - 12) * at(AMOUNT, rank))
  const widths = heights.map(height => 5 * Math.sqrt(12 / height))

  return row(rank, slot => {
    const timing = { seconds, begin: slot * seconds * 0.1, keyTimes: JELLY_TIMES, splines: spread(6, SMOOTH) }

    return tick(
      slot,
      fill(color),
      grow(heights, timing) +
        animate('width', widths, timing) +
        animate('x', widths.map(width => left(slot) + (5 - width) / 2), timing),
    )
  })
}

// Onda: un'ombra attraversa le tacche, e da max in su si allungano anche
const WAVE_SECONDS = [0, 2.4, 1.6, 1.1, 0.7, 0.5]

function onda(rank: number, color: string) {
  const seconds = at(WAVE_SECONDS, rank)

  return row(rank, slot => {
    const timing = { seconds, begin: (slot * seconds) / rank }
    // Si allunga dal centro, sopra e sotto
    const stretch = rank >= 5 ? animate('height', [12, 20, 12], timing) + animate('y', [5, 1, 5], timing) : ''

    return tick(slot, fill(color), animate('opacity', [1, 0.3, 1], timing) + stretch)
  })
}

// Pallina saltellante: salta di tacca in tacca, andata e ritorno, e la tacca su cui cade si abbassa. Le tacche
// sono piu' basse per farle spazio sopra, anche da ferme
const HOP_SECONDS = [0, 0.42, 0.34, 0.27, 0.21, 0.17]

function low(slot: number, paint: string, inner = '') {
  return rect(left(slot), 9, 5, 9, 1.5, paint, inner)
}

function lowOff(slot: number) {
  return low(slot, OFF)
}

function pallinaStill(rank: number, color: string) {
  return row(rank, slot => low(slot, fill(color)), lowOff)
}

function pallina(rank: number, color: string) {
  const path = [...pingPong(rank), 0]
  const hops = path.length - 1
  const keyTimes = Array.from({ length: 2 * hops + 1 }, (_, k) => k / (2 * hops))
  const timing = { seconds: at(HOP_SECONDS, rank) * hops, keyTimes }

  const ticks = row(
    rank,
    slot => {
      const tops = keyTimes.map((_, k) => (k % 2 === 0 && path[k / 2] === slot ? 10.2 : 9))

      return low(slot, fill(color), animate('y', tops, timing) + animate('height', tops.map(top => 18 - top), timing))
    },
    lowOff,
  )

  const peak = 4.5 - 4 * at(AMOUNT, rank)
  const xs: number[] = []
  const ys: number[] = []
  const splines: string[] = []

  for (let k = 0; k < hops; k += 1) {
    const from = (path[k] ?? 0) * 8 + 0.5
    const to = (path[k + 1] ?? 0) * 8 + 0.5

    xs.push(from, (from + to) / 2)
    ys.push(4.5, peak)
    splines.push(UP, DOWN)
  }

  xs.push((path[hops] ?? 0) * 8 + 0.5)
  ys.push(4.5)

  const ball = rect(0.5, 4.5, 4, 4, 2, fill(color), animate('x', xs, timing) + animate('y', ys, { ...timing, splines }))

  return ticks + ball
}

// Battito: le tacche pulsano insieme col doppio colpo del cuore, con un filo di ritardo l'una sull'altra
const BEAT_TIMES = [0, 0.1, 0.2, 0.3, 0.42, 1]

function beat(rank: number) {
  const seconds = at(SECONDS, rank) * 1.15
  const amount = at(AMOUNT, rank)
  const scales = [1, 1 + 0.38 * amount, 0.96, 1 + 0.22 * amount, 1, 1]
  const timing = (slot: number): Timing => ({
    seconds,
    begin: slot * seconds * 0.03,
    keyTimes: BEAT_TIMES,
    splines: spread(5, SMOOTH),
  })

  return { scales, timing }
}

function battito(rank: number, color: string) {
  const { scales, timing } = beat(rank)

  return row(rank, slot => tick(slot, fill(color), pulse(slot, scales, timing(slot))))
}

// Battito luminoso: lo stesso battito, con un bagliore a ogni colpo
function battitoLuminoso(rank: number, color: string) {
  const { scales, timing } = beat(rank)

  return (
    blur('battito', 1.6) +
    row(rank, slot => {
      const shape = pulse(slot, scales, timing(slot))

      return (
        tick(
          slot,
          `${fill(color)} filter="url(#battito)" opacity="0"`,
          shape + animate('opacity', [0, 0.95, 0.2, 0.7, 0, 0], timing(slot)),
        ) + tick(slot, fill(color), shape)
      )
    })
  )
}

// Respiro: gonfiano e sfumano insieme, piano
function respiro(rank: number, color: string) {
  const timing = { seconds: at(SECONDS, rank) * 2.4, keyTimes: [0, 0.5, 1], splines: spread(2, SMOOTH) }
  const heights = [12, 12 + 2.2 * at(AMOUNT, rank), 12]

  return row(rank, slot => tick(slot, fill(color), grow(heights, timing) + animate('opacity', [0.55, 1, 0.55], timing)))
}

// Pistoni: scendono di colpo con uno scoppio bianco in cima, nell'ordine di un sei cilindri in linea
const FIRING = [0, 4, 2, 5, 1, 3]

// Il cappuccio bianco dello scoppio, in cima alla tacca
function flash(slot: number, inner: string) {
  return rect(left(slot), 5, 5, 4, 1.5, GLINT, inner)
}

function pistoni(rank: number, color: string) {
  const seconds = at(SECONDS, rank) * 0.95
  const stroke = 1 + 3 * at(AMOUNT, rank)
  const order = FIRING.filter(slot => slot < rank)

  return row(rank, slot => {
    const begin = (order.indexOf(slot) / order.length) * seconds
    const move = animate('y', [5, 5 + stroke, 5 + stroke * 0.85, 5, 5], {
      seconds,
      begin,
      keyTimes: [0, 0.07, 0.3, 0.6, 1],
      splines: ['0.6 0 1 1', SMOOTH, SMOOTH, LINEAR],
    })

    return (
      tick(slot, fill(color), move) +
      flash(slot, move + animate('opacity', [0, 0.9, 0, 0], { seconds, begin, keyTimes: [0, 0.07, 0.3, 1] }))
    )
  })
}

// Sgasata: gli stessi pistoni, con scoppi sempre piu' fitti, poi il motore torna al minimo
const REV = [0.02, 0.22, 0.38, 0.5, 0.59, 0.66, 0.72, 0.77, 0.81]

function sgasata(rank: number, color: string) {
  const seconds = at(SECONDS, rank) * 3.5
  const stroke = 1 + 2.6 * at(AMOUNT, rank)
  const order = FIRING.filter(slot => slot < rank)
  const keyTimes = [0]
  const tops = [5]
  const glow = [0]

  for (const time of REV) {
    keyTimes.push(time, time + 0.012, time + 0.03)
    tops.push(5, 5 + stroke, 5)
    glow.push(0, 0.9, 0)
  }

  keyTimes.push(1)
  tops.push(5)
  glow.push(0)

  return row(rank, slot => {
    const timing = { seconds, begin: order.indexOf(slot) * seconds * 0.012, keyTimes }
    const move = animate('y', tops, timing)

    return tick(slot, fill(color), move) + flash(slot, move + animate('opacity', glow, timing))
  })
}

// Neon: sfarfallano come un'insegna che si accende, ognuna per conto suo, con un alone
const NEON_TIMES = [0, 0.04, 0.07, 0.1, 0.13, 0.6, 0.62, 0.66, 1]
const NEON_FLICKER = [1, 0.2, 1, 0.45, 1, 1, 0.3, 1, 1]

function neon(rank: number, color: string) {
  const seconds = at(SECONDS, rank) * 2.6
  const glow = 0.35 + 0.65 * at(AMOUNT, rank)

  return (
    blur('neon', 1.5) +
    row(rank, slot => {
      const timing = { seconds, begin: (SCATTER[slot] ?? 0) * seconds, keyTimes: NEON_TIMES, isDiscrete: true }

      return (
        tick(slot, `${fill(color)} filter="url(#neon)"`, animate('opacity', NEON_FLICKER.map(value => value * glow), timing)) +
        tick(slot, fill(color), animate('opacity', NEON_FLICKER, timing))
      )
    })
  )
}

// Scia luminosa: un lampo bianco le attraversa da sinistra a destra
function scia(rank: number, color: string) {
  const seconds = at(SECONDS, rank) * 1.7
  const peak = 0.5 + 0.35 * at(AMOUNT, rank)

  return row(
    rank,
    slot =>
      tick(slot, fill(color)) +
      tick(
        slot,
        GLINT,
        animate('opacity', [0, peak, 0, 0], {
          seconds,
          begin: (slot * seconds * 0.45) / rank,
          keyTimes: [0, 0.07, 0.2, 1],
        }),
      ),
  )
}

// Luccichio: lo stesso lampo, su una tacca alla volta in ordine sparso
const GLINT_ORDER = [3, 0, 5, 2, 4, 1]

function luccichio(rank: number, color: string) {
  const seconds = at(SECONDS, rank) * 1.8
  const peak = 0.6 + 0.3 * at(AMOUNT, rank)
  const order = GLINT_ORDER.filter(slot => slot < rank)

  return row(
    rank,
    slot =>
      tick(slot, fill(color)) +
      tick(
        slot,
        GLINT,
        animate('opacity', [0, peak, 0, 0], {
          seconds,
          begin: (order.indexOf(slot) / order.length) * seconds,
          keyTimes: [0, 0.05, 0.14, 1],
        }),
      ),
  )
}

// Crescendo: diventano una scala che sale verso destra, poi tornano pari
function crescendo(rank: number, color: string) {
  const seconds = at(SECONDS, rank) * 1.9
  const amount = at(AMOUNT, rank)

  return row(rank, slot => {
    const target = 12 + (slot - (rank - 1) / 2) * (10 / (rank - 1)) * amount
    const timing = { seconds, begin: slot * seconds * 0.05, keyTimes: [0, 0.4, 0.62, 1], splines: spread(3, SMOOTH) }

    return tick(slot, fill(color), grow([12, target, target, 12], timing))
  })
}

// Luci che si spostano a scatti: in ogni fotogramma sono accese le tacche elencate, quelle del fotogramma prima
// sfumano, le altre restano basse
function frames(rank: number, color: string, lit: number[][], step: number) {
  const count = lit.length
  const keyTimes = Array.from({ length: count + 1 }, (_, k) => k / count)

  return row(rank, slot => {
    const opacity = keyTimes.map((_, k) => {
      if (lit[k % count]?.includes(slot)) {
        return 1
      }

      return lit[(k - 1 + count) % count]?.includes(slot) ? 0.6 : 0.22
    })

    return tick(slot, fill(color), animate('opacity', opacity, { seconds: step * count, keyTimes }))
  })
}

// Supercar: una luce corre avanti e indietro lasciando la scia
const SCAN_STEP = [0, 0.22, 0.17, 0.13, 0.1, 0.08]

function supercar(rank: number, color: string) {
  return frames(
    rank,
    color,
    pingPong(rank).map(slot => [slot]),
    at(SCAN_STEP, rank),
  )
}

// Scanner doppio: due luci partono dai capi, si incontrano in mezzo e tornano; con due tacche si alternano
const DOUBLE_SCAN_STEP = [0, 0.3, 0.24, 0.2, 0.16, 0.13]

function scannerDoppio(rank: number, color: string) {
  const lit =
    rank === 2 ? [[0], [1]] : pingPong(Math.floor((rank - 1) / 2) + 1).map(slot => [slot, rank - 1 - slot])

  return frames(rank, color, lit, at(DOUBLE_SCAN_STEP, rank))
}

// Trasmissione dati: lampeggiano a scatti come le lucine di un modem, ognuna col suo ritmo
const BLINKS = [
  [1, 0.3, 1, 1, 0.3, 1, 0.3, 0.3, 1, 1],
  [0.3, 1, 1, 0.3, 1, 0.3, 1, 1, 0.3, 1],
  [1, 1, 0.3, 1, 0.3, 0.3, 1, 0.3, 1, 1],
  [1, 0.3, 0.3, 1, 1, 1, 0.3, 1, 0.3, 1],
  [0.3, 1, 0.3, 1, 1, 0.3, 1, 1, 1, 0.3],
  [1, 0.3, 1, 0.3, 1, 1, 0.3, 1, 0.3, 1],
]
const BLINK_TIMES = Array.from({ length: 10 }, (_, k) => k / 10)

function trasmissione(rank: number, color: string) {
  const seconds = at(SECONDS, rank) * 2.2

  return row(rank, slot =>
    tick(slot, fill(color), animate('opacity', BLINKS[slot] ?? [], { seconds, keyTimes: BLINK_TIMES, isDiscrete: true })),
  )
}

// Lucciole: si accendono e si spengono piano, ognuna con un suo ritmo
const FIREFLY_PERIODS = [1, 1.37, 0.83, 1.19, 0.91, 1.53]

function lucciole(rank: number, color: string) {
  const seconds = at(SECONDS, rank) * 1.6

  return row(rank, slot =>
    tick(
      slot,
      fill(color),
      animate('opacity', [1, 0.2, 1], {
        seconds: seconds * (FIREFLY_PERIODS[slot] ?? 1),
        begin: (SCATTER[slot] ?? 0) * seconds,
        keyTimes: [0, 0.5, 1],
        splines: spread(2, SMOOTH),
      }),
    ),
  )
}

// Pendolo di Newton: le tacche ai capi si alzano e ricadono a turno, quelle in mezzo sentono il colpo
function newton(rank: number, color: string) {
  const seconds = at(SECONDS, rank) * 1.7
  const amount = at(AMOUNT, rank)
  const lift = 1 + 2.5 * amount
  const out = 1 + 1.6 * amount

  return row(rank, slot => {
    const x = left(slot)

    if (slot === 0 || slot === rank - 1) {
      const side = slot === 0 ? -1 : 1
      const timing = {
        seconds,
        begin: slot === 0 ? seconds / 2 : 0,
        keyTimes: [0, 0.22, 0.44, 1],
        splines: [UP, DOWN, LINEAR],
      }

      return tick(slot, fill(color), animate('x', [x, x + side * out, x, x], timing) + animate('y', [5, 5 - lift, 5, 5], timing))
    }

    return tick(
      slot,
      fill(color),
      animate('x', [x, x, x - 0.5, x, x, x + 0.5, x], { seconds, keyTimes: [0, 0.44, 0.47, 0.5, 0.94, 0.97, 1] }),
    )
  })
}

// Pianoforte: i tasti si abbassano uno dopo l'altro, su e giu' per la scala
const KEY_STEP = [0, 0.24, 0.19, 0.15, 0.12, 0.1]

function pianoforte(rank: number, color: string) {
  const path = pingPong(rank)
  const count = path.length
  const press = 0.8 + 2 * at(AMOUNT, rank)
  const keyTimes = Array.from({ length: count + 1 }, (_, k) => k / count)
  const timing = { seconds: at(KEY_STEP, rank) * count, keyTimes }

  return row(rank, slot => {
    const pressed = keyTimes.map((_, k) => path[k % count] === slot)
    const move =
      animate('y', pressed.map(isDown => (isDown ? 5 + press : 5)), timing) +
      animate('height', pressed.map(isDown => (isDown ? 12 - press * 0.4 : 12)), timing)

    return (
      tick(slot, fill(color), move) +
      tick(slot, GLINT, move + animate('opacity', pressed.map(isDown => (isDown ? 0.4 : 0)), timing))
    )
  })
}

// Fiamma: le tacche tremano appena e le punte, piu' chiare, guizzano come il fuoco
const FLAME_HEIGHTS = [12, 12.9, 11.7, 12.6, 11.9, 12.8, 12]
const FLAME_TIPS = [0.9, 0.35, 1, 0.5, 0.85, 0.3, 0.9]
const FLAME_TIMES = [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1]

function fiamma(rank: number, color: string) {
  const seconds = at(SECONDS, rank) * 0.9
  const heights = FLAME_HEIGHTS.map(height => 12 + (height - 12) * 1.4 * at(AMOUNT, rank))
  const tops = heights.map(height => 17 - height)
  const tip = lighten(color, 0.65)

  return row(rank, slot => {
    const timing = { seconds, begin: (SCATTER[slot] ?? 0) * seconds, keyTimes: FLAME_TIMES }

    return (
      tick(slot, fill(color), grow(heights, timing)) +
      rect(left(slot), 5, 5, 4, 1.5, fill(tip), animate('y', tops, timing) + animate('opacity', FLAME_TIPS, timing))
    )
  })
}

// Radar: le tacche restano basse finche' una linea non le attraversa, poi si spengono piano
function radar(rank: number, color: string) {
  const seconds = at(SECONDS, rank) * 2
  const end = rank * 8 + 1

  const ticks = row(rank, slot => {
    // Quando la linea passa dal centro della tacca
    const time = (0.6 * (left(slot) + 4.5)) / (end + 2)

    return tick(
      slot,
      fill(color),
      animate('opacity', [0.3, 0.3, 1, 0.3, 0.3], {
        seconds,
        keyTimes: [0, time, time + 0.02, Math.min(time + 0.4, 0.98), 1],
      }),
    )
  })

  const beam = rect(
    -2,
    3,
    1.2,
    16,
    0.6,
    fill(color),
    animate('x', [-2, end, end], { seconds, keyTimes: [0, 0.6, 1] }) +
      animate('opacity', [1, 1, 0, 0], { seconds, keyTimes: [0, 0.6, 0.61, 1] }),
  )

  return ticks + beam
}

// Cerniera: le tacche pari salgono e le dispari scendono, poi si richiudono
function cerniera(rank: number, color: string) {
  const seconds = at(SECONDS, rank) * 1.6
  const gap = 0.8 + 2 * at(AMOUNT, rank)

  return row(rank, slot => {
    const side = slot % 2 ? 1 : -1

    return tick(
      slot,
      fill(color),
      animate('y', [5, 5 + side * gap, 5 + side * gap, 5 - side * gap * 0.3, 5, 5], {
        seconds,
        begin: slot * seconds * 0.06,
        keyTimes: [0, 0.25, 0.5, 0.62, 0.72, 1],
        splines: [SMOOTH, SMOOTH, SMOOTH, SMOOTH, LINEAR],
      }),
    )
  })
}

// Batteria: colpi a tempo, le tacche pari sono la cassa e le dispari il rullante; il colpo schiaccia e illumina
const DRUM_HITS = [
  [0.01, 0.51, 0.635],
  [0.26, 0.76],
]

function batteria(rank: number, color: string) {
  const seconds = at(SECONDS, rank) * 2.6
  const amount = at(AMOUNT, rank)

  return row(rank, slot => {
    const keyTimes = [0]
    const heights = [12]
    const widths = [5]
    const glow = [0]

    for (const time of DRUM_HITS[slot % 2] ?? []) {
      keyTimes.push(time, time + 0.02, time + 0.09)
      heights.push(12, 12 - 2.5 * amount, 12)
      widths.push(5, 5 + 1.2 * amount, 5)
      glow.push(0, 0.85, 0)
    }

    keyTimes.push(1)
    heights.push(12)
    widths.push(5)
    glow.push(0)

    const timing = { seconds, keyTimes }
    const shape =
      grow(heights, timing) +
      animate('width', widths, timing) +
      animate('x', widths.map(width => left(slot) + (5 - width) / 2), timing)

    return tick(slot, fill(color), shape) + tick(slot, GLINT, shape + animate('opacity', glow, timing))
  })
}

export const EFFORT_STYLES: Record<string, EffortStyle> = {
  gelatina: { moving: gelatina },
  onda: { moving: onda },
  pallina: { moving: pallina, still: pallinaStill },
  battito: { moving: battito },
  pistoni: { moving: pistoni },
  neon: { moving: neon },
  scia: { moving: scia },
  crescendo: { moving: crescendo },
  supercar: { moving: supercar },
  trasmissione: { moving: trasmissione },
  respiro: { moving: respiro },
  luccichio: { moving: luccichio },
  newton: { moving: newton },
  battitoLuminoso: { moving: battitoLuminoso },
  sgasata: { moving: sgasata },
  scannerDoppio: { moving: scannerDoppio },
  pianoforte: { moving: pianoforte },
  fiamma: { moving: fiamma },
  radar: { moving: radar },
  lucciole: { moving: lucciole },
  cerniera: { moving: cerniera },
  batteria: { moving: batteria },
}
