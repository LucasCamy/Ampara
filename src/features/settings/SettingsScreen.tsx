import { firstName } from '../../domain/format'
import {
  ChevronDown,
  CircleCheck,
  Copy,
  Eye,
  EyeOff,
  LifeBuoy,
  Link,
  ListPlus,
  ReceiptText,
  RotateCcw,
  Smartphone,
  type LucideIcon,
} from 'lucide-react'
import { useId, useState } from 'react'
import { Actions, Button, ChoiceChips, cx, SectionHeader, Segmented, StatusBadge, Switch, Title } from '../../components/ui'
import type { PartnerId } from '../../domain/types'
import { useAuth } from '../../auth/session'
import { SecuritySection } from './SecuritySection'
import { BackupSection } from './BackupSection'
import { CloudSection } from './CloudSection'
import { NotificationsSection } from './NotificationsSection'
import { AlertsSection } from './AlertsSection'
import { AboutSection } from '../shell/UpdateBanner'
import { renameProfile, setSharePersonal, setSplit } from '../../store/actions'
import { resetData } from '../../store/data'
import { useCouple, usePeople } from '../../store/hooks'
import { ui, useUi, type SheetKind } from '../../store/ui'
import { adapterName } from '../../sync/engine'

const SHORTCUTS: { quick: SheetKind; name: string; icon: LucideIcon; how: string }[] = [
  { quick: 'task', name: 'Ampara: + Tarefa rápida', icon: ListPlus, how: 'Abre a gaveta de tarefa com o teclado pronto.' },
  { quick: 'expense', name: 'Ampara: + Registrar gasto', icon: ReceiptText, how: 'Abre o registro de gasto. Aceita &amount=12,50.' },
  { quick: 'med', name: 'Ampara: Tomei meu remédio', icon: CircleCheck, how: 'Abre a confirmação da dose do turno atual.' },
  { quick: 'sos', name: 'Ampara: Pedir ajuda ao amor', icon: LifeBuoy, how: 'Abre a triagem de ajuda em 3 toques.' },
]

/** Grupos de Ajustes: cada um cabe em poucas telas no celular, em vez de uma coluna única de dez cartões */
type Group = 'casal' | 'nuvem' | 'aparelho' | 'atalhos'
let lastGroup: Group = 'casal' // ao voltar para Ajustes, abre no grupo em que estava

export function SettingsScreen() {
  const [group, setGroupState] = useState<Group>(lastGroup)
  const setGroup = (g: Group) => {
    lastGroup = g
    setGroupState(g)
  }

  return (
    <div>
      <div className="mb-4">
        <Title anchor="Ajustes" rest="do casal." />
      </div>
      <div className="mb-5">
        <Segmented<Group>
          label="Grupo de ajustes"
          value={group}
          onChange={setGroup}
          stretch
          options={[
            { value: 'casal', label: 'Casal', testId: 'settings-group-casal' },
            { value: 'nuvem', label: 'Nuvem', testId: 'settings-group-nuvem' },
            { value: 'aparelho', label: 'Aparelho', shortLabel: 'App', testId: 'settings-group-aparelho' },
            { value: 'atalhos', label: 'Atalhos', testId: 'settings-group-atalhos' },
          ]}
        />
      </div>

      {group === 'casal' ? <CoupleGroup /> : null}

      {group === 'nuvem' ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <CloudSection />
          <NotificationsSection />
        </div>
      ) : null}

      {group === 'aparelho' ? <DeviceGroup /> : null}

      {group === 'atalhos' ? <ShortcutsSection /> : null}
    </div>
  )
}

