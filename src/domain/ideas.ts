/**
 * Módulo Ideias (segundo cérebro): vocabulários fechados, limites e tipos.
 * Especificação: docs/08-ideias-segundo-cerebro.md · Decisões: docs/adr/0001 a 0009.
 *
 * Estrutura fixa (ADR-0002): Área > Assunto > Ideia > Anotação, mais a Captura bruta.
 * A IA só escolhe dentro desta estrutura; quem grava é o validador (ideasValidate.ts).
 */

import type { PartnerId } from './types'

export const IDEA_NATURES = ['PLANO', 'DESEJO', 'PREOCUPACAO', 'PERGUNTA', 'OBSERVACAO', 'REFLEXAO'] as const
export type IdeaNature = (typeof IDEA_NATURES)[number]

export const IDEA_STATES = ['SOLTA', 'AMADURECENDO', 'VIROU_ACAO', 'GUARDADA'] as const
export type IdeaState = (typeof IDEA_STATES)[number]

export const LINK_TYPES = ['RELACIONA', 'DEPENDE_DE', 'PARTE_DE', 'CONTRADIZ', 'EVOLUI_DE'] as const
export type LinkType = (typeof LINK_TYPES)[number]
/** Tipos sem direção: A-B equivale a B-A. */
export const SYMMETRIC_LINKS: readonly LinkType[] = ['RELACIONA', 'CONTRADIZ']

export type LinkState = 'SUGERIDA' | 'CONFIRMADA' | 'RECUSADA'
export type Origin = 'IA' | 'PESSOA'

/** Limites da estrutura. Mudar um valor aqui é mudar a ADR-0002/0003: registre. */
export const IDEA_LIMITS = {
  maxActiveAreas: 10,
  maxActiveTopicsPerArea: 12,
  topicNameMaxChars: 40,
  titleMaxWords: 8,
  summaryMaxSentences: 2,
  summaryMaxChars: 300,
  reasonMaxChars: 200,
  noteMaxChars: 4000,
  captureMaxChars: 8000,
  linksPerCapture: 3,
  linksPerIdea: 5,
  candidateIdeas: 40,
  firmTopicAtIdeas: 3,
  operationsPerCapture: 50,
} as const

/** Destino de uma operação conforme a confiança (ADR-0004). */
export const CONFIDENCE = { apply: 0.8, review: 0.6 } as const

/** Parecença mínima de sentido (ADR-0012). Calibrado em português com o EmbeddingGemma 300M. */
export const SENSE_MIN = 0.36
/** Só vale o que está perto do mais parecido: os valores variam, mas o assunto certo fica na frente. */
export const SENSE_BAND = 0.1

/** Mantém só os itens de sentido forte: acima do mínimo e perto do melhor. */
export function focusSense(sense: ReadonlyMap<string, number> | null): Map<string, number> | null {
  if (!sense) return null
  let best = 0
  for (const v of sense.values()) best = Math.max(best, v)
  return new Map([...sense].filter(([, v]) => v >= SENSE_MIN && v >= best - SENSE_BAND - 1e-9))
}
/** Pensamentos soltos com até este intervalo entram como contexto do seguinte (ADR-0012). */
export const SEQUENCE_WINDOW_MS = 3 * 60_000


/** Campos comuns das entidades guardadas (cofre local e tabelas idea_* no Supabase). Sempre privadas do dono. */
interface Owned {
  /** Quem escreveu. Ideias nunca são do casal nem visíveis ao par (ADR-0009). */
  ownerId: PartnerId
  createdAt: string
  updatedAt: string
}

/** Área: catálogo por pessoa. id = '<pessoa>:<chave>' (ex.: 'A:saude'). */
export interface IdeaArea extends Owned {
  id: string
  name: string
  hidden: boolean
  sortOrder: number
}

export interface IdeaTopic extends Owned {
  id: string
  areaId: string
  name: string
  /** Provisório (tracejado) até a pessoa confirmar ou chegar a 3 ideias. */
  firm: boolean
  archived: boolean
  origin: Origin
}

export interface Idea extends Owned {
  id: string
  topicId: string
  title: string
  summary: string
  nature: IdeaNature
  state: IdeaState
  /** Aplicado com confiança entre 0,6 e 0,8: mostrar "conferir". */
  needsReview: boolean
}

