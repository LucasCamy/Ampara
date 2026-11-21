export interface EncryptedBackup {
  name: string
  content: string
}

/** O conteúdo já chega cifrado da sessão. O arquivo não leva a conexão com a nuvem. */
export function downloadEncryptedBackup({ name, content }: EncryptedBackup): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  try {
    document.body.appendChild(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
