/**
 * Validador do contrato da IA para o módulo Ideias (ADR-0004).
 *
 * A IA devolve `{ versao: 'organizador@N', operacoes: [...] }`. Nada é gravado direto: cada operação é
 * conferida aqui, contra a captura e o mapa atual. O resultado diz o que aplicar, o que vai para a
 * Caixa de entrada e o que foi recusado (com motivo, para o registro e para avaliar provedores).
 *
 * Garantias:
 * - todo trecho está escrito literalmente na captura (espaços normalizados) e não se sobrepõe a outro;
 * - nada da captura se perde: o que sobrar com conteúdo vai para a Caixa de entrada;
 * - ids existem, vocabulários são fechados e os limites da estrutura são respeitados;
 * - não existe operação de apagar nem de mexer em estrutura firme.
 */
import {
  CONFIDENCE, IDEA_LIMITS, SYMMETRIC_LINKS, foldText, isIdeaState, isLinkType, isNature, sentenceCount, wordCount,
  type IdeaMap, type IdeaNature, type IdeaState, type LinkType,
} from './ideas'

export const ORGANIZER_VERSION_PREFIX = 'organizador@'

/** Referência a uma ideia que já existe (`id`) ou que nasce nesta mesma captura (`ref`). */
export type IdeaRef = { id: string } | { ref: string }
export type TopicRef = { id: string } | { ref: string }

interface Span { text: string; start: number; end: number }

export type ValidatedOp =
  | ({ kind: 'ANEXAR'; ideaId: string; needsReview: boolean } & Span)
  | ({ kind: 'CRIAR_IDEIA'; ref: string | null; topic: TopicRef; title: string; nature: IdeaNature; summary: string; needsReview: boolean } & Span)
  | { kind: 'CRIAR_ASSUNTO'; ref: string; areaId: string; name: string; reason: string }
  | { kind: 'SUGERIR_LIGACAO'; from: IdeaRef; to: IdeaRef; type: LinkType; reason: string }
  | { kind: 'ATUALIZAR_RESUMO'; idea: IdeaRef; summary: string }
  | { kind: 'SUGERIR_ESTADO'; ideaId: string; state: IdeaState; reason: string }

export interface InboxItem { text: string; start: number | null; end: number | null; reason: string }
export interface RejectedOp { index: number; kind: string; reason: string }

export interface ValidationResult {
  /** false quando a resposta inteira não segue o contrato: a captura toda vai para a Caixa de entrada. */
  ok: boolean
  version: string | null
  /** Captura com espaços normalizados; posições `start`/`end` referem-se a ela. */
  capture: string
  apply: ValidatedOp[]
  inbox: InboxItem[]
  rejected: RejectedOp[]
}

const FILLERS = new Set(['e', 'ai', 'entao', 'tipo', 'ne', 'hmm', 'hum', 'ah', 'eh', 'uh', 'ok', 'bom', 'enfim', 'assim', 'sabe', 'mas', 'ou', 'tambem'])

export function normalizeSpaces(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim()
}

type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

class Refusal extends Error {}
const refuse = (reason: string): never => { throw new Refusal(reason) }

function confidenceOf(op: Raw): number {
  const c = op.confianca
  if (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 1) refuse('confiança ausente ou fora de 0 a 1')
  return c as number
}

function reasonOf(op: Raw, field = 'motivo', optional = false): string {
  const r = str(op[field]) ?? (optional ? '' : refuse(`${field} vazio`))
  if (r.length > IDEA_LIMITS.reasonMaxChars) refuse(`${field} com mais de ${IDEA_LIMITS.reasonMaxChars} caracteres`)
  return r
}

