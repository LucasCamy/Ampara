import { Download, Upload } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { exportBackup, restoreBackup } from '../../auth/session'
import { parseBackup, type BackupFile } from '../../auth/vault'
import { Button, ChoiceChips, cx, FieldError, SectionHeader, Switch } from '../../components/ui'
import type { PartnerId } from '../../domain/types'
import { ui } from '../../store/ui'

function Pw({ label, value, onChange, error, testId, autoComplete = 'current-password' }: { label: string; value: string; onChange: (v: string) => void; error?: string; testId: string; autoComplete?: string }) {
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

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Restaurar um backup. No primeiro uso (celular novo) substitui o vazio; com dados, pede a confirmação
 * explícita. Só troca o cofre depois que a senha abre o cofre do arquivo.
 */
export function RestoreForm({ replacing, onDone }: { replacing: boolean; onDone?: () => void }) {
  const fileId = useId()
  const [file, setFile] = useState<BackupFile | null>(null)
  const [text, setText] = useState('')
  const [who, setWho] = useState<PartnerId | null>(null)
  const [pw, setPw] = useState('')
  const [agree, setAgree] = useState(!replacing)
  const [errors, setErrors] = useState<{ file?: string; pw?: string; agree?: string }>({})
  const [busy, setBusy] = useState(false)

  const pick = async (f: File | undefined) => {
    setFile(null)
    setErrors({})
    if (!f) return
    try {
      const t = await f.text()
      const parsed = parseBackup(t)
      setText(t)
      setFile(parsed)
      setWho(parsed.vault.people[parsed.exportedBy].status === 'active' ? parsed.exportedBy : null)
    } catch (e) {
      setErrors({ file: e instanceof Error ? e.message : 'Não foi possível ler o arquivo.' })
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next = {
      file: file ? undefined : 'Escolha o arquivo .ampara.',
      pw: !pw ? 'Digite a senha de quem está no backup.' : !who ? 'Escolha quem vai entrar.' : undefined,
      agree: agree ? undefined : 'Confirme que os dados atuais deste aparelho serão substituídos.',
    }
    setErrors(next)
    if (next.file || next.pw || next.agree || !who) return
    setBusy(true)
    try {
      await restoreBackup(text, who, pw)
      onDone?.()
    } catch {
      setErrors({ pw: 'Senha incorreta para este backup.' })
      setBusy(false)
    }
  }

  const people = file ? (['A', 'B'] as PartnerId[]).filter((p) => file.vault.people[p].status === 'active') : []
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-testid="restore-form">
      <div>
        <label htmlFor={fileId} className="mb-1.5 block text-[14px] font-semibold text-ink">
          Arquivo de backup
        </label>
        <input
          id={fileId}
          type="file"
          accept=".ampara,application/json"
          onChange={(e) => void pick(e.target.files?.[0])}
          data-testid="restore-file"
          aria-invalid={errors.file ? true : undefined}
          aria-describedby={errors.file ? `${fileId}-err` : undefined}
          className="block min-h-12 w-full rounded-[14px] border border-line-strong bg-bg p-2 text-[15px] text-ink file:mr-3 file:min-h-10 file:rounded-[10px] file:border-0 file:bg-subtle file:px-3 file:font-semibold file:text-ink"
        />
        {errors.file ? <FieldError id={`${fileId}-err`}>{errors.file}</FieldError> : null}
        {file ? (
          <p className="mt-1.5 text-[13px] text-muted" data-testid="restore-info">
            Backup de{' '}
            <span className="font-data">
              {file.exportedAt.slice(8, 10)}/{file.exportedAt.slice(5, 7)}/{file.exportedAt.slice(0, 4)}
            </span>{' '}
            · {file.vault.people.A.name} e {file.vault.people.B.name}
          </p>
        ) : null}
      </div>
      {people.length > 1 ? (
        <ChoiceChips<PartnerId> label="Quem vai entrar" value={who} onChange={setWho} options={people.map((p) => ({ value: p, label: file!.vault.people[p].name }))} />
      ) : null}
      <Pw label="Senha de quem está no backup" value={pw} onChange={setPw} error={errors.pw} testId="restore-password" />
      {replacing ? (
        <div>
          <Switch
            checked={agree}
            onChange={setAgree}
            testId="restore-agree"
            label="Substituir os dados deste aparelho"
            description="O que existe aqui hoje é trocado pelo backup. Com a nuvem conectada, as mudanças mais novas voltam ao sincronizar."
          />
          {errors.agree ? <FieldError>{errors.agree}</FieldError> : null}
        </div>
      ) : null}
      <Button type="submit" variant={replacing ? 'secondary' : 'primary'} icon={Upload} busy={busy} data-testid="restore-submit">
        {busy ? 'Conferindo a senha...' : 'Restaurar backup'}
      </Button>
    </form>
  )
}

/** Ajustes: baixar o backup cifrado (com a senha de novo) e restaurar */
export function BackupSection() {
  const [panel, setPanel] = useState<null | 'export' | 'restore'>(null)
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const doExport = async (e: FormEvent) => {
    e.preventDefault()
    if (!pw) return setError('Digite sua senha.')
    setBusy(true)
    try {
      const { name, content } = await exportBackup(pw)
      download(name, content)
      ui.toast('Backup baixado. Guarde num lugar seu (e-mail, nuvem, pendrive).')
      setPanel(null)
      setPw('')
    } catch {
      setError('Senha incorreta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="module p-4 sm:p-5" aria-labelledby="backup" data-testid="backup-section">
      <SectionHeader id="backup" title="Backup" rest="· cifrado" />
      <p className="text-[14px] text-muted">
        Um arquivo com tudo deste aparelho, cifrado do mesmo jeito que aqui. Se o celular sumir ou o navegador limpar os dados, é por ele que vocês voltam. A conexão com a nuvem não vai junto: depois de restaurar, conecte de novo em Ajustes.
      </p>
      <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
        <Button size="sm" variant="quiet" icon={Download} onClick={() => setPanel(panel === 'export' ? null : 'export')} aria-expanded={panel === 'export'} data-testid="backup-export-open">
          Baixar backup
        </Button>
        <Button size="sm" variant="ghost" icon={Upload} onClick={() => setPanel(panel === 'restore' ? null : 'restore')} aria-expanded={panel === 'restore'} data-testid="backup-restore-open">
          Restaurar
        </Button>
      </div>
      {panel === 'export' ? (
        <form onSubmit={doExport} noValidate className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <Pw
            label="Sua senha (confirmação)"
            value={pw}
            onChange={(v) => {
              setPw(v)
              setError(undefined)
            }}
            error={error}
            testId="backup-password"
          />
          <Button type="submit" variant="primary" icon={Download} busy={busy} data-testid="backup-export">
            Baixar arquivo .ampara
          </Button>
        </form>
      ) : null}
      {panel === 'restore' ? (
        <div className="mt-4 border-t border-line pt-4">
          <RestoreForm replacing />
        </div>
      ) : null}
    </section>
  )
}
