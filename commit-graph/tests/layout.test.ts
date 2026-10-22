import { expect, test } from 'claude-code/testing'

import { layout, UNCOMMITTED } from '../hooks/layout'
import type { LogCommit } from '../hooks/layout'

const commit = (hash: string, parents: string[]): LogCommit => ({ hash, parents, author: 'a', time: 0, date: '', subject: hash })

// Due rami che si separano e si riuniscono più volte, con modifiche non committate in cima
const HISTORY: LogCommit[] = [
  commit(UNCOMMITTED, ['m2']),
  commit('m2', ['f2', 'a3']),
  commit('a3', ['a2']),
  commit('f2', ['m1']),
  commit('a2', ['p1', 'a1']),
  commit('p1', ['a1']),
  commit('m1', ['f1', 'a1']),
  commit('a1', ['f1']),
  commit('f1', ['root']),
  commit('root', []),
]

test('fra due righe vicine le linee che escono dal basso sono quelle che entrano dall\'alto', () => {
  const { rows } = layout(HISTORY, 'm2', new Map())

  for (let index = 0; index + 1 < rows.length; index++) {
    const below = new Set(rows[index]?.segments.filter(segment => segment[3] === 2).map(segment => segment[2]))
    const above = new Set(rows[index + 1]?.segments.filter(segment => segment[1] === 0).map(segment => segment[0]))

    expect([...below].sort()).toEqual([...above].sort())
  }
})

test('la linea del ramo corrente è arancio e le modifiche non committate sono tratteggiate', () => {
  const { rows } = layout(HISTORY, 'm2', new Map())
  const kinds = Object.fromEntries(rows.map(row => [row.hash, row.kind]))

  expect(kinds).toEqual({ [UNCOMMITTED]: 3, m2: 2, a3: 0, f2: 1, a2: 0, p1: 0, m1: 1, a1: 0, f1: 1, root: 1 })
  expect(rows[0]?.segments).toEqual([[0, 1, 0, 2, 2]])
  // Il primo genitore del merge in testa prosegue in arancio, il secondo in grigio
  expect(rows[1]?.segments.filter(segment => segment[1] === 1)).toEqual([
    [0, 1, 0, 2, 1],
    [0, 1, 1, 2, 0],
  ])
})

test('una storia lineare sta in una corsia sola', () => {
  const { rows, lanes } = layout([commit('c', ['b']), commit('b', ['a']), commit('a', [])], 'c', new Map())

  expect(lanes).toBe(1)
  expect(rows.map(row => row.lane)).toEqual([0, 0, 0])
})
