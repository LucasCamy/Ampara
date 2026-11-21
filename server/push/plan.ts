import { serverAllows, type AlertCategory, type AlertSound, type ServerPrefs } from '../../src/domain/alerts'
import { addDays, minutesOf } from '../../src/domain/dates'
import { ritualAlertKey, RITUAL_LABELS, RITUAL_WINDOWS } from '../../src/domain/rituals'
import { isScheduledOn, logId } from '../../src/domain/medication'
import { canReceiveBillReminder } from '../../src/domain/privacy'
import type { DoseStatus, Medication, PartnerId, SpaceMode } from '../../src/domain/types'

/**
 * Decide QUAIS lembretes mandar agora. Função pura (sem banco, sem rede): o worker só busca os dados,
 * chama isto e envia. Usa as mesmas regras de dose do app (dias da semana, pausa da cartela).
 */

export interface PushSub {
  endpoint: string
  coupleId: string
  partnerId: PartnerId
  tz: string
  showDetails: boolean
  /** categorias desligadas e horário de silêncio deste aparelho (src/domain/alerts) */
  prefs: ServerPrefs
}

export interface DoseLog {
  id: string
  coupleId: string
  medicationId: string
  status: DoseStatus
  snoozeUntil: string | null
  snoozeCount: number
}

export interface OpenHelp {
  id: string
  coupleId: string
  requesterId: PartnerId
  situation: string
  createdAt: string
}

export interface OpenNudge {
  id: string
  coupleId: string
  to: PartnerId
  message: string
  createdAt: string
}

export interface OpenFocus {
  id: string
  coupleId: string
  startedBy: PartnerId
  title: string
  durationMin: number
  startedAt: string
  joinedBy?: PartnerId | null
}

export interface UpcomingEvent {
  id: string
  coupleId: string
  title: string
  date: string
  start: string
  ownerId: PartnerId | null
}

/** O worker não recebe valores nem dados de pagamento, só o necessário para lembrar o vencimento. */
export interface DueBill {
  id: string
  coupleId: string
  createdBy: PartnerId
  scope: 'PERSONAL' | 'COUPLE'
  competenceDate: string
  description: string
}

export interface PlanInput {
  subs: PushSub[]
  /** remédios e rotinas (não excluídos), com o casal */
  meds: (Medication & { coupleId: string })[]
  logs: DoseLog[]
  help: OpenHelp[]
  /** lembretes carinhosos ainda não vistos */
  nudges?: OpenNudge[]
  /** sessões de foco rodando, sem ninguém junto */
  focus?: OpenFocus[]
  events?: UpcomingEvent[]
  bills?: DueBill[]
  modes?: Record<string, SpaceMode>
  /** nome de exibição por casal e pessoa */
  names: Record<string, Partial<Record<PartnerId, string>>>
}

export interface PushMessage {
  endpoint: string
  /** chave única: o mesmo lembrete nunca sai duas vezes para o mesmo aparelho */
  key: string
  title: string
  body: string
  /** agrupa no aparelho (uma dose substitui a notificação anterior da mesma dose) */
  tag: string
  url: string
  /** categoria do aviso: o aparelho escolhe vibração, insistência e o som (com o app aberto) */
  category: AlertCategory
  sound: AlertSound
  /** "Remédio · 08:00" */
  label: string
  /** chave sem o aparelho: o app aberto reconhece o mesmo aviso que ele próprio já mostrou */
  ref: string
}

/** Janela para mandar o lembrete do horário (cobre o worker parado por alguns minutos) */
export const DUE_WINDOW_MIN = 10
/** Até quanto tempo depois do limite o par ainda é avisado do atraso */
export const LATE_WINDOW_MIN = 60
export const HELP_WINDOW_MIN = 15
export const PARTNER_WINDOW_MIN = 15

