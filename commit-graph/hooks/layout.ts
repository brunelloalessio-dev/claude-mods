import type { GraphRow, Ref, RowKind, Segment } from '../types'

// La riga delle modifiche non committate entra nel grafo come un commit finto, figlio di HEAD
export const UNCOMMITTED = '*'

export type LogCommit = { hash: string; parents: string[]; author: string; time: number; date: string; subject: string }

type Lane = { hash: string; style: number } | null

const GRAY = 0
const ORANGE = 1
const DASHED = 2

// La linea del ramo corrente: HEAD e i suoi primi genitori, finché sono fra i commit caricati
function firstParentChain(commits: LogCommit[], head: string | null): Set<string> {
  const byHash = new Map(commits.map(commit => [commit.hash, commit]))
  const chain = new Set<string>()
  let at = head

  while (at !== null && !chain.has(at)) {
    const commit = byHash.get(at)

    if (commit === undefined) {
      break
    }

    chain.add(at)
    at = commit.parents[0] ?? null
  }

  return chain
}

function kindOf(hash: string, head: string | null, chain: Set<string>): RowKind {
  if (hash === UNCOMMITTED) {
    return 3
  }

  if (hash === head) {
    return 2
  }

  return chain.has(hash) ? 1 : 0
}

// Assegna a ogni commit una corsia e calcola i tratti da disegnare nella sua riga. I commit arrivano dal più
// recente e ogni figlio viene prima dei suoi genitori (git log --date-order): una corsia «aspetta» il prossimo
// commit della sua linea. Ogni tratto sta dentro una riga e tocca i bordi in verticale, così le righe disegnate
// una per una si uniscono senza stacchi
export function layout(
  commits: LogCommit[],
  head: string | null,
  refs: Map<string, Ref[]>,
): { rows: GraphRow[]; lanes: number } {
  const chain = firstParentChain(commits, head)
  const lanes: Lane[] = []
  const rows: GraphRow[] = []
  let width = 1

  const free = () => {
    const hole = lanes.indexOf(null)

    return hole === -1 ? lanes.length : hole
  }

  const styleOf = (child: string, isFirstParent: boolean) => {
    if (child === UNCOMMITTED) {
      return DASHED
    }

    return isFirstParent && chain.has(child) ? ORANGE : GRAY
  }

  for (const commit of commits) {
    const incoming: number[] = []

    lanes.forEach((waiting, index) => {
      if (waiting?.hash === commit.hash) {
        incoming.push(index)
      }
    })

    const lane = incoming[0] ?? free()
    const segments: Segment[] = []

    // Le linee che passano accanto senza toccare questo commit
    lanes.forEach((waiting, index) => {
      if (waiting !== null && waiting.hash !== commit.hash) {
        segments.push([index, 0, index, 2, waiting.style])
      }
    })

    // Le linee che arrivano al commit dall'alto: i figli, anche di rami diversi, convergono sul pallino
    for (const index of incoming) {
      segments.push([index, 0, lane, 1, lanes[index]?.style ?? GRAY])
      lanes[index] = null
    }

    const [first, ...others] = commit.parents

    if (first === undefined) {
      lanes[lane] = null
    } else {
      const style = styleOf(commit.hash, true)

      lanes[lane] = { hash: first, style }
      segments.push([lane, 1, lane, 2, style])
    }

    // Un merge apre una linea verso ogni altro genitore, o si aggancia a quella che già lo aspetta
    for (const parent of others) {
      const style = styleOf(commit.hash, false)
      let target = lanes.findIndex(waiting => waiting?.hash === parent)

      if (target === -1) {
        target = free()
        lanes[target] = { hash: parent, style }
      }

      segments.push([lane, 1, target, 2, style])
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop()
    }

    width = Math.max(width, lanes.length, lane + 1)
    rows.push({
      ...commit,
      refs: refs.get(commit.hash) ?? [],
      lane,
      kind: kindOf(commit.hash, head, chain),
      segments,
    })
  }

  return { rows, lanes: width }
}