/** Sobra da captura que ainda tem conteúdo (não é só "e", "tipo", pontuação). */
function meaningful(text: string): boolean {
  const words = foldText(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(' ').filter(Boolean)
  return words.some((w) => !FILLERS.has(w))
}

export function validateOrganization(rawCapture: string, response: unknown, map: IdeaMap): ValidationResult {
  const capture = normalizeSpaces(rawCapture)
  const result: ValidationResult = { ok: true, version: null, capture, apply: [], inbox: [], rejected: [] }
  const wholeToInbox = (reason: string): ValidationResult => {
    result.ok = false
    result.apply = []
    result.inbox = capture ? [{ text: capture, start: 0, end: capture.length, reason }] : []
    return result
  }

  if (!capture) return result
  if (capture.length > IDEA_LIMITS.captureMaxChars) return wholeToInbox('captura maior que o limite')
  if (!isObj(response)) return wholeToInbox('resposta da IA fora do formato')
  const version = str(response.versao)
  if (!version || !version.startsWith(ORGANIZER_VERSION_PREFIX)) return wholeToInbox('versão do contrato ausente ou desconhecida')
  result.version = version
  if (!Array.isArray(response.operacoes)) return wholeToInbox('lista de operações ausente')
  if (response.operacoes.length > IDEA_LIMITS.operationsPerCapture) return wholeToInbox('operações demais para uma captura')

  const ops = response.operacoes as unknown[]
  const reject = (index: number, kind: string, reason: string) => result.rejected.push({ index, kind, reason })

  // ---------- índices do mapa ----------
  const areaById = new Map(map.areas.map((a) => [a.id, a]))
  const topicById = new Map(map.topics.map((t) => [t.id, t]))
  const ideaById = new Map(map.ideas.map((i) => [i.id, i]))
  const activeTopicsPerArea = new Map<string, number>()
  for (const t of map.topics) if (!t.archived) activeTopicsPerArea.set(t.areaId, (activeTopicsPerArea.get(t.areaId) ?? 0) + 1)

  // ---------- trechos: literais e sem sobreposição ----------
  const used: Array<[number, number]> = []
  const overlaps = (s: number, e: number) => used.some(([a, b]) => s < b && e > a)
  function locate(op: Raw): Span {
    const raw = str(op.trecho) ?? refuse('trecho vazio')
    const text = normalizeSpaces(raw)
    if (text.length > IDEA_LIMITS.noteMaxChars) refuse('trecho maior que o limite de uma anotação')
    let from = 0
    let firstHit = -1
    for (;;) {
      const at = capture.indexOf(text, from)
      if (at < 0) break
      if (firstHit < 0) firstHit = at
      if (!overlaps(at, at + text.length)) return { text, start: at, end: at + text.length }
      from = at + 1
    }
    return refuse(firstHit < 0 ? 'trecho não está escrito na captura' : 'trecho sobreposto a outro já usado')
  }
  const claim = (span: Span) => used.push([span.start, span.end])

  // ---------- 1ª passada: assuntos novos ----------
  const newTopics = new Map<string, { index: number; op: Extract<ValidatedOp, { kind: 'CRIAR_ASSUNTO' }> }>()
  ops.forEach((op, index) => {
    if (!isObj(op) || op.tipo !== 'CRIAR_ASSUNTO') return
    try {
      const ref = str(op.ref) ?? refuse('ref vazio')
      if (newTopics.has(ref)) refuse('ref repetido')
      const areaId = str(op.area_id) ?? refuse('area_id vazio')
      const area = areaById.get(areaId) ?? refuse('área não existe')
      if (area.hidden) refuse('área escondida pela pessoa')
      const name = str(op.nome) ?? refuse('nome vazio')
      if (name.length > IDEA_LIMITS.topicNameMaxChars) refuse('nome do assunto longo demais')
      const folded = foldText(name)
      const clash = map.topics.some((t) => t.areaId === areaId && !t.archived && foldText(t.name) === folded)
        || [...newTopics.values()].some((n) => n.op.areaId === areaId && foldText(n.op.name) === folded)
      if (clash) refuse('já existe assunto com esse nome nesta área; use o id dele')
      const pending = [...newTopics.values()].filter((n) => n.op.areaId === areaId).length
      if ((activeTopicsPerArea.get(areaId) ?? 0) + pending + 1 > IDEA_LIMITS.maxActiveTopicsPerArea) {
        refuse('área já tem o máximo de assuntos; proponha juntar na revisão')
      }
      // motivo do assunto novo é só para o registro: opcional (recusar derrubaria as ideias dele)
      newTopics.set(ref, { index, op: { kind: 'CRIAR_ASSUNTO', ref, areaId, name, reason: reasonOf(op, 'motivo', true) } })
    } catch (e) {
      if (!(e instanceof Refusal)) throw e
      reject(index, 'CRIAR_ASSUNTO', e.message)
    }
  })
  const usedTopicRefs = new Set<string>()

  // ---------- 2ª passada: trechos (anexar, criar ideia, caixa de entrada) ----------
  const newIdeaRefs = new Set<string>()
  const pendingTitles = new Map<string, string>() // topicKey|titulo -> ref (evita duas ideias iguais na mesma captura)
  ops.forEach((op, index) => {
    if (!isObj(op)) { reject(index, '?', 'operação não é um objeto'); return }
    const kind = String(op.tipo ?? '?')
    if (!['ANEXAR', 'CRIAR_IDEIA', 'CAIXA_DE_ENTRADA'].includes(kind)) return
    try {
      const span = locate(op)
      if (kind === 'CAIXA_DE_ENTRADA') {
        claim(span)
        result.inbox.push({ ...span, reason: reasonOf(op) })
        return
      }
      const conf = confidenceOf(op)
      if (conf < CONFIDENCE.review) {
        claim(span)
        result.inbox.push({ ...span, reason: 'a IA não teve certeza de onde encaixar' })
        return
      }
      const needsReview = conf < CONFIDENCE.apply

      if (kind === 'ANEXAR') {
        const ideaId = str(op.ideia_id) ?? refuse('ideia_id vazio')
        if (!ideaById.has(ideaId)) refuse('ideia não existe')
        claim(span)
        result.apply.push({ kind: 'ANEXAR', ideaId, needsReview, ...span })
        return
      }

      // CRIAR_IDEIA
      const title = str(op.titulo) ?? refuse('título vazio')
      if (wordCount(title) > IDEA_LIMITS.titleMaxWords) refuse(`título com mais de ${IDEA_LIMITS.titleMaxWords} palavras`)
      if (!isNature(op.natureza)) refuse('natureza fora do vocabulário')
      const nature = op.natureza as IdeaNature
      const summary = str(op.resumo) ?? ''
      if (summary.length > IDEA_LIMITS.summaryMaxChars) refuse('resumo longo demais')
      if (summary && sentenceCount(summary) > IDEA_LIMITS.summaryMaxSentences) refuse(`resumo com mais de ${IDEA_LIMITS.summaryMaxSentences} frases`)
      let topic: TopicRef
      let topicId = str(op.assunto_id)
      let topicRef = str(op.assunto_ref)
      // modelos pequenos às vezes põem o "ref" do assunto novo em assunto_id: é o mesmo assunto, sem ambiguidade
      if (topicId && !topicRef && !topicById.has(topicId) && newTopics.has(topicId)) {
        topicRef = topicId
        topicId = null
      }
      // ...ou repetem o mesmo id de assunto existente nos dois campos: também é o mesmo assunto
      if (topicId && topicRef === topicId && topicById.has(topicId) && !newTopics.has(topicRef)) topicRef = null
      if (topicId && topicRef) refuse('use assunto_id ou assunto_ref, não os dois')
      if (topicId) {
        const t = topicById.get(topicId) ?? refuse('assunto não existe')
        if (t.archived) refuse('assunto arquivado')
        topic = { id: topicId }
      } else if (topicRef) {
        if (!newTopics.has(topicRef)) refuse('assunto_ref não foi criado (ou foi recusado) nesta captura')
        topic = { ref: topicRef }
      } else {
        return refuse('falta assunto_id ou assunto_ref')
      }
      // Ideia com o mesmo título no mesmo assunto: vira anotação nela, marcada para conferir.
      if ('id' in topic) {
        const twin = map.ideas.find((i) => i.topicId === topicId && foldText(i.title) === foldText(title))
        if (twin) {
          claim(span)
          result.apply.push({ kind: 'ANEXAR', ideaId: twin.id, needsReview: true, ...span })
          return
        }
      }
      const titleKey = `${'id' in topic ? topic.id : `ref:${topic.ref}`}|${foldText(title)}`
      if (pendingTitles.has(titleKey)) refuse('duas ideias com o mesmo título no mesmo assunto nesta captura')
      const ref = str(op.ref)
      if (ref && (newIdeaRefs.has(ref) || ideaById.has(ref))) refuse('ref da ideia repetido')
      claim(span)
      if (ref) newIdeaRefs.add(ref)
      pendingTitles.set(titleKey, ref ?? '')
      if ('ref' in topic) usedTopicRefs.add(topic.ref)
      result.apply.push({ kind: 'CRIAR_IDEIA', ref, topic, title, nature, summary, needsReview, ...span })
    } catch (e) {
      if (!(e instanceof Refusal)) throw e
      reject(index, kind, e.message)
    }
  })

  // Assunto novo sem nenhuma ideia válida não é criado (nada de pasta vazia).
  const appliedTopics: ValidatedOp[] = []
  for (const [ref, { index, op }] of newTopics) {
    if (usedTopicRefs.has(ref)) appliedTopics.push(op)
    else reject(index, 'CRIAR_ASSUNTO', 'assunto sem nenhuma ideia válida')
  }
  result.apply.unshift(...appliedTopics)

  // ---------- 3ª passada: ligações, resumos e estados ----------
  const resolveIdea = (value: unknown): IdeaRef => {
    const v = str(value) ?? refuse('ideia da ligação vazia')
    if (ideaById.has(v)) return { id: v }
    if (newIdeaRefs.has(v)) return { ref: v }
    return refuse('ideia da ligação não existe')
  }
  const key = (r: IdeaRef) => ('id' in r ? r.id : `ref:${r.ref}`)
  const linkCount = new Map<string, number>()
  for (const l of map.links) {
    if (l.state === 'RECUSADA') continue
    linkCount.set(l.fromIdeaId, (linkCount.get(l.fromIdeaId) ?? 0) + 1)
    linkCount.set(l.toIdeaId, (linkCount.get(l.toIdeaId) ?? 0) + 1)
  }
  const samePair = (aFrom: string, aTo: string, bFrom: string, bTo: string, type: LinkType) =>
    (aFrom === bFrom && aTo === bTo) || (SYMMETRIC_LINKS.includes(type) && aFrom === bTo && aTo === bFrom)
  const newLinks: Array<{ from: string; to: string; type: LinkType }> = []
  const summarized = new Set<string>()

  ops.forEach((op, index) => {
    if (!isObj(op)) return
    const kind = String(op.tipo ?? '?')
    try {
      if (kind === 'SUGERIR_LIGACAO') {
        const from = resolveIdea(op.de_ideia)
        const to = resolveIdea(op.para_ideia)
        if (key(from) === key(to)) refuse('ligação de uma ideia com ela mesma')
        if (!isLinkType(op.tipo_ligacao)) refuse('tipo de ligação fora do vocabulário')
        const type = op.tipo_ligacao as LinkType
        const reason = reasonOf(op)
        if (confidenceOf(op) < CONFIDENCE.review) refuse('confiança baixa para sugerir ligação')
        const [f, t] = [key(from), key(to)]
        const prior = map.links.find((l) => l.type === type && samePair(l.fromIdeaId, l.toIdeaId, f, t, type))
        if (prior?.state === 'RECUSADA') refuse('a pessoa já recusou esta ligação')
        if (prior) refuse('ligação já existe')
        if (newLinks.some((l) => l.type === type && samePair(l.from, l.to, f, t, type))) refuse('ligação repetida nesta captura')
        if (newLinks.length >= IDEA_LIMITS.linksPerCapture) refuse(`mais de ${IDEA_LIMITS.linksPerCapture} ligações numa captura`)
        if ((linkCount.get(f) ?? 0) >= IDEA_LIMITS.linksPerIdea || (linkCount.get(t) ?? 0) >= IDEA_LIMITS.linksPerIdea) {
          refuse(`ideia já tem ${IDEA_LIMITS.linksPerIdea} ligações`)
        }
        newLinks.push({ from: f, to: t, type })
        linkCount.set(f, (linkCount.get(f) ?? 0) + 1)
        linkCount.set(t, (linkCount.get(t) ?? 0) + 1)
        result.apply.push({ kind: 'SUGERIR_LIGACAO', from, to, type, reason })
      } else if (kind === 'ATUALIZAR_RESUMO') {
        const idea = resolveIdea(op.ideia_id)
        if (summarized.has(key(idea))) refuse('resumo repetido para a mesma ideia')
        const summary = str(op.resumo) ?? refuse('resumo vazio')
        if (summary.length > IDEA_LIMITS.summaryMaxChars) refuse('resumo longo demais')
        if (sentenceCount(summary) > IDEA_LIMITS.summaryMaxSentences) refuse(`resumo com mais de ${IDEA_LIMITS.summaryMaxSentences} frases`)
        summarized.add(key(idea))
        result.apply.push({ kind: 'ATUALIZAR_RESUMO', idea, summary })
      } else if (kind === 'SUGERIR_ESTADO') {
        const ideaId = str(op.ideia_id) ?? refuse('ideia_id vazio')
        const idea = ideaById.get(ideaId) ?? refuse('ideia não existe')
        if (!isIdeaState(op.estado)) refuse('estado fora do vocabulário')
        const state = op.estado as IdeaState
        if (state === 'VIROU_ACAO') refuse('só a pessoa marca que a ideia virou ação')
        if (state === idea.state) refuse('a ideia já está neste estado')
        result.apply.push({ kind: 'SUGERIR_ESTADO', ideaId, state, reason: reasonOf(op) })
      } else if (!['ANEXAR', 'CRIAR_IDEIA', 'CAIXA_DE_ENTRADA', 'CRIAR_ASSUNTO'].includes(kind)) {
        refuse('operação desconhecida')
      }
    } catch (e) {
      if (!(e instanceof Refusal)) throw e
      reject(index, kind, e.message)
    }
  })

  // ---------- nada se perde: sobras com conteúdo vão para a Caixa de entrada ----------
  const sorted = [...used].sort((a, b) => a[0] - b[0])
  let cursor = 0
  const gaps: Array<[number, number]> = []
  for (const [s, e] of sorted) {
    if (s > cursor) gaps.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (cursor < capture.length) gaps.push([cursor, capture.length])
  for (const [s, e] of gaps) {
    const text = capture.slice(s, e)
    if (!meaningful(text)) continue
    const lead = text.length - text.trimStart().length
    const clean = text.trim()
    result.inbox.push({ text: clean, start: s + lead, end: s + lead + clean.length, reason: 'sobrou da captura sem organização' })
  }
  result.inbox.sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
  return result
}