/** Data e hora locais no fuso do aparelho */
export function localParts(now: Date, tz: string): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  } catch {
    return localParts(now, 'America/Sao_Paulo')
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

const first = (name: string | undefined, fallback: string) => (name?.trim().split(/\s+/)[0] ?? '') || fallback

export function planNotifications(input: PlanInput, now: Date): PushMessage[] {
  const out: PushMessage[] = []
  const logs = new Map(input.logs.map((l) => [`${l.coupleId}|${l.id}`, l]))
  const resolved = (s: DoseStatus | undefined) => s === 'TAKEN' || s === 'SKIPPED'

  for (const sub of input.subs) {
    const { date, minutes } = localParts(now, sub.tz)
    const partnerName = first(input.names[sub.coupleId]?.[sub.partnerId === 'A' ? 'B' : 'A'], 'Seu par')
    const solo = input.modes?.[sub.coupleId] === 'SOLO'
    const push = (m: Omit<PushMessage, 'endpoint' | 'ref' | 'sound'> & { sound?: AlertSound }) => {
      if (!serverAllows(sub.prefs, m.category, minutes)) return
      out.push({ endpoint: sub.endpoint, ...m, sound: m.sound ?? m.category, ref: m.key, key: `${m.key}|${sub.endpoint}` })
    }

    for (const med of input.meds) {
      if (med.coupleId !== sub.coupleId || !isScheduledOn(med, date)) continue
      const routine = med.kind === 'ROUTINE'
      // remédio: só a dona; rotina: quem é o responsável, ou os dois
      const mine = routine ? !med.assignee || med.assignee === sub.partnerId : med.ownerId === sub.partnerId
      const partnersMed = !solo && !routine && med.ownerId !== null && med.ownerId !== sub.partnerId && med.notifyPartnerOnDelay

      for (const time of med.times) {
        const id = logId(med.id, date, time)
        const log = logs.get(`${sub.coupleId}|${id}`)
        if (resolved(log?.status)) continue
        const late = minutes - minutesOf(time)
        const snoozing = log?.status === 'SNOOZED_WATER' && !!log.snoozeUntil && new Date(log.snoozeUntil) > now
        const selfLate = solo && mine && !routine && !snoozing && late >= med.delayMinutesThreshold && late <= med.delayMinutesThreshold + LATE_WINDOW_MIN

        if (selfLate) {
          push({ key: `self-late:${id}`, tag: `dose-${id}`, url: '/?quick=med', category: 'med', label: `Remédio · ${time}`, title: 'Um passo de cada vez', body: sub.showDetails ? `${med.name} ainda está sem confirmação. Se já tomou, registre quando puder.` : 'Seu remédio ainda está sem confirmação. Se já tomou, registre quando puder.' })
          continue
        }

        // 1) chegou a hora (para quem toma ou faz)
        if (mine && !snoozing && !log?.snoozeCount && late >= 0 && late <= DUE_WINDOW_MIN) {
          push({
            key: `due:${id}`,
            tag: `dose-${id}`,
            url: '/?quick=med',
            category: routine ? 'home' : 'med',
            label: `${routine ? 'Rotina' : 'Remédio'} · ${time}`,
            title: routine ? (sub.showDetails ? `Rotina: ${med.name}` : 'Uma rotina da casa está na hora') : sub.showDetails ? `Hora do remédio: ${med.name}` : 'Hora do seu remédio',
            body: sub.showDetails ? `${time} · ${med.dosage}. Já engoliu ou vai pegar água?` : `${time}. Abra o Ampara para confirmar.`,
          })
        }

        // 2) acabou o "pegando água" (5 min) e ainda não confirmou
        if (mine && !routine && log?.status === 'SNOOZED_WATER' && log.snoozeUntil) {
          const over = (now.getTime() - new Date(log.snoozeUntil).getTime()) / 60_000
          if (over >= 0 && over <= DUE_WINDOW_MIN) {
            push({
              key: `snooze:${id}#${log.snoozeCount}`,
              tag: `dose-${id}`,
              url: '/?quick=med',
              category: 'med',
              sound: 'water',
              label: `Remédio · ${time}`,
              title: 'Pegou a água?',
              body: sub.showDetails ? `Hora de confirmar ${med.name}.` : 'Hora de confirmar o remédio.',
            })
          }
        }

        // 3) rede de apoio: o remédio do par passou do limite
        if (partnersMed && !snoozing && late >= med.delayMinutesThreshold && late <= med.delayMinutesThreshold + LATE_WINDOW_MIN) {
          push({
            key: `late:${id}`,
            tag: `late-${id}`,
            url: '/#/hoje',
            category: 'support',
            label: `Rede de apoio · ${late} min de atraso`,
            title: 'Rede de apoio',
            body: sub.showDetails
              ? `O remédio das ${time} de ${partnerName} (${med.name}) ainda consta pendente. Um lembrete gentil ajuda.`
              : `Um remédio de ${partnerName} ainda consta pendente.`,
          })
        }
      }
    }

    // Compromissos do usuário, inclusive do espaço: margem para trocar de atividade.
    for (const event of input.events ?? []) {
      if (event.coupleId !== sub.coupleId || (event.ownerId !== null && event.ownerId !== sub.partnerId)) continue
      const until = (Date.parse(`${event.date}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 60_000 + minutesOf(event.start) - minutes
      for (const lead of [30, 10]) {
        const elapsed = lead - until
        if (elapsed < 0 || elapsed >= DUE_WINDOW_MIN || until <= 0) continue
        push({ key: `event:${event.id}@${event.date}T${event.start}#${lead}`, tag: `event-${event.id}-${lead}`, url: '/#/hoje', category: 'event', label: `Compromisso · ${event.start}`, title: sub.showDetails ? event.title : 'Seu compromisso está chegando', body: lead === 30 ? 'Separe um pouco de tempo para a transição.' : 'Faltam poucos minutos. Você pode começar a se preparar.' })
      }
    }

    // Contas pessoais só chegam ao dono. A tela bloqueada não recebe valor ou descrição sem detalhes.
    if (minutes >= 8 * 60) {
      for (const ahead of [0, 2]) {
        const dueDate = addDays(date, ahead)
        const bills = (input.bills ?? []).filter((bill) => bill.coupleId === sub.coupleId && canReceiveBillReminder(bill, sub.partnerId) && bill.competenceDate === dueDate)
        if (!bills.length) continue
        const when = ahead ? 'em 2 dias' : 'hoje'
        push({ key: ahead ? `bills-ahead:${sub.partnerId}:${dueDate}` : `bills:${sub.partnerId}:${date}`, tag: `bills-${sub.partnerId}-${dueDate}-${ahead}`, url: '/#/financas', category: 'home', label: `Contas · vence ${when}`, title: sub.showDetails && bills.length === 1 ? `${bills[0]!.description} vence ${when}` : `${bills.length === 1 ? 'Uma conta sua vence' : `${bills.length} contas suas vencem`} ${when}`, body: 'Abra o Ampara para conferir. Dê baixa quando pagar.' })
      }
    }

    for (const window of RITUAL_WINDOWS) {
      const schedule = sub.prefs.rituals?.[window]
      if (!schedule?.enabled) continue
      const elapsed = minutes - minutesOf(schedule.time)
      if (elapsed < 0 || elapsed >= DUE_WINDOW_MIN) continue
      push({ key: ritualAlertKey(sub.coupleId, sub.partnerId, date, window), tag: `ritual-${window}-${date}`, url: '/#/hoje', category: 'ritual', label: `Check-in · ${schedule.time}`, title: RITUAL_LABELS[window], body: 'Um momento curto para perceber seu ritmo, sem cobrança.' })
    }

    // 4) pedido de ajuda do par
    for (const h of input.help) {
      if (solo || h.coupleId !== sub.coupleId || h.requesterId === sub.partnerId) continue
      const age = (now.getTime() - new Date(h.createdAt).getTime()) / 60_000
      // tolera relógio do banco um pouco à frente do worker
      if (age < -2 || age > HELP_WINDOW_MIN) continue
      push({
        key: `help:${h.id}`,
        tag: `help-${h.id}`,
        url: '/#/hoje',
        category: 'help',
        label: 'Pedido de ajuda',
        title: `${partnerName} pediu ajuda`,
        body: sub.showDetails ? h.situation : 'Abra o Ampara para ver.',
      })
    }

    // 5) lembrete carinhoso do par
    for (const n of input.nudges ?? []) {
      if (solo || n.coupleId !== sub.coupleId || n.to !== sub.partnerId) continue
      const age = (now.getTime() - new Date(n.createdAt).getTime()) / 60_000
      if (age < -2 || age > PARTNER_WINDOW_MIN) continue
      push({
        key: `nudge:${n.id}`,
        tag: `nudge-${n.id}`,
        url: '/#/hoje',
        category: 'partner',
        label: 'Lembrete carinhoso',
        title: `${partnerName} lembrou de você`,
        // a mensagem cita o remédio: só com os detalhes liberados
        body: sub.showDetails ? n.message : 'Abra o Ampara para ver.',
      })
    }

    // 6) foco junto: o par começou e chamou
    for (const f of input.focus ?? []) {
      if (solo || f.joinedBy || f.coupleId !== sub.coupleId || f.startedBy === sub.partnerId) continue
      const age = (now.getTime() - new Date(f.startedAt).getTime()) / 60_000
      if (age < -2 || age > Math.min(PARTNER_WINDOW_MIN, f.durationMin)) continue
      push({
        key: `focus:${f.id}`,
        tag: `focus-${f.id}`,
        url: '/#/hoje',
        category: 'partner',
        label: `Foco junto · ${f.durationMin} min`,
        title: `${partnerName} chamou você para focar junto`,
        body: sub.showDetails ? f.title : 'Entre junto pelo Ampara.',
      })
    }
  }
  return out
}
