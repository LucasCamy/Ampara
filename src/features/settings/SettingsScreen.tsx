import { CircleCheck, Copy, Eye, EyeOff, LifeBuoy, Link, ListPlus, ReceiptText, RotateCcw, Smartphone, type LucideIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { Button, ChoiceChips, cx, SectionHeader, StatusBadge, Switch, Title } from '../../components/ui'
import type { PartnerId } from '../../domain/types'
import { useAuth } from '../../auth/session'
import { SecuritySection } from './SecuritySection'
import { BackupSection } from './BackupSection'
import { CloudSection } from './CloudSection'
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

export function SettingsScreen() {
  const { viewer, me, partner, profiles } = usePeople()
  const couple = useCouple()
  const partnerPending = useAuth((s) => s.people?.[s.who === 'A' ? 'B' : 'A']?.status === 'invited')
  const theme = useUi((s) => s.theme)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const base = `${location.origin}${location.pathname}`
  const mode = couple.splitMode === 'PROPORTIONAL' ? 'PROPORTIONAL' : '50_50'
  const ratioA = couple.ratioABps / 100

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
    <div>
      <div className="mb-5">
        <Title anchor="Ajustes do casal," rest="privacidade e atalhos." />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <section className="module p-4 sm:p-5" aria-labelledby="pareamento">
            <SectionHeader id="pareamento" title="Espaço do casal" rest="· protegido por senha" />
            {partnerPending ? (
              <p className="text-[14px] text-muted" data-testid="settings-invite">
                {partner.displayName} ainda não ativou o acesso. Código de convite:{' '}
                <span className="font-data text-[18px] font-semibold text-ink">{couple.inviteCode}</span>
              </p>
            ) : (
              <StatusBadge kind="ok">Vocês dois já têm senha própria</StatusBadge>
            )}
            <p className="mt-2 text-[13px] text-muted">
              Sincronização: {adapterName()}. Para ver a visão de {partner.displayName} neste aparelho, toque no nome no topo: o app pede a senha.
            </p>
            <div className="mt-4">
              <NameField key={`${viewer}-${profiles[viewer].displayName}`} id={viewer} value={profiles[viewer].displayName} label="Seu nome" />
            </div>
          </section>

          <SecuritySection partnerName={partner.displayName} />

          <BackupSection />

          <CloudSection />

          <section className="module p-4 sm:p-5" aria-labelledby="divisao">
            <SectionHeader id="divisao" title="Divisão padrão" rest="· gastos do casal" />
            <ChoiceChips<'50_50' | 'PROPORTIONAL'>
              label="Como vocês dividem por padrão?"
              value={mode}
              onChange={(v) => setSplit(v, couple.ratioABps)}
              options={[
                { value: '50_50', label: 'Meio a meio 50/50' },
                { value: 'PROPORTIONAL', label: 'Proporcional à renda', hint: `${profiles.A.displayName} ${ratioA}% · ${profiles.B.displayName} ${100 - ratioA}%` },
              ]}
            />
            <RatioField ratioA={ratioA} nameA={profiles.A.displayName} nameB={profiles.B.displayName} onChange={(r) => setSplit(mode === '50_50' ? 'PROPORTIONAL' : mode, r * 100)} />
          </section>

          <section className="module p-4 sm:p-5" aria-labelledby="privacidade">
            <SectionHeader id="privacidade" title="Privacidade financeira" rest="· dos dois" />
            <Switch
              checked={me.sharePersonalFinances}
              onChange={setSharePersonal}
              testId="settings-share-toggle"
              label={`Deixar meus gastos pessoais visíveis para ${partner.displayName}`}
              description="Leitura apenas. Itens marcados como Presente / Surpresa nunca aparecem."
            />
            <div className="mt-4 rounded-[16px] bg-subtle p-3">
              <p className="text-[13px] font-semibold text-muted">Status de {partner.displayName} (só {partner.pronoun} pode mudar)</p>
              <p className="mt-1 flex items-center gap-2 text-[15px] font-semibold text-ink">
                {partner.sharePersonalFinances ? <Eye size={17} aria-hidden className="text-action" /> : <EyeOff size={17} aria-hidden className="text-muted" />}
                {partner.sharePersonalFinances ? 'Visível para você em leitura' : 'Visão pessoal fechada'}
              </p>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="module p-4 sm:p-5" aria-labelledby="atalhos">
            <SectionHeader id="atalhos" title="Atalhos do iPhone" rest="· captura sem procurar o app" />
            <ol className="mb-4 flex list-decimal flex-col gap-1 pl-5 text-[14px] text-muted">
              <li>Abra o app Atalhos e crie um atalho novo.</li>
              <li>Adicione a ação "Abrir URL" com o endereço do atalho abaixo.</li>
              <li>
                Coloque no Botão de Ação, no Toque Atrás (Ajustes {'>'} Acessibilidade {'>'} Toque) ou na Tela Bloqueada.
              </li>
              <li>Com o Ampara instalado na Tela de Início, o atalho abre direto na gaveta certa.</li>
            </ol>
            <ul className="flex flex-col gap-3">
              {SHORTCUTS.map((s) => {
                const url = `${base}?quick=${s.quick}`
                return (
                  <li key={s.quick} className="card p-3" data-testid={`shortcut-${s.quick}`}>
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-subtle text-ink">
                        <s.icon size={20} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-ink">{s.name}</p>
                        <p className="text-[13px] text-muted">{s.how}</p>
                        <p className="font-data mt-1 text-[12px] break-all text-ink">/?quick={s.quick}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="primary" icon={Smartphone} onClick={() => ui.launchQuick(s.quick)} data-testid={`try-${s.quick}`}>
                        Testar agora
                      </Button>
                      <Button size="sm" variant="quiet" icon={copied === s.quick ? CircleCheck : Copy} onClick={() => copy(url, s.quick)}>
                        {copied === s.quick ? 'Copiado' : 'Copiar URL'}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 flex items-start gap-2 text-[13px] text-muted">
              <Link size={15} aria-hidden className="mt-0.5 shrink-0" />
              Parâmetros extras: &title= pré-preenche a tarefa; &amount= e &scope=PERSONAL pré-preenchem o gasto.
            </p>
          </section>

          <section className="module p-4 sm:p-5" aria-labelledby="aparelho">
            <SectionHeader id="aparelho" title="Este aparelho" />
            <p className="text-[14px] text-muted">
              Usando como {profiles[viewer].displayName} · tema {theme === 'dark' ? 'Noite Serena' : 'Calma Orgânica'}.
            </p>
            <div className="mt-3">
              {confirmReset ? (
                <div className={cx('rounded-[16px] border border-err bg-err-soft p-3')} role="alert">
                  <p className="text-[14px] font-semibold text-ink">Apagar os dados deste aparelho e voltar ao exemplo inicial?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
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
                    <Button size="sm" variant="quiet" onClick={() => setConfirmReset(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="quiet" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
                  Restaurar dados de exemplo
                </Button>
              )}
            </div>
            <StatusBadge kind="ok" className="mt-3">
              Salvo no aparelho · funciona offline
            </StatusBadge>
          </section>
        </div>
      </div>
    </div>
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
