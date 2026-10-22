// round: lancio e riprese dello stesso agent di review, cioe' il giro a cui siamo
export type GateReport = { agent: string; verdict: string; isBlocking: boolean; at: string | null; round: number }

export type UsageLimit = { kind: string; percentUsed: number; resetsAt: string | null }

// base e behind: il ramo di partenza (alpha, beta, main) e quanti commit ha in piu' del nostro all'ultimo fetch
export type GitStatus = {
  changed: number
  untracked: number
  ahead: number | null
  isOnRemote: boolean
  base: string | null
  behind: number | null
  stashes: number
  fetchedAt: number | null
}

export type ContextFill = { tokens: number | null; window: number; percent: number | null }

// Lo stile dell'animazione dell'effort pescato per una conversazione
export type EffortStylePick = { conversation: string; style: string }

// Un worktree del clone, escluso il checkout principale e quello della sessione: percorso assoluto, percorso
// relativo alla radice del clone (null se sta fuori) e ramo (null se staccato)
export type RepoWorktree = { path: string; relative: string | null; branch: string | null }

// I worktree che una conversazione ha nominato nei suoi tool, per percorso assoluto
export type ChatWorktreePaths = { conversation: string; paths: string[] }

// Un worktree di questa chat come lo mostra la fascia: cartella, ramo e ramo da cui e' partito (alpha, beta...)
export type ChatWorktree = { folder: string; branch: string | null; base: string | null }

declare module 'claude-code' {
  interface PluginState {
    'status-band': {
      branch: string | null
      worktree: string | null
      git: GitStatus | null
      report: GateReport | null
      running: Record<string, string>
      // Tipo di ogni agent di review lanciato, per riconoscerne le riprese
      gateTypes: Record<string, string>
      rounds: Record<string, number>
      isCodeUnreviewed: boolean
      limits: UsageLimit[]
      chatUsd: number | null
      context: ContextFill | null
      model: string | null
      effort: string | number | null
      effortStyle: EffortStylePick | null
      isUltracode: boolean
      offsetMinutes: number | null
      now: number
      skills: string[]
      recentSkills: string[]
      repoSkills: string[]
      conversation: string | null
      isSkillsOpen: boolean
      repoWorktrees: RepoWorktree[]
      chatWorktreePaths: ChatWorktreePaths | null
      worktrees: ChatWorktree[]
      isWorktreesOpen: boolean
    }
  }
}
