import { CircleCheck, Cloud, Copy, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, Upload, UserRound } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { activate, enterApp, login, lockedUntil, setup, useAuth, type PersonHeader } from '../../auth/session'
import { validatePassword } from '../../auth/vault'
import { Button, ChoiceChips, cx, FieldError, Segmented, Switch, Title } from '../../components/ui'
import { enterFromCloud, useCloud } from '../../sync/cloud'
import type { PartnerId, Pronoun, SplitMode } from '../../domain/types'
import { ThemeToggle } from '../shell/TopBar'
import { Bone } from '../../components/Skeleton'
import { RestoreForm } from '../settings/BackupSection'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="safe-top mx-auto flex max-w-[480px] items-center justify-between px-4 pt-3">
        <span className="text-[20px] font-extrabold tracking-tight text-ink">
          Ampara<span className="text-action">.</span>
        </span>
        <ThemeToggle />
      </header>
      <main id="conteudo" className="mx-auto max-w-[480px] px-4 pt-4 pb-12">
        {children}
      </main>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  type = 'text',
  autoComplete,
  testId,
  autoFocus,
  maxLength = 64,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string | null
  hint?: string
  type?: 'text' | 'password'
  autoComplete?: string
  testId?: string
  autoFocus?: boolean
  maxLength?: number
}) {
  const id = useId()
  const [show, setShow] = useState(false)
  const isPw = type === 'password'
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPw && !show ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize={isPw ? 'off' : undefined}
          spellCheck={isPw ? false : undefined}
          maxLength={maxLength}
          autoFocus={autoFocus}
          data-testid={testId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(
            'min-h-12 w-full rounded-[14px] border bg-surface px-3.5 text-[16px] text-ink',
            isPw && 'pr-14',
            error ? 'border-err' : 'border-line-strong',
          )}
        />
        {isPw ? (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
            aria-pressed={show}
            className="press absolute top-0 right-0 inline-flex h-12 w-12 items-center justify-center text-muted"
          >
            {show ? <EyeOff size={19} aria-hidden /> : <Eye size={19} aria-hidden />}
          </button>
        ) : null}
      </div>
      {error ? (
        <FieldError id={`${id}-err`}>{error}</FieldError>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

const PRONOUNS: { value: Pronoun; label: string }[] = [
  { value: 'ele', label: 'Ele' },
  { value: 'ela', label: 'Ela' },
]

/* ---------- T01: criar o espaço do casal ---------- */

export function SetupScreen() {
  const cloudOn = useCloud((s) => s.configured)
  const [viaCloud, setViaCloud] = useState(false)
  if (viaCloud) return <CloudEntryScreen onBack={() => setViaCloud(false)} />
  return <LocalSetup cloudOn={cloudOn} onCloud={() => setViaCloud(true)} />
}

/* ---------- Aparelho novo: entrar pela nuvem ---------- */

function CloudEntryScreen({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<'invite' | 'signin'>('invite')
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string | null> = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'Informe um e-mail válido.',
      pw: mode === 'invite' ? validatePassword(pw) : pw ? null : 'Digite a senha.',
      pw2: mode === 'invite' && pw !== pw2 ? 'As senhas não são iguais.' : null,
      code: mode === 'invite' && code.replace(/[^a-z0-9]/gi, '').length !== 10 ? 'O código tem 10 letras e números.' : null,
    }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    setBusy(true)
    try {
      await enterFromCloud({ mode: mode === 'invite' ? 'signup' : 'signin', email, password: pw, remember, ...(mode === 'invite' ? { inviteCode: code } : {}) })
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Não foi possível entrar.' })
      setBusy(false)
    }
  }

  return (
    <Shell>
      <Title size="xl" anchor="Entrar pela nuvem." rest="Seus dados descem cifrados para este celular." />
      <form onSubmit={submit} noValidate className="module mt-6 flex flex-col gap-4 p-4 sm:p-6" data-testid="cloud-entry-form">
        <Segmented<'invite' | 'signin'>
          label="Como você vai entrar"
          value={mode}
          onChange={setMode}
          stretch
          size="sm"
          options={[
            { value: 'invite', label: 'Tenho um convite', testId: 'cloud-entry-invite' },
            { value: 'signin', label: 'Já tenho conta', testId: 'cloud-entry-signin' },
          ]}
        />
        {mode === 'invite' ? (
          <TextField label="Código de convite do seu par" value={code} onChange={setCode} error={errors.code} autoComplete="one-time-code" testId="cloud-entry-code" maxLength={14} />
        ) : null}
        <TextField label="Seu e-mail" value={email} onChange={setEmail} error={errors.email} autoComplete="email" testId="cloud-entry-email" maxLength={254} />
        <TextField
          label={mode === 'invite' ? 'Crie sua senha' : 'Sua senha'}
          type="password"
          value={pw}
          onChange={setPw}
          error={errors.pw}
          hint={mode === 'invite' ? 'Pelo menos 10 caracteres. Vale para a conta e para abrir o app neste celular.' : undefined}
          autoComplete={mode === 'invite' ? 'new-password' : 'current-password'}
          testId="cloud-entry-password"
          maxLength={128}
        />
        {mode === 'invite' ? (
          <TextField label="Repita a senha" type="password" value={pw2} onChange={setPw2} error={errors.pw2} autoComplete="new-password" testId="cloud-entry-password2" maxLength={128} />
        ) : null}
        <Switch checked={remember} onChange={setRemember} label="Manter conectado neste aparelho (14 dias)" />
        {errors.form ? <FieldError>{errors.form}</FieldError> : null}
        <Button type="submit" variant="primary" size="lg" icon={Cloud} busy={busy} className="w-full" data-testid="cloud-entry-submit">
          {busy ? 'Baixando com segurança...' : 'Entrar'}
        </Button>
      </form>
      <Button variant="ghost" className="mt-4 w-full" onClick={onBack}>
        Voltar e criar um espaço novo
      </Button>
    </Shell>
  )
}

function LocalSetup({ cloudOn, onCloud }: { cloudOn: boolean; onCloud: () => void }) {
  const hasLegacy = useAuth((s) => s.hasLegacyData)
  const [restoring, setRestoring] = useState(false)
  const [name, setName] = useState('')
  const [pronoun, setPronoun] = useState<Pronoun>('ele')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [partner, setPartner] = useState('')
  const [partnerPronoun, setPartnerPronoun] = useState<Pronoun>('ela')
  const [split, setSplit] = useState<SplitMode>('50_50')
  const [share, setShare] = useState(true)
  const [demo, setDemo] = useState(true)
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string | null> = {
      name: name.trim() ? null : 'Como você quer ser chamado(a)?',
      partner: partner.trim() ? null : 'Qual o nome do seu par?',
      pw: validatePassword(pw, { name }),
      pw2: pw2 === pw ? null : 'As senhas não são iguais.',
    }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    setBusy(true)
    try {
      await setup({
        a: { name: name.trim(), pronoun, password: pw },
        b: { name: partner.trim(), pronoun: partnerPronoun },
        splitMode: split,
        shareA: share,
        demo,
        remember,
      })
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Não foi possível criar o espaço.' })
      setBusy(false)
    }
  }

  return (
    <Shell>
      <Title size="xl" anchor="Bem-vindos ao Ampara." rest="Menos peso mental, mais parceria." />
      <p className="mt-3 text-[15px] text-muted">
        Tudo fica cifrado neste aparelho. Sem a senha, ninguém abre os dados de vocês, nem quem pegar o celular.
      </p>
      {cloudOn ? (
        <div className="card mt-5 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="min-w-0 flex-1 basis-[200px] text-[14px] text-ink">
            <strong>Seu par já usa o Ampara?</strong> Entre com o convite ou com sua conta.
          </p>
          <Button variant="quiet" icon={Cloud} onClick={onCloud} data-testid="setup-cloud">
            Entrar pela nuvem
          </Button>
        </div>
      ) : null}
      <div className="card mt-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 basis-[200px] text-[14px] text-ink">
            <strong>Trocou de celular?</strong> Volte com o arquivo de backup.
          </p>
          <Button variant="quiet" icon={Upload} onClick={() => setRestoring((r) => !r)} aria-expanded={restoring} data-testid="setup-restore">
            Restaurar backup
          </Button>
        </div>
        {restoring ? (
          <div className="mt-4 border-t border-line pt-4">
            <RestoreForm replacing={false} />
          </div>
        ) : null}
      </div>
      <form onSubmit={submit} noValidate className="module mt-6 flex flex-col gap-5 p-4 sm:p-6" data-testid="setup-form">
        <div className="flex flex-col gap-4">
          <h2 className="text-[16px] font-bold text-ink">Você</h2>
          <TextField label="Seu nome" value={name} onChange={setName} error={errors.name} autoComplete="given-name" testId="setup-name" autoFocus />
          <ChoiceChips label="Como falar de você" value={pronoun} onChange={setPronoun} options={PRONOUNS} />
          <TextField
            label="Crie uma senha"
            type="password"
            value={pw}
            onChange={setPw}
            error={errors.pw}
            hint="Pelo menos 10 caracteres. Uma frase só sua é mais forte e fácil de lembrar."
            autoComplete="new-password"
            testId="setup-password"
            maxLength={128}
          />
          <TextField label="Repita a senha" type="password" value={pw2} onChange={setPw2} error={errors.pw2} autoComplete="new-password" testId="setup-password2" maxLength={128} />
        </div>

        <div className="flex flex-col gap-4 border-t border-line pt-5">
          <h2 className="text-[16px] font-bold text-ink">Seu par</h2>
          <TextField label="Nome do seu par" value={partner} onChange={setPartner} error={errors.partner} testId="setup-partner" />
          <ChoiceChips label="Como falar do seu par" value={partnerPronoun} onChange={setPartnerPronoun} options={PRONOUNS} />
          <p className="text-[13px] text-muted">Seu par cria a própria senha no primeiro acesso, com um código de convite que aparece no próximo passo.</p>
        </div>

        <div className="flex flex-col gap-4 border-t border-line pt-5">
          <h2 className="text-[16px] font-bold text-ink">Combinados</h2>
          <ChoiceChips<SplitMode>
            label="Como vocês dividem os gastos da casa?"
            value={split}
            onChange={setSplit}
            options={[
              { value: '50_50', label: 'Meio a meio' },
              { value: 'PROPORTIONAL', label: 'Proporcional à renda' },
            ]}
          />
          <Switch checked={share} onChange={setShare} label="Deixar meus gastos pessoais visíveis para meu par" description="Dá para mudar quando quiser. Presentes ficam sempre ocultos." />
          {hasLegacy ? (
            <p className="flex items-start gap-2 rounded-[14px] bg-subtle p-3 text-[14px] text-ink">
              <ShieldCheck size={18} aria-hidden className="mt-0.5 shrink-0 text-action" />
              Os dados que já estavam neste aparelho vão ser cifrados e protegidos pela senha.
            </p>
          ) : (
            <Switch checked={demo} onChange={setDemo} testId="setup-demo" label="Começar com dados de exemplo" description="Bom para conhecer o app. Dá para apagar depois em Ajustes." />
          )}
          <Switch
            checked={remember}
            onChange={setRemember}
            testId="setup-remember"
            label="Manter conectado neste aparelho (14 dias)"
            description="Desligado: o app bloqueia após 15 min sem uso e a cada vez que abrir."
          />
        </div>

        {errors.form ? <FieldError>{errors.form}</FieldError> : null}
        <Button type="submit" variant="primary" size="lg" busy={busy} data-testid="setup-submit" className="w-full">
          {busy ? 'Protegendo os dados...' : 'Criar nosso espaço'}
        </Button>
      </form>
    </Shell>
  )
}

/* ---------- Convite exibido uma vez após criar ---------- */

export function WelcomeScreen() {
  const invite = useAuth((s) => s.welcomeInvite) ?? ''
  const people = useAuth((s) => s.people)
  const [copied, setCopied] = useState(false)
  const partner = people?.B.name ?? 'seu par'
  const deleDela = people?.B.pronoun === 'ele' ? 'dele' : 'dela'
  return (
    <Shell>
      <Title size="xl" anchor="Espaço criado." rest={`Agora é a vez de ${partner}.`} />
      <section className="module mt-6 p-4 sm:p-6" aria-labelledby="convite">
        <h2 id="convite" className="flex items-center gap-2 text-[16px] font-bold text-ink">
          <KeyRound size={18} aria-hidden className="text-action" /> Código de convite de {partner}
        </h2>
        <p className="font-data mt-3 rounded-[16px] bg-subtle px-4 py-3 text-center text-[26px] font-semibold tracking-[0.12em] text-ink" data-testid="invite-code">
          {invite}
        </p>
        <Button
          variant="quiet"
          icon={copied ? CircleCheck : Copy}
          className="mt-3 w-full"
          onClick={() =>
            void navigator.clipboard
              .writeText(invite)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }
        >
          {copied ? 'Copiado' : 'Copiar código'}
        </Button>
        <ol className="mt-4 flex list-decimal flex-col gap-1 pl-5 text-[14px] text-muted">
          <li>
            No celular {deleDela} (ou aqui, tocando no nome {partner}), escolha Primeiro acesso.
          </li>
          <li>Digite o código e crie a senha própria.</li>
          <li>O código vale uma vez e também fica em Ajustes até ser usado.</li>
        </ol>
      </section>
      <Button variant="primary" size="lg" className="mt-6 w-full" onClick={enterApp} data-testid="welcome-enter">
        Entrar no Ampara
      </Button>
    </Shell>
  )
}

/* ---------- Entrada (bloqueado) ---------- */

export function LoginScreen() {
  const people = useAuth((s) => s.people)
  const preselect = useAuth((s) => s.preselect)
  const [who, setWho] = useState<PartnerId>(preselect ?? 'A')
  useEffect(() => {
    if (preselect) setWho(preselect)
  }, [preselect])
  if (!people) return null
  const person = people[who]
  return (
    <Shell>
      <Title size="xl" anchor="Que bom te ver." rest="Quem está usando agora?" />
      <div role="radiogroup" aria-label="Quem vai entrar" className="mt-6 grid grid-cols-2 gap-2">
        {(['A', 'B'] as PartnerId[]).map((id) => {
          const active = id === who
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`login-person-${id}`}
              onClick={() => setWho(id)}
              className={cx(
                'press flex min-h-16 min-w-0 items-center gap-2 rounded-[18px] border px-3 text-left',
                active ? 'border-action bg-selected' : 'border-line bg-surface hoverable',
              )}
            >
              <UserRound size={20} aria-hidden className={cx('shrink-0', active ? 'text-action' : 'text-muted')} />
              <span className="min-w-0">
                <span className="block truncate text-[16px] font-bold text-ink">{people[id].name}</span>
                <span className="block text-[12px] text-muted">{people[id].status === 'invited' ? 'Primeiro acesso' : people[id].status === 'absent' ? 'Outro aparelho' : 'Com senha'}</span>
              </span>
            </button>
          )
        })}
      </div>
      {person.status === 'active' ? (
        <PasswordForm key={who} who={who} person={person} />
      ) : person.status === 'absent' ? (
        <section className="module mt-4 p-4 sm:p-6" data-testid="login-absent">
          <p className="text-[15px] text-ink">
            <strong>{person.name}</strong> usa o Ampara no próprio celular. Neste aparelho só entra quem criou o acesso aqui.
          </p>
        </section>
      ) : (
        <ActivateForm key={who} who={who} person={person} />
      )}
    </Shell>
  )
}

