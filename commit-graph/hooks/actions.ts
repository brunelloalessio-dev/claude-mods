// I testi delle richieste a Claude. Le azioni che cambiano il repository non le esegue la mod: la richiesta finisce
// nel prompt e la manda la persona, così passa dai permessi e dagli hook di Claude, che un git della mod salterebbe

import type { GraphRow } from '../types'

// I rami su cui una modifica va confermata: la richiesta a Claude lo dice in chiaro
const PROTECTED = ['main', 'master', 'beta', 'alpha']

export const short = (hash: string) => hash.slice(0, 7)

const quote = (row: GraphRow) => `\`${short(row.hash)}\` («${row.subject}»)`

const onBranch = (branch: string | null) => (branch === null ? '' : ` ${branch}`)

function guard(branch: string | null): string {
  return branch !== null && PROTECTED.includes(branch)
    ? ` Attenzione: ${branch} è un ramo protetto, quindi chiedimi conferma prima di procedere.`
    : ''
}

const mergeNote = (row: GraphRow) => (row.parents.length > 1 ? ' È un merge: usa -m 1.' : '')

export function explainPrompt(row: GraphRow): string {
  return `Spiegami il commit ${quote(row)}: cosa cambia e perché. Leggilo con git show ${row.hash}.`
}

export function reviewPrompt(row: GraphRow): string {
  return `Fai una review del commit ${quote(row)}: bug, rischi e cosa manca. Leggilo con git show ${row.hash}.`
}

export function checkoutPrompt(row: GraphRow, isDirty: boolean): string {
  const locals = row.refs.filter(ref => ref.kind === 'branch').map(ref => ref.name)
  const remotes = row.refs.filter(ref => ref.kind === 'remote').map(ref => ref.name)
  let target = `Fai il checkout del commit ${quote(row)}: non ha un ramo, quindi HEAD resterà staccata.`

  if (locals.length === 1) {
    target = `Fai il checkout del ramo ${locals[0]}.`
  } else if (locals.length > 1) {
    target = `Fai il checkout di uno dei rami ${locals.join(', ')}: chiedimi prima quale.`
  } else if (remotes.length > 0) {
    target =
      `Il commit ${quote(row)} è la punta del ramo remoto ${remotes.join(', ')}: chiedimi se creare un ramo locale ` +
      'che lo segua (git switch --track) o fare il checkout del solo commit, con HEAD staccata.'
  }

  return target + (isDirty ? ' Ci sono modifiche non committate: prima dimmi se rischiano di andare perse.' : '')
}

export function cherryPickPrompt(row: GraphRow, branch: string | null): string {
  return `Fai il cherry-pick del commit ${quote(row)} sul ramo corrente${onBranch(branch)}.${mergeNote(row)}${guard(branch)}`
}

export function revertPrompt(row: GraphRow, branch: string | null): string {
  return `Fai il revert del commit ${quote(row)} sul ramo corrente${onBranch(branch)}.${mergeNote(row)}${guard(branch)}`
}

export function resetPrompt(row: GraphRow, branch: string | null): string {
  return (
    `Porta il ramo corrente${onBranch(branch)} al commit ${quote(row)} con git reset. ` +
    `Prima chiedimi se farlo --soft, --mixed o --hard e mostrami quali commit e modifiche si perdono.${guard(branch)}`
  )
}

export const COMMIT_MESSAGE_PROMPT =
  'Scrivimi un messaggio di commit per le modifiche non committate, leggendole con git status e git diff. ' +
  'Non fare il commit: mostrami solo il messaggio.'

export const REVIEW_CHANGES_PROMPT =
  'Fai una review delle modifiche non committate (git status e git diff): bug, rischi e cosa manca.'
