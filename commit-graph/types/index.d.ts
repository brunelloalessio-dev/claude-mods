// Il contratto dello stato: tutto ciò che il pannello disegna sta qui, così sopravvive al ricaricamento della mod

/**
 * Un tratto dentro una riga del grafo: corsia e altezza di partenza, corsia e altezza di arrivo, stile.
 * Altezze: 0 bordo alto, 1 centro, 2 bordo basso. Stile: 0 grigio, 1 arancio (linea del ramo corrente),
 * 2 tratteggiato (modifiche non committate).
 */
export type Segment = [number, number, number, number, number]

export type RefKind = 'head' | 'branch' | 'remote' | 'tag'

export type Ref = { name: string; kind: RefKind }

/** 0 altro ramo, 1 linea del ramo corrente, 2 HEAD, 3 modifiche non committate */
export type RowKind = 0 | 1 | 2 | 3

export type GraphRow = {
  hash: string
  parents: string[]
  author: string
  time: number
  /** Data e ora come le scrive git sulla macchina, col fuso giusto per ogni commit (gg/mm/aaaa hh:mm) */
  date: string
  subject: string
  refs: Ref[]
  lane: number
  kind: RowKind
  segments: Segment[]
}

export type Graph = {
  root: string
  branch: string | null
  head: string | null
  rows: GraphRow[]
  lanes: number
  hasMore: boolean
  isDirty: boolean
  /** HEAD c'è ma è più indietro dei commit caricati */
  isHeadHidden: boolean
  /** Clone superficiale: il commit più vecchio caricato può non essere il primo vero */
  isShallow: boolean
  updatedAt: number
  /** L'ora dell'ultima lettura, come la scrive la macchina (hh:mm) */
  updatedClock: string
}

export type FileChange = { status: string; path: string; added: number | null; removed: number | null }

/** total è il numero vero dei file cambiati; files ne tiene al massimo 200 */
export type CommitDetail = { hash: string; body: string[]; files: FileChange[]; total: number; error: string | null }

declare module 'claude-code' {
  interface PluginState {
    'commit-graph': {
      graph: Graph | null
      problem: string | null
      busy: string | null
      limit: number
      /** Quante righe del grafo si disegnano: l'app scarta un pannello troppo grande, si va a pagine */
      drawn: number
      showRemotes: boolean
      selected: string | null
      detail: CommitDetail | null
      query: string
      chatCommits: string[]
    }
  }
}
