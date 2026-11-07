import { Cloud, CloudOff, LogOut, RefreshCw } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/session'
import { Button, cx, FieldError, SectionHeader, Segmented, StatusBadge } from '../../components/ui'
import { formatClock } from '../../domain/format'
import { useData } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { ui } from '../../store/ui'
import { connect, disconnect, useCloud } from '../../sync/cloud'
import { syncNow } from '../../sync/engine'

export function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  testId,
  error,
}: {
  label: string
  type: 'email' | 'password' | 'text'
  value: string
  onChange: (v: string) => void
  autoComplete: string
  testId?: string
  error?: string | null
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        maxLength={type === 'email' ? 254 : 128}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        inputMode={type === 'email' ? 'email' : undefined}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={cx('min-h-12 w-full rounded-[14px] border bg-bg px-3 text-[16px] text-ink', error ? 'border-err' : 'border-line-strong')}
      />
      {error ? <FieldError id={`${id}-err`}>{error}</FieldError> : null}
    </div>
  )
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

/** Ajustes > Nuvem: conecta a conta da pessoa para sincronizar entre os celulares do casal */
export function CloudSection() {
  const { viewer, partner, profiles } = usePeople()
  const cloud = useCloud((s) => s)
  const spaceId = useData((s) => s.couple.couple?.spaceId)
  const inviteCode = useData((s) => s.couple.couple?.inviteCode)
  const partnerAbsent = useAuth((s) => s.people?.[viewer === 'A' ? 'B' : 'A'].status === 'absent')
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const busy = cloud.status === 'connecting'

  if (!cloud.configured) {
    return (
      <section className="module p-4 sm:p-5" aria-labelledby="nuvem">
        <SectionHeader id="nuvem" title="Nuvem" rest="· entre aparelhos" />
        <p className="flex items-start gap-2 text-[14px] text-muted">
          <CloudOff size={17} aria-hidden className="mt-0.5 shrink-0" />
          Esta instalação não tem servidor configurado. Os dados ficam só neste aparelho, cifrados. Para usar um celular cada, configure o
          Supabase (veja o README).
        </p>
      </section>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next = { email: emailOk(email) ? null : 'Informe um e-mail válido.', pw: pw.length >= 10 ? null : 'A senha tem pelo menos 10 caracteres.' }
    setErrors(next)
    if (next.email || next.pw) return
    try {
      await connect(mode, email, pw)
      setPw('')
      ui.toast('Nuvem conectada. Sincronizando com segurança.', { tone: 'info' })
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Não foi possível conectar.' })
    }
  }

  const connected = cloud.status === 'connected' || cloud.status === 'offline'
  const waitingForA = viewer === 'B' && !spaceId

  return (
    <section className="module p-4 sm:p-5" aria-labelledby="nuvem" data-testid="cloud-section">
      <SectionHeader id="nuvem" title="Nuvem" rest="· um celular para cada" />
      {connected ? (
        <div className="flex flex-col gap-3">
          <StatusBadge kind={cloud.status === 'offline' ? 'pending' : 'ok'} className="self-start">
            {cloud.status === 'offline' ? 'Sem internet · a fila espera' : `Conectado como ${cloud.email}`}
          </StatusBadge>
          <p className="text-[13px] text-muted">
            {cloud.lastPulledAt ? (
              <>
                Última sincronização às <span className="font-data">{formatClock(cloud.lastPulledAt)}</span>.
              </>
            ) : (
              'Sincronizando...'
            )}{' '}
            O servidor só entrega os gastos pessoais de {partner.displayName} se {partner.pronoun} liberar, e nunca os presentes.
          </p>
          {viewer === 'A' && !partnerAbsent && inviteCode ? (
            <p className="rounded-[14px] bg-subtle p-3 text-[14px] text-ink">
              Para {partner.displayName} usar o próprio celular: abrir o Ampara, tocar em <strong>Entrar pela nuvem</strong> e usar o convite{' '}
              <span className="font-data font-semibold">{inviteCode}</span>.
            </p>
          ) : null}
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Button size="sm" variant="quiet" icon={RefreshCw} onClick={() => void syncNow()} data-testid="cloud-sync">
              Sincronizar agora
            </Button>
            <Button size="sm" variant="ghost" icon={LogOut} onClick={() => void disconnect()}>
              Desconectar
            </Button>
          </div>
        </div>
      ) : waitingForA ? (
        <p className="text-[14px] text-muted">Peça para {profiles.A.displayName} conectar a nuvem primeiro. Depois volte aqui.</p>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3" data-testid="cloud-form">
          <p className="flex items-start gap-2 text-[14px] text-muted">
            <Cloud size={17} aria-hidden className="mt-0.5 shrink-0 text-action" />
            Crie sua conta para usar o Ampara no seu celular e {partner.displayName} no {partner.pronoun === 'ela' ? 'dela' : 'dele'}, sempre em dia.
          </p>
          <Segmented<'signup' | 'signin'>
            label="Tipo de acesso"
            value={mode}
            onChange={setMode}
            stretch
            size="sm"
            options={[
              { value: 'signup', label: 'Criar conta', testId: 'cloud-mode-signup' },
              { value: 'signin', label: 'Já tenho conta', testId: 'cloud-mode-signin' },
            ]}
          />
          <Field label="Seu e-mail" type="email" value={email} onChange={setEmail} autoComplete="email" testId="cloud-email" error={errors.email} />
          <Field
            label={mode === 'signup' ? 'Senha da conta (pode ser a mesma do app)' : 'Senha da conta'}
            type="password"
            value={pw}
            onChange={setPw}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            testId="cloud-password"
            error={errors.pw}
          />
          {errors.form ? <FieldError>{errors.form}</FieldError> : null}
          <Button type="submit" variant="primary" busy={busy} data-testid="cloud-submit">
            {busy ? 'Conectando...' : 'Conectar à nuvem'}
          </Button>
        </form>
      )}
    </section>
  )
}