function CoupleGroup() {
  const { viewer, me, partner, profiles } = usePeople()
  const couple = useCouple()
  const partnerPending = useAuth((s) => s.people?.[s.who === 'A' ? 'B' : 'A']?.status === 'invited')
  const mode = couple.splitMode === 'PROPORTIONAL' ? 'PROPORTIONAL' : '50_50'
  const ratioA = couple.ratioABps / 100
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className="module p-4 sm:p-5" aria-labelledby="pareamento">
        <SectionHeader id="pareamento" title="Espaço do casal" />
        {partnerPending ? (
          <p className="text-[14px] text-muted" data-testid="settings-invite">
            {firstName(partner.displayName)} ainda não ativou o acesso. Código de convite:{' '}
            <span className="font-data text-[18px] font-semibold text-ink">{couple.inviteCode}</span>
          </p>
        ) : (
          <StatusBadge kind="ok">Vocês dois já têm senha própria</StatusBadge>
        )}
        <p className="mt-2 text-[13px] text-muted">
          Sincronização: {adapterName()}. Para ver a visão de {firstName(partner.displayName)} neste aparelho, toque no nome no topo: o app pede a senha.
        </p>
        <div className="mt-4">
          <NameField key={`${viewer}-${profiles[viewer].displayName}`} id={viewer} value={profiles[viewer].displayName} label="Seu nome" />
        </div>
      </section>

      <div className="flex flex-col gap-6">
        <section className="module p-4 sm:p-5" aria-labelledby="divisao">
          <SectionHeader id="divisao" title="Divisão padrão" rest="· gastos" />
          <ChoiceChips<'50_50' | 'PROPORTIONAL'>
            stack
            label="Como vocês dividem por padrão?"
            value={mode}
            onChange={(v) => setSplit(v, couple.ratioABps)}
            options={[
              { value: '50_50', label: 'Meio a meio 50/50' },
              { value: 'PROPORTIONAL', label: 'Proporcional à renda', hint: `${profiles.A.displayName} ${ratioA}% · ${profiles.B.displayName} ${100 - ratioA}%` },
            ]}
          />
          <RatioField
            ratioA={ratioA}
            nameA={profiles.A.displayName}
            nameB={profiles.B.displayName}
            onChange={(r) => setSplit(mode === '50_50' ? 'PROPORTIONAL' : mode, r * 100)}
          />
        </section>

        <section className="module p-4 sm:p-5" aria-labelledby="privacidade">
          <SectionHeader id="privacidade" title="Privacidade financeira" />
          <Switch
            checked={me.sharePersonalFinances}
            onChange={setSharePersonal}
            testId="settings-share-toggle"
            label={`Deixar meus gastos pessoais visíveis para ${firstName(partner.displayName)}`}
            description="Leitura apenas. Itens marcados como Presente / Surpresa nunca aparecem."
          />
          <div className="mt-4 rounded-[16px] bg-subtle p-3">
            <p className="text-[13px] font-semibold text-muted">
              Status de {firstName(partner.displayName)} (só {partner.pronoun} pode mudar)
            </p>
            <p className="mt-1 flex items-center gap-2 text-[15px] font-semibold text-ink">
              {partner.sharePersonalFinances ? <Eye size={17} aria-hidden className="text-action" /> : <EyeOff size={17} aria-hidden className="text-muted" />}
              {partner.sharePersonalFinances ? 'Visível para você em leitura' : 'Visão pessoal fechada'}
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

function DeviceGroup() {
  const { viewer, partner, profiles } = usePeople()
  const theme = useUi((s) => s.theme)
  const [confirmReset, setConfirmReset] = useState(false)
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="flex flex-col gap-6">
        <AlertsSection />
        <SecuritySection partnerName={firstName(partner.displayName)} />
        <AboutSection />
      </div>
      <div className="flex flex-col gap-6">
        <BackupSection />
        <section className="module p-4 sm:p-5" aria-labelledby="aparelho">
          <SectionHeader id="aparelho" title="Este aparelho" />
          <p className="text-[14px] text-muted">
            Usando como {profiles[viewer].displayName} · tema {theme === 'dark' ? 'Noite Serena' : 'Calma Orgânica'}.
          </p>
          <StatusBadge kind="ok" className="mt-3">
            Salvo no aparelho · funciona offline
          </StatusBadge>
          <div className="mt-4">
            {confirmReset ? (
              <div className={cx('rounded-[16px] border border-err bg-err-soft p-3')} role="alert">
                <p className="text-[14px] font-semibold text-ink">Apagar os dados deste aparelho e voltar ao exemplo inicial?</p>
                <div className="mt-3 flex flex-col gap-2">
                  <Button
                    block
                    variant="secondary"
                    className="border-err text-err"
                    onClick={() => {
                      resetData()
                      setConfirmReset(false)
                      ui.toast('Dados de exemplo restaurados', { tone: 'info' })
                    }}
                  >
                    Sim, restaurar exemplo
                  </Button>
                  <Button block variant="quiet" onClick={() => setConfirmReset(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button block variant="quiet" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
                Restaurar dados de exemplo
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function ShortcutsSection() {
  const [copied, setCopied] = useState<string | null>(null)
  const base = `${location.origin}${location.pathname}`
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      ui.toast('Não foi possível copiar. Selecione o endereço e copie manualmente.', { tone: 'info' })
    }
  }
  return (
    <section className="module p-4 sm:p-5 lg:max-w-[760px]" aria-labelledby="atalhos">
      <SectionHeader id="atalhos" title="Atalhos de captura" />
      <p className="mb-3 text-[14px] text-muted">
        <strong className="text-ink">Android e computador:</strong> segure o ícone do Ampara instalado e escolha o atalho. Abre direto na gaveta certa.
      </p>
      <details className="group mb-4 rounded-[16px] bg-subtle text-[14px] text-muted" data-testid="shortcuts-howto">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 font-semibold text-ink">
          E no iPhone?
          <ChevronDown size={18} aria-hidden className="shrink-0 group-open:rotate-180" />
        </summary>
        <p className="px-3 pb-3">
          O iOS abre os endereços do app Atalhos no Safari, que é separado do Ampara da Tela de Início (outro login, outros dados). É uma limitação da
          Apple para apps instalados pelo navegador. No iPhone, os caminhos rápidos são as notificações (abrem direto na tela certa) e a barra de captura
          dentro do app.
        </p>
      </details>
      <ul className="grid gap-3 sm:grid-cols-2">
        {SHORTCUTS.map((s) => {
          const url = `${base}?quick=${s.quick}`
          return (
            <li key={s.quick} className="card flex flex-col p-3" data-testid={`shortcut-${s.quick}`}>
              <div className="flex flex-1 items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-subtle text-ink">
                  <s.icon size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-ink">{s.name}</p>
                  <p className="text-[13px] text-muted">{s.how}</p>
                  <p className="font-data mt-1 text-[12px] break-all text-ink">/?quick={s.quick}</p>
                </div>
              </div>
              <Actions className="mt-3">
                <Button block variant="primary" icon={Smartphone} onClick={() => ui.launchQuick(s.quick)} data-testid={`try-${s.quick}`}>
                  Testar agora
                </Button>
                <Button block variant="quiet" icon={copied === s.quick ? CircleCheck : Copy} onClick={() => copy(url, s.quick)}>
                  {copied === s.quick ? 'Endereço copiado' : 'Copiar endereço'}
                </Button>
              </Actions>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 flex items-start gap-2 text-[13px] text-muted">
        <Link size={15} aria-hidden className="mt-0.5 shrink-0" />
        Parâmetros extras: &title= pré-preenche a tarefa; &amount= e &scope=PERSONAL pré-preenchem o gasto.
      </p>
    </section>
  )
}

function NameField({ id, value, label }: { id: PartnerId; value: string; label: string }) {
  const uid = useId()
  const [draft, setDraft] = useState(value)
  return (
    <div>
      <label htmlFor={uid} className="mb-1.5 block text-[14px] font-semibold text-ink">
        {label}
      </label>
      <input
        id={uid}
        value={draft}
        maxLength={24}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => (draft.trim() ? renameProfile(id, draft) : setDraft(value))}
        className="min-h-12 w-full rounded-[14px] border border-line-strong bg-bg px-3 text-[16px] text-ink"
      />
    </div>
  )
}

function RatioField({ ratioA, nameA, nameB, onChange }: { ratioA: number; nameA: string; nameB: string; onChange: (pctA: number) => void }) {
  const uid = useId()
  return (
    <div className="mt-4">
      <label htmlFor={uid} className="mb-1.5 block text-[14px] font-semibold text-ink">
        Proporção da renda
      </label>
      <input
        id={uid}
        type="range"
        min={5}
        max={95}
        step={5}
        value={ratioA}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${nameA} ${ratioA}%, ${nameB} ${100 - ratioA}%`}
        className="h-12 w-full accent-[var(--action)]"
      />
      <p className="font-data flex justify-between text-[13px] text-muted">
        <span>
          {nameA} {ratioA}%
        </span>
        <span>
          {nameB} {100 - ratioA}%
        </span>
      </p>
    </div>
  )
}
