// Gli argomenti dei comandi git e la lettura del loro output. Qui non si lancia nulla: il motore segue `$` solo
// dentro il modulo dei hook, quindi i comandi partono da register.tsx

import type { CommitDetail, FileChange, Ref } from '../types'
import type { LogCommit } from './layout'

const FIELD = '\x1f'
const NUL = '\0'
const MAX_FILES = 200
const MAX_SUBJECT = 200

// Solo hash veri (SHA-1 o SHA-256) finiscono negli argomenti di git: un oggetto di commit costruito ad arte non
// può far passare un'opzione al posto di un hash
const HASH = /^[0-9a-f]{40}([0-9a-f]{24})?$/

export const isHash = (text: string) => HASH.test(text)

// -z separa i commit con un carattere nullo, che un messaggio di commit non può contenere.
// La data la scrive git, col fuso della macchina giusto per ogni commit (ora legale compresa)
export function logArgs(limit: number, showRemotes: boolean, hasHead: boolean): string[] {
  return [
    'log',
    '-z',
    '--branches',
    ...(showRemotes ? ['--remotes'] : []),
    '--tags',
    ...(hasHead ? ['HEAD'] : []),
    '--date-order',
    `--max-count=${limit + 1}`,
    '--date=format-local:%d/%m/%Y %H:%M',
    '--format=%H%x1f%P%x1f%an%x1f%at%x1f%ad%x1f%s',
  ]
}

export function parseLog(text: string): LogCommit[] {
  const commits: LogCommit[] = []

  for (const record of text.split(NUL)) {
    const fields = record.trim().split(FIELD)
    const [hash = '', parents = '', author = '', time = '0', date = '', ...subject] = fields
    const parentList = parents === '' ? [] : parents.split(' ')

    if (fields.length < 6 || !isHash(hash) || !parentList.every(isHash)) {
      continue
    }

    commits.push({
      hash,
      parents: parentList,
      author,
      time: Number(time),
      date,
      subject: subject.join(' ').slice(0, MAX_SUBJECT),
    })
  }

  return commits
}

export const REFS_ARGS = [
  'for-each-ref',
  '--format=%(objectname)%1f%(*objectname)%1f%(refname)',
  'refs/heads',
  'refs/remotes',
  'refs/tags',
]

const ORDER = { head: 0, branch: 1, tag: 2, remote: 3 }

// Le etichette di ogni commit: il ramo corrente per primo, poi i rami locali, i tag e i remoti.
// Di un tag annotato conta il commit a cui punta (*objectname), non l'oggetto del tag
export function parseRefs(text: string, branch: string | null): Map<string, Ref[]> {
  const byHash = new Map<string, Ref[]>()

  for (const line of text.split('\n')) {
    const [object = '', peeled = '', name = ''] = line.trim().split(FIELD)
    const hash = peeled || object
    let ref: Ref | null = null

    if (name.startsWith('refs/heads/')) {
      const short = name.slice('refs/heads/'.length)

      ref = { name: short, kind: short === branch ? 'head' : 'branch' }
    } else if (name.startsWith('refs/remotes/') && !name.endsWith('/HEAD')) {
      ref = { name: name.slice('refs/remotes/'.length), kind: 'remote' }
    } else if (name.startsWith('refs/tags/')) {
      ref = { name: name.slice('refs/tags/'.length), kind: 'tag' }
    }

    if (ref !== null && isHash(hash)) {
      byHash.set(hash, [...(byHash.get(hash) ?? []), ref])
    }
  }

  for (const list of byHash.values()) {
    list.sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
  }

  return byHash
}

const CONFLICTS = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']

// git status --porcelain=v1 -z: «XY percorso», e dopo uno spostamento o una copia il percorso di prima.
// ? file nuovo non tracciato, ! conflitto, altrimenti la lettera dell'index o, se vuota, quella della cartella
export function parseStatus(text: string): FileChange[] {
  const entries = text.split(NUL)
  const files: FileChange[] = []

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] ?? ''

    if (entry.length < 4) {
      continue
    }

    const code = entry.slice(0, 2)
    let status = code[0] === ' ' ? (code[1] ?? 'M') : (code[0] ?? 'M')

    if (code === '??') {
      status = '?'
    } else if (CONFLICTS.includes(code)) {
      status = '!'
    }

    files.push({ status, path: entry.slice(3), added: null, removed: null })

    if (code.includes('R') || code.includes('C')) {
      index++
    }
  }

  return files
}

// git diff --numstat -z --no-renames: «aggiunte TAB tolte TAB percorso», un file binario ha «-» al posto dei numeri
function parseNumstat(text: string): Map<string, [number | null, number | null]> {
  const counts = new Map<string, [number | null, number | null]>()

  for (const entry of text.split(NUL)) {
    const [added = '', removed = '', ...rest] = entry.replace(/^\n/, '').split('\t')
    const path = rest.join('\t')

    if (path !== '') {
      counts.set(path, [added === '-' ? null : Number(added), removed === '-' ? null : Number(removed)])
    }
  }

  return counts
}

function withCounts(files: FileChange[], numstat: string): FileChange[] {
  const counts = parseNumstat(numstat)

  return files.map(file => {
    const [added, removed] = counts.get(file.path) ?? [file.added, file.removed]

    return { ...file, added, removed }
  })
}

// git diff --name-status -z: la lettera, poi il percorso, ciascuno chiuso da un carattere nullo
function parseNameStatus(text: string): FileChange[] {
  const parts = text.split(NUL).map(part => part.replace(/^\n/, ''))
  const files: FileChange[] = []

  for (let index = 0; index + 1 < parts.length; index += 2) {
    const status = parts[index] ?? ''
    const path = parts[index + 1] ?? ''

    if (status !== '' && path !== '') {
      files.push({ status: status.slice(0, 1), path, added: null, removed: null })
    }
  }

  return files
}

// Il dettaglio di un commit da `git show -s --format=%B` e dalle due liste dei file, entrambe con -z
export function commitDetail(hash: string, message: string, names: string, numstat: string): CommitDetail {
  const files = parseNameStatus(names)
  const body = message
    .split('\n')
    .slice(1)
    .map(line => line.trimEnd())
    .filter(line => line.trim() !== '')

  return { hash, body, files: withCounts(files.slice(0, MAX_FILES), numstat), total: files.length, error: null }
}

// Il dettaglio delle modifiche non committate da `git status --porcelain=v1 -z` e `git diff --numstat -z HEAD`
export function uncommittedDetail(hash: string, status: string, numstat: string): CommitDetail {
  const files = parseStatus(status)

  return { hash, body: [], files: withCounts(files.slice(0, MAX_FILES), numstat), total: files.length, error: null }
}

export function failedDetail(hash: string, error: unknown): CommitDetail {
  return { hash, body: [], files: [], total: 0, error: error instanceof Error ? error.message : String(error) }
}