function useThrottle(who: PartnerId) {
  const [now, setNow] = useState(() => Date.now())
  const until = lockedUntil(who)
  useEffect(() => {
    if (until <= now) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [until, now])
  return Math.max(0, Math.ceil((until - now) / 1000))
}

function PasswordForm({ who, person }: { who: PartnerId; person: PersonHeader }) {
  const [pw, setPw] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const wait = useThrottle(who)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!pw) return setError('Digite a senha.')
    setBusy(true)
    try {
      await login(who, pw, remember)
    } catch (err) {
      setPw('')
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.')
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} noValidate className="module mt-4 flex flex-col gap-4 p-4 sm:p-6" data-testid="login-form">
      <TextField
        label={`Senha de ${person.name}`}
        type="password"
        value={pw}
        onChange={(v) => {
          setPw(v)
          setError(null)
        }}
        error={error}
        autoComplete="current-password"
        testId="login-password"
        autoFocus
        maxLength={128}
      />
      <Switch checked={remember} onChange={setRemember} label="Manter conectado neste aparelho (14 dias)" />
      <Button type="submit" variant="primary" size="lg" icon={LockKeyhole} busy={busy} disabled={wait > 0} data-testid="login-submit" className="w-full">
        {busy ? 'Abrindo...' : wait > 0 ? `Aguarde ${wait} s` : 'Entrar'}
      </Button>
      <details className="text-[14px] text-muted">
        <summary className="press min-h-11 cursor-pointer py-2 font-semibold text-action">Esqueci a senha</summary>
        <p className="pb-1">
          Por segurança, a senha não fica guardada em lugar nenhum. Peça para seu par entrar e gerar um novo convite em Ajustes; com ele você cria
          uma senha nova sem perder nada.
        </p>
      </details>
    </form>
  )
}

