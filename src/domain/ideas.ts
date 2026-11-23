/**
 * Módulo Ideias (segundo cérebro): vocabulários fechados, limites e tipos.
 * Especificação: docs/08-ideias-segundo-cerebro.md · Decisões: docs/adr/0001 a 0009.
 *
 * Estrutura fixa (ADR-0002): Área > Assunto > Ideia > Anotação, mais a Captura bruta.
 * A IA só escolhe dentro desta estrutura; quem grava é o validador (ideasValidate.ts).
 */

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

export interface IdeaArea {
  id: string
  name: string
  hidden: boolean
  order: number
}

export interface IdeaTopic {
  id: string
  areaId: string
  name: string
  /** Provisório (tracejado) até a pessoa confirmar ou chegar a 3 ideias. */
  firm: boolean
  archived: boolean
  origin: Origin
}

export interface Idea {
  id: string
  topicId: string
  title: string
  summary: string
  nature: IdeaNature
  state: IdeaState
  /** Aplicado com confiança entre 0,6 e 0,8: mostrar "conferir". */
  needsReview: boolean
  createdAt: string
  updatedAt: string
}

export interface IdeaLink {
  id: string
  fromIdeaId: string
  toIdeaId: string
  type: LinkType
  reason: string
  origin: Origin
  state: LinkState
}

/** O que o validador precisa saber do mapa atual da pessoa. */
export interface IdeaMap {
  areas: IdeaArea[]
  topics: IdeaTopic[]
  ideas: Idea[]
  links: IdeaLink[]
}

/** Catálogo inicial de Áreas. Ids estáveis: renomear não quebra nada. */
export const DEFAULT_AREAS: readonly IdeaArea[] = [
  { id: 'trabalho', name: 'Trabalho', hidden: false, order: 1 },
  { id: 'estudos', name: 'Estudos', hidden: false, order: 2 },
  { id: 'saude', name: 'Saúde', hidden: false, order: 3 },
  { id: 'casa', name: 'Casa', hidden: false, order: 4 },
  { id: 'dinheiro', name: 'Dinheiro', hidden: false, order: 5 },
  { id: 'relacoes', name: 'Relações', hidden: false, order: 6 },
  { id: 'projetos', name: 'Projetos pessoais', hidden: false, order: 7 },
  { id: 'lazer', name: 'Lazer e criatividade', hidden: false, order: 8 },
]

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
