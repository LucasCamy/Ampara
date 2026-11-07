import { KeyRound, Lock, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { changeMyPassword, lock, reinvitePartner, useAuth, wipeDevice } from '../../auth/session'
import { validatePassword } from '../../auth/vault'
import { Actions, Button, cx, FieldError, SectionHeader, StatusBadge } from '../../components/ui'
import { ui } from '../../store/ui'
import { publishInvite } from '../../sync/cloud'

type Panel = null | 'password' | 'reinvite' | 'wipe'

function PwInput({ label, value, onChange, error, testId, autoComplete }: { label: string; value: string; onChange: (v: string) => void; error?: string | null; testId?: string; autoComplete: string }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        maxLength={128}
        autoComplete={autoComplete}
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

/** Segurança da conta: troca de senha, recuperação do par e apagar o aparelho, sempre com a senha de novo */
export function SecuritySection({ partnerName }: { partnerName: string }) {
  const remembered = useAuth((s) => s.remembered)
  const [panel, setPanel] = useState<Panel>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [next2, setNext2] = useState('')
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [busy, setBusy] = useState(false)
  const [invite, setInvite] = useState<string | null>(null)

  const reset = (p: Panel) => {
    setPanel(p)
    setCurrent('')
    setNext('')
    setNext2('')
    setErrors({})
    setInvite(null)
  }

  const run = async (e: FormEvent, fn: () => Promise<void>) => {
    e.preventDefault()
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setErrors({ current: err instanceof Error ? err.message : 'Não foi possível concluir.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="module p-4 sm:p-5" aria-labelledby="seguranca">
      <SectionHeader id="seguranca" title="Segurança" rest="· deste aparelho" />
      <ul className="mb-4 flex flex-col gap-1.5 text-[13px] text-muted">
        <li className="flex items-start gap-2">
          <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-action" /> Dados cifrados no aparelho (AES-256). A senha nunca é guardada.
        </li>
        <li className="flex items-start gap-2">
          <Lock size={16} aria-hidden className="mt-0.5 shrink-0 text-action" />
          {remembered ? 'Conectado por até 14 dias neste aparelho. Bloquear encerra isso.' : 'Bloqueia sozinho após 15 min sem uso.'}
        </li>
      </ul>
      <Actions className="mt-0">
        <Button block variant="quiet" icon={Lock} onClick={() => void lock()}>
          Bloquear agora
        </Button>
        <Button block variant={panel === 'password' ? 'secondary' : 'quiet'} icon={KeyRound} onClick={() => reset(panel === 'password' ? null : 'password')} aria-expanded={panel === 'password'}>
          Trocar senha
        </Button>
        <Button block variant={panel === 'reinvite' ? 'secondary' : 'quiet'} icon={UserPlus} onClick={() => reset(panel === 'reinvite' ? null : 'reinvite')} aria-expanded={panel === 'reinvite'}>
          Novo convite para {partnerName}
        </Button>
      </Actions>

      {panel === 'password' ? (
        <form
          className="mt-4 flex flex-col gap-3 rounded-[18px] bg-subtle p-3"
          noValidate
          onSubmit={(e) =>
            run(e, async () => {
              const v = { next: validatePassword(next), next2: next === next2 ? null : 'As senhas não são iguais.' }
              if (v.next || v.next2) {
                setErrors(v)
                return
              }
              await changeMyPassword(current, next)
              reset(null)
              ui.toast('Senha trocada. Outros aparelhos e abas precisam entrar de novo.', { tone: 'info' })
            })
          }
        >
          <PwInput label="Senha atual" value={current} onChange={setCurrent} error={errors.current} autoComplete="current-password" />
          <PwInput label="Nova senha" value={next} onChange={setNext} error={errors.next} autoComplete="new-password" />
          <PwInput label="Repita a nova senha" value={next2} onChange={setNext2} error={errors.next2} autoComplete="new-password" />
          <Button block type="submit" variant="primary" busy={busy}>
            {busy ? 'Protegendo...' : 'Salvar nova senha'}
          </Button>
        </form>
      ) : null}

      {panel === 'reinvite' ? (
        invite ? (
          <div className="mt-4 rounded-[18px] bg-subtle p-3" role="status">
            <StatusBadge kind="ok">Novo convite criado</StatusBadge>
            <p className="font-data mt-2 text-center text-[22px] font-semibold tracking-[0.12em] text-ink" data-testid="reinvite-code">
              {invite}
            </p>
            <p className="mt-1 text-[13px] text-muted">A senha antiga de {partnerName} deixou de funcionar. Passe o código só pessoalmente.</p>
          </div>
        ) : (
          <form
            className="mt-4 flex flex-col gap-3 rounded-[18px] bg-subtle p-3"
            noValidate
            onSubmit={(e) =>
              run(e, async () => {
                const code = await reinvitePartner(current)
                await publishInvite(code)
                setInvite(code)
              })
            }
          >
            <p className="text-[14px] text-ink">Use quando {partnerName} esquecer a senha. Confirme com a sua senha.</p>
            <PwInput label="Sua senha" value={current} onChange={setCurrent} error={errors.current} autoComplete="current-password" />
            <Button block type="submit" variant="primary" busy={busy}>
              {busy ? 'Gerando...' : 'Gerar novo convite'}
            </Button>
          </form>
        )
      ) : null}

      <div className="mt-5 border-t border-line pt-4">
        {panel === 'wipe' ? (
          <form
            className="flex flex-col gap-3 rounded-[18px] border border-err bg-err-soft p-3"
            noValidate
            onSubmit={(e) => run(e, () => wipeDevice(current))}
          >
            <p className="text-[14px] font-semibold text-ink">Apagar o espaço do casal deste aparelho? Não dá para desfazer.</p>
            <PwInput label="Confirme com sua senha" value={current} onChange={setCurrent} error={errors.current} autoComplete="current-password" />
            <div className="flex flex-col gap-2">
              <Button block type="submit" variant="secondary" className="border-err text-err" busy={busy}>
                Apagar tudo deste aparelho
              </Button>
              <Button block variant="quiet" onClick={() => reset(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <Button block variant="ghost" icon={Trash2} className="text-err" onClick={() => reset('wipe')}>
            Apagar dados deste aparelho
          </Button>
        )}
      </div>
    </section>
  )
}
