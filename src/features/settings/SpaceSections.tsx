import { UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { upgradeSoloToCouple } from '../../auth/session'
import { Button, ChoiceChips, SectionHeader, Switch, TextField } from '../../components/ui'
import type { EnabledModules, Pronoun } from '../../domain/types'
import { setEnabledModule } from '../../store/actions'
import { useIsSolo, usePeople } from '../../store/hooks'
import { ui } from '../../store/ui'
import { publishInvite } from '../../sync/cloud'
import { Field as AccountField } from './CloudSection'

const MODULES: { key: keyof EnabledModules; label: string; description: string }[] = [
  { key: 'cycle', label: 'Ciclo menstrual', description: 'Acompanhar seu ciclo e as janelas de cuidado.' },
  { key: 'shopping', label: 'Compras', description: 'Manter uma lista para lembrar do que falta.' },
  { key: 'goals', label: 'Caixinhas', description: 'Guardar aos poucos para seus objetivos.' },
]

export function ModulesSection() {
  const { me } = usePeople()
  const isSolo = useIsSolo()
  const modules = me.enabledModules ?? { cycle: !isSolo, shopping: true, goals: true }
  return (
    <section className="module p-4 sm:p-5" aria-labelledby="modulos">
      <SectionHeader id="modulos" title="Módulos opcionais" />
      <p className="mb-4 text-[14px] text-muted">Escolha o que ajuda no seu dia. Desativar um módulo preserva os dados que você já anotou.</p>
      <div className="flex flex-col gap-4">
        {MODULES.map(({ key, label, description }) => (
          <Switch
            key={key}
            checked={modules[key]}
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
    if (!name.trim()) next.name = 'Qual o nome de quem você quer convidar?'
    if (!password) next.password = 'Confirme com sua senha atual.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      const code = await upgradeSoloToCouple(password, { name: name.trim(), pronoun })
      try {
        await publishInvite(code)
        ui.toast('Convite criado. Seus dados continuam neste espaço.', { tone: 'info' })
      } catch {
        ui.toast('Convite salvo neste aparelho. Para usar em outro celular, reconecte a nuvem e gere um novo convite em Segurança.', { tone: 'warn' })
      }
    } catch (error) {
      setErrors({ password: error instanceof Error ? error.message : 'Não foi possível criar o convite.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="module p-4 sm:p-5" aria-labelledby="convidar-par">
      <SectionHeader id="convidar-par" title="Compartilhar o espaço" />
      <p className="mb-4 text-[14px] text-muted">Se quiser, convide seu par. Suas tarefas, registros e preferências continuam aqui.</p>
      <Button
        block
        icon={UserPlus}
        variant="quiet"
        aria-expanded={open}
        data-testid="settings-upgrade"
        onClick={() => {
          setOpen((value) => !value)
          setPassword('')
          setErrors({})
        }}
      >
        Convidar alguém para este espaço
      </Button>
      {open ? (
        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4 rounded-[18px] bg-subtle p-3" data-testid="upgrade-form">
          <TextField label="Nome do seu par" value={name} onChange={setName} maxLength={24} testId="upgrade-partner" error={errors.name} />
          <ChoiceChips<Pronoun>
            label="Como falar do seu par"
            value={pronoun}
            onChange={setPronoun}
            options={[{ value: 'ele', label: 'Ele' }, { value: 'ela', label: 'Ela' }]}
          />
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
          <p className="text-[13px] text-muted">Seu par vai criar a própria senha com o código de convite.</p>
          <Button type="submit" block variant="primary" busy={busy} data-testid="upgrade-submit">Gerar convite</Button>
        </form>
      ) : null}
    </section>
  )
}
