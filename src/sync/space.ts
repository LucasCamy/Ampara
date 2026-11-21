import { convertCoupleToSolo, type EncryptedBackup } from '../auth/session'
import { dataStore } from '../store/data'
import { prepareSoloConversion, pull } from './cloud'
import { isOnline, withSyncPaused } from './engine'

/** Um espaço já conectado muda no servidor antes de substituir o cofre deste aparelho. */
export async function convertSpaceToSolo(
  password: string,
  saveBackup: (backup: EncryptedBackup) => void | Promise<void>,
): Promise<void> {
  await withSyncPaused(async () => {
    if (dataStore.get().couple.couple?.spaceId && !isOnline()) {
      throw new Error('Conecte a internet para mudar este espaço em todos os aparelhos.')
    }
    const commit = await prepareSoloConversion()
    // O backup também inclui o que chegou dos outros aparelhos antes da mudança.
    if (commit) await pull()
    await convertCoupleToSolo(password, saveBackup, commit)
  })
}