export interface IdeaLink extends Owned {
  id: string
  fromIdeaId: string
  toIdeaId: string
  type: LinkType
  reason: string
  origin: Origin
  state: LinkState
}

export type CaptureSource = 'TEXTO' | 'VOZ'
export type CaptureStatus = 'PENDENTE' | 'ORGANIZADA' | 'CAIXA'

/** O que a pessoa soltou de uma vez. O texto nunca muda. */
export interface IdeaCapture extends Owned {
  id: string
  text: string
  source: CaptureSource
  status: CaptureStatus
}

/** Trecho literal de uma captura. ideaId null = Caixa de entrada. */
export interface IdeaNote extends Owned {
  id: string
  captureId: string
  ideaId: string | null
  text: string
  /** Posição na captura normalizada (null quando a pessoa escreveu a anotação à mão). */
  startPos: number | null
  endPos: number | null
  needsReview: boolean
  inboxReason: string | null
}

/** A ideia virou tarefa ou compromisso (ADR-0001). */
export interface IdeaAction extends Owned {
  id: string
  ideaId: string
  targetType: 'TASK' | 'EVENT'
  targetId: string
}

/** Registro de uma organização feita pela IA: auditoria, "Por que aqui?" e Desfazer. */
export interface IdeaAiLog extends Owned {
  id: string
  captureId: string
  provider: string
  model: string
  promptVersion: string
  result: unknown
  undone: boolean
}

/** O que o validador precisa saber do mapa atual da pessoa. */
export interface IdeaMap {
  areas: IdeaArea[]
  topics: IdeaTopic[]
  ideas: Idea[]
  links: IdeaLink[]
}

/** Catálogo inicial de Áreas (chave estável: renomear não quebra nada). */
export const DEFAULT_AREAS: readonly { key: string; name: string }[] = [
  { key: 'trabalho', name: 'Trabalho' },
  { key: 'estudos', name: 'Estudos' },
  { key: 'saude', name: 'Saúde' },
  { key: 'casa', name: 'Casa' },
  { key: 'dinheiro', name: 'Dinheiro' },
  { key: 'relacoes', name: 'Relações' },
  { key: 'projetos', name: 'Projetos pessoais' },
  { key: 'lazer', name: 'Lazer e criatividade' },
]

export const areaId = (owner: PartnerId, key: string) => `${owner}:${key}`

/** Áreas iniciais de uma pessoa. */
export function defaultAreasFor(owner: PartnerId, iso: string): IdeaArea[] {
  return DEFAULT_AREAS.map((a, i) => ({ id: areaId(owner, a.key), ownerId: owner, name: a.name, hidden: false, sortOrder: i + 1, createdAt: iso, updatedAt: iso }))
}

/** Sem acento, minúsculo e com espaços simples. Para comparar nomes e buscar. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Frases contadas por pontuação final; texto sem pontuação conta como uma frase. */
export function sentenceCount(text: string): number {
  const parts = text.trim().split(/[.!?]+(?:\s+|$)/).filter((p) => p.trim().length > 0)
  return Math.max(parts.length, text.trim() ? 1 : 0)
}

export const isNature = (v: unknown): v is IdeaNature => typeof v === 'string' && (IDEA_NATURES as readonly string[]).includes(v)
export const isIdeaState = (v: unknown): v is IdeaState => typeof v === 'string' && (IDEA_STATES as readonly string[]).includes(v)
export const isLinkType = (v: unknown): v is LinkType => typeof v === 'string' && (LINK_TYPES as readonly string[]).includes(v)

const THOUGHT_START = /^(?:sera que|acho que|e se\b|talvez|pensei|pensando|tive uma ideia|ideia\b|queria|quero|seria bom|seria legal|tenho medo|me preocupa|estou preocupad|percebi|sinto que|preciso pensar|nao sei se)/
/**
 * Captura livre (ADR-0001): a frase parece um pensamento, não uma tarefa? Pergunta ou começo típico de
 * reflexão ("será que", "acho que", "e se", "quero"...). Na dúvida, a pessoa troca com um toque.
 */
export function looksLikeThought(text: string): boolean {
  const t = foldText(text)
  if (!t) return false
  return t.includes('?') || THOUGHT_START.test(t)
}