function ActivateForm({ who, person }: { who: PartnerId; person: PersonHeader }) {
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [busy, setBusy] = useState(false)
  const wait = useThrottle(who)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next = {
      code: code.replace(/[^a-z0-9]/gi, '').length === 10 ? null : 'O código tem 10 letras e números (ex.: ABCDE-FGH23).',
      pw: validatePassword(pw, { name: person.name }),
      pw2: pw === pw2 ? null : 'As senhas não são iguais.',
    }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    setBusy(true)
    try {
      await activate(who, code, pw, remember)
    } catch (err) {
      setErrors({ code: err instanceof Error ? err.message : 'Não foi possível ativar.' })
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} noValidate className="module mt-4 flex flex-col gap-4 p-4 sm:p-6" data-testid="activate-form">
      <p className="text-[15px] text-ink">
        Primeiro acesso de <strong>{person.name}</strong>. Use o código de convite e crie sua senha.
      </p>
      <TextField label="Código de convite" value={code} onChange={setCode} error={errors.code} autoComplete="one-time-code" testId="activate-code" autoFocus maxLength={14} />
      <TextField
        label="Crie sua senha"
        type="password"
        value={pw}
        onChange={setPw}
        error={errors.pw}
        hint="Pelo menos 10 caracteres."
        autoComplete="new-password"
        testId="activate-password"
        maxLength={128}
      />
      <TextField label="Repita a senha" type="password" value={pw2} onChange={setPw2} error={errors.pw2} autoComplete="new-password" testId="activate-password2" maxLength={128} />
      <Switch checked={remember} onChange={setRemember} label="Manter conectado neste aparelho (14 dias)" />
      <Button type="submit" variant="primary" size="lg" busy={busy} disabled={wait > 0} data-testid="activate-submit" className="w-full">
        {busy ? 'Protegendo...' : wait > 0 ? `Aguarde ${wait} s` : 'Ativar e entrar'}
      </Button>
    </form>
  )
}

/** Abrindo o cofre: esqueleto com a forma da tela (marca, título e o cartão principal), sem texto solto no meio */
export function LoadingScreen() {
  return (
    <div className="min-h-dvh bg-bg" role="status" aria-live="polite" aria-busy="true" data-testid="loading-screen">
      <span className="sr-only">Abrindo o Ampara...</span>
      <div className="mx-auto flex max-w-[480px] flex-col gap-4 px-4 pt-6">
        <span className="text-[22px] font-extrabold tracking-tight text-ink" aria-hidden>
          Ampara<span className="text-action">.</span>
        </span>
        <Bone className="mt-4 h-8 w-4/5 rounded-[12px]" />
        <Bone className="h-4 w-3/5" />
        <div className="module mt-2 flex flex-col gap-3 p-5">
          <Bone className="h-4 w-1/3" />
          <Bone className="h-6 w-3/4" />
          <Bone className="h-14 w-full rounded-[18px]" />
        </div>
      </div>
    </div>
  )
}
