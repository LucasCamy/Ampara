import { Download, UserPlus, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { upgradeSoloToCouple } from '../../auth/session'
import { Button, ChoiceChips, SectionHeader, Switch, TextField } from '../../components/ui'
import type { EnabledModules, Pronoun } from '../../domain/types'
import { firstName } from '../../domain/format'
import { setEnabledModule } from '../../store/actions'
import { useIsSolo, usePeople } from '../../store/hooks'
import { ui } from '../../store/ui'
import { publishInvite } from '../../sync/cloud'
import { withSyncPaused } from '../../sync/engine'
import { convertSpaceToSolo } from '../../sync/space'
import { downloadEncryptedBackup } from './backupDownload'
import { Field as AccountField } from './CloudSection'

const MODULES: { key: keyof EnabledModules; label: string; description: string }[] = [
  { key: 'cycle', label: 'Ciclo menstrual', description: 'Acompanhar seu ciclo e as janelas de cuidado.' },
  { key: 'shopping', label: 'Compras', description: 'Manter uma lista para lembrar do que falta.' },
  { key: 'goals', label: 'Caixinhas', description: 'Guardar aos poucos para seus objetivos.' },
  { key: 'ideas', label: 'Ideias', description: 'Soltar pensamentos e ver o mapa do que você pensa. Só você vê.' },
]

export function ModulesSection() {
  const { me } = usePeople()
  const isSolo = useIsSolo()
  const modules = me.enabledModules ?? { cycle: !isSolo, shopping: true, goals: true, ideas: true }
  return (
    <section className="module p-4 sm:p-5" aria-labelledby="modulos">
      <SectionHeader id="modulos" title="Módulos opcionais" />
      <p className="mb-4 text-[14px] text-muted">Escolha o que ajuda no seu dia. Desativar um módulo preserva os dados que você já anotou.</p>
      <div className="flex flex-col gap-4">
        {MODULES.map(({ key, label, description }) => (
          <Switch
            key={key}
            checked={modules[key] !== false}
            onChange={(enabled) => setEnabledModule(key, enabled)}
            label={label}
            description={description}
            testId={`settings-module-${key}`}
          />
        ))}
      </div>
    </section>
  )
}

export function InvitePartnerSection() {
  const { partner } = usePeople()
  const hasHistory = !!partner.displayName.trim()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pronoun, setPronoun] = useState<Pronoun>('ela')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const next: Record<string, string> = {}
    const inviteName = hasHistory ? partner.displayName : name.trim()
    const invitePronoun = hasHistory ? partner.pronoun : pronoun
    if (!inviteName) next.name = 'Qual o nome de quem você quer convidar?'
    if (!password) next.password = 'Confirme com sua senha atual.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await withSyncPaused(async () => {
        const code = await upgradeSoloToCouple(password, { name: inviteName, pronoun: invitePronoun })
        try {
          await publishInvite(code)
          ui.toast('Convite criado. Seus dados continuam neste espaço.', { tone: 'info' })
        } catch {
          ui.toast('Convite salvo neste aparelho. Para usar em outro celular, reconecte a nuvem e gere um novo convite em Segurança.', { tone: 'warn' })
        }
      })
    } catch (error) {
      setErrors({ password: error instanceof Error ? error.message : 'Não foi possível criar o convite.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="module p-4 sm:p-5" aria-labelledby="convidar-par">
      <SectionHeader id="convidar-par" title={hasHistory ? 'Retomar com seu par' : 'Compartilhar o espaço'} />
      <p className="mb-4 text-[14px] text-muted" data-testid={hasHistory ? 'solo-history' : undefined}>{hasHistory ? `O histórico deste espaço continua com as autorias e regras de privacidade originais. Para voltar ao modo Casal, convide ${firstName(partner.displayName)} novamente.` : 'Se quiser, convide seu par. Suas tarefas, registros e preferências continuam aqui.'}</p>
      <Button
        block
        icon={UserPlus}
        variant="quiet"
        disabled={busy}
        aria-expanded={open}
        data-testid="settings-upgrade"
        onClick={() => {
          setOpen((value) => !value)
          setPassword('')
          setErrors({})
        }}
      >
        {hasHistory ? 'Convidar meu par novamente' : 'Convidar alguém para este espaço'}
      </Button>
      {open ? (
        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4 rounded-[18px] bg-subtle p-3" data-testid="upgrade-form">
          {hasHistory ? <p className="rounded-[14px] border border-line bg-surface p-3 text-[15px] font-semibold text-ink" data-testid="upgrade-original-partner">Retomar com {partner.displayName}</p> : <TextField label="Nome do seu par" value={name} onChange={setName} maxLength={24} testId="upgrade-partner" error={errors.name} />}
          {!hasHistory ? <ChoiceChips<Pronoun>
            label="Como falar do seu par"
            value={pronoun}
            onChange={setPronoun}
            options={[{ value: 'ele', label: 'Ele' }, { value: 'ela', label: 'Ela' }]}
          /> : null}
          <AccountField
            label="Sua senha atual"
            type="password"
            value={password}
            onChange={(value) => {
              setPassword(value)
              setErrors((current) => ({ ...current, password: '' }))
            }}
            autoComplete="current-password"
            testId="upgrade-password"
            error={errors.password}
          />
          <p className="text-[13px] text-muted">{hasHistory ? 'O convite reabre o acesso do mesmo par. Os registros mantêm a autoria de quem os criou.' : 'Seu par vai criar a própria senha com o código de convite.'}</p>
          <Button type="submit" block variant="primary" busy={busy} data-testid="upgrade-submit">Gerar convite</Button>
        </form>
      ) : null}
    </section>
  )
}

export function ConvertToSoloSection() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!password) {
      setError('Confirme com sua senha atual.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await convertSpaceToSolo(password, downloadEncryptedBackup)
      setPassword('')
      ui.toast('Espaço em Solo. O histórico foi preservado.', { tone: 'info' })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível mudar o espaço para Solo.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="module p-4 sm:p-5" aria-labelledby="mudar-para-solo" data-testid="conversion-section">
      <SectionHeader id="mudar-para-solo" title="Mudar o modo do espaço" />
      <p className="mb-4 text-[14px] text-muted">Você pode continuar neste espaço em Solo e manter seu histórico.</p>
      <Button block variant="quiet" icon={UserRound} disabled={busy} aria-expanded={open} data-testid="conversion-open" onClick={() => { setOpen((current) => !current); setPassword(''); setError(null) }}>Usar este espaço em Solo</Button>
      {open ? (
        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4 rounded-[18px] bg-subtle p-3" data-testid="conversion-form">
          <ul className="list-disc space-y-2 pl-5 text-[14px] text-ink">
            <li>O histórico do espaço é mantido. Cada registro conserva a autoria e as regras de privacidade que já tinha.</li>
            <li>O acesso do seu par a este espaço fica suspenso. Cópias offline e backups que já estão em outros aparelhos não são apagados.</li>
            <li>Depois, você pode convidar o mesmo par novamente.</li>
            <li>Antes da mudança, você baixa um backup cifrado dos dados deste aparelho.</li>
          </ul>
          <AccountField label="Sua senha atual" type="password" value={password} onChange={(value) => { setPassword(value); setError(null) }} autoComplete="current-password" testId="conversion-password" error={error} />
          <Button block type="submit" variant="primary" icon={Download} busy={busy} data-testid="conversion-submit">Baixar backup e mudar para Solo</Button>
        </form>
      ) : null}
    </section>
  )
}
