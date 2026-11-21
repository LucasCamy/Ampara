import { at, expect, goSettings, goTab, noHorizontalOverflow, PASSWORDS, skipTour, test, type Page } from './fixtures'

async function solo(page: Page) {
  await at(page, '10:00')
  await skipTour(page)
  await page.goto('/')
  await page.getByTestId('setup-mode-solo').click()
  await page.getByTestId('setup-name').fill('Lucas')
  await page.getByTestId('setup-password').fill(PASSWORDS.A)
  await page.getByTestId('setup-password2').fill(PASSWORDS.A)
  await page.getByTestId('setup-submit').click()
  await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
}

test('leitura acessível: fontes e espaçamento têm efeito real e persistem', async ({ page, errors }) => {
  void errors
  await solo(page)
  await goSettings(page, 'aparelho')
  await page.getByTestId('reading-font-lexend').click()
  await page.getByTestId('reading-wide').click()
  await expect(page.locator('html')).toHaveAttribute('data-font', 'lexend')
  await expect(page.locator('html')).toHaveAttribute('data-reading', 'wide')
  const preview = page.getByTestId('reading-preview')
  await expect(preview).toHaveCSS('font-family', /Lexend/)
  const styles = await preview.locator('p').first().evaluate((node) => {
    const style = getComputedStyle(node)
    return { line: parseFloat(style.lineHeight) / parseFloat(style.fontSize), letter: parseFloat(style.letterSpacing) / parseFloat(style.fontSize) }
  })
  expect(styles.line).toBeCloseTo(1.7)
  expect(styles.letter).toBeCloseTo(0.03)
  await page.getByTestId('reading-font-atkinson').click()
  await expect(preview).toHaveCSS('font-family', /Atkinson Hyperlegible/)
  await page.reload()
  await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('html')).toHaveAttribute('data-font', 'atkinson')
  await expect(page.locator('html')).toHaveAttribute('data-reading', 'wide')
  await goSettings(page, 'aparelho')
  await expect(page.getByTestId('reading-font-atkinson')).toHaveAttribute('aria-checked', 'true')
  await noHorizontalOverflow(page)
})

test('captura livre entende gasto e funciona sem API de reconhecimento de voz', async ({ page, errors }) => {
  void errors
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined })
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined })
  })
  await solo(page)
  await page.locator('[data-testid="quick-capture"]:visible').click()
  const sheet = page.getByTestId('sheet-quickCapture')
  await sheet.getByTestId('quick-input').fill('gastei 35 na farmácia')
  await expect(sheet).toContainText('35,00')
  await sheet.getByTestId('quick-save').click()
  await expect(sheet).toBeHidden()
  await goTab(page, 'financas')
  await expect(page.getByTestId('solo-realized')).toContainText('35,00')
  await expect(page.getByTestId('personal-list')).toContainText(/farmácia/i)
})

test('ditado recebe a frase final depois de Parar e ignora resultado após edição ou fechamento', async ({ page, errors }) => {
  void errors
  await page.addInitScript(() => {
    type Result = { results: { transcript: string }[][] }
    const host = window as unknown as { voice: Recognition; lateVoice: () => void }
    class Recognition {
      onstart: (() => void) | null = null
      onresult: ((event: Result) => void) | null = null
      onend: (() => void) | null = null
      constructor() { host.voice = this }
      start() { this.onstart?.() }
      stop() {
        // O navegador pode enfileirar o resultado final depois de stop.
        const callback = this.onresult
        host.lateVoice = () => callback?.({ results: [[{ transcript: 'frase atrasada que deve ser ignorada' }]] })
      }
      abort() {}
      finish(text: string) { this.onresult?.({ results: [[{ transcript: text }]] }); this.onend?.() }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined })
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: Recognition })
  })
  await solo(page)
  await page.locator('[data-testid="quick-capture"]:visible').click()
  const sheet = page.getByTestId('sheet-quickCapture')
  const mic = sheet.getByTestId('quick-mic')
  await mic.click()
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  await mic.click()
  await page.evaluate(() => (window as unknown as { voice: { finish(text: string): void } }).voice.finish('gastei 35 na farmácia'))
  await expect(sheet.getByTestId('quick-input')).toHaveValue('gastei 35 na farmácia')
  await expect(sheet.getByTestId('quick-preview')).toContainText('35,00')
  await sheet.getByTestId('quick-save').click()
  await expect(sheet).toBeHidden()
  await goTab(page, 'financas')
  await expect(page.getByTestId('solo-realized')).toContainText('35,00')

  await page.locator('[data-testid="quick-capture"]:visible').click()
  await mic.click()
  await mic.click()
  await sheet.getByTestId('quick-input').fill('ligar na clínica amanhã')
  await page.evaluate(() => (window as unknown as { lateVoice(): void }).lateVoice())
  await expect(sheet.getByTestId('quick-input')).toHaveValue('ligar na clínica amanhã')
  await mic.click()
  await mic.click()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await page.evaluate(() => (window as unknown as { lateVoice(): void }).lateVoice())
  await page.locator('[data-testid="quick-capture"]:visible').click()
  await expect(sheet.getByTestId('quick-input')).toHaveValue('')
})

test('Ouvir meu dia chama a fala no toque e para ao bloquear o cofre', async ({ page, errors }) => {
  void errors
  await page.addInitScript(() => {
    const host = window as unknown as { daySpeechCalls: string[]; speechCancels: number }
    host.daySpeechCalls = []
    host.speechCancels = 0
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(public text: string) {} } })
    Object.defineProperty(window, 'speechSynthesis', { value: {
      paused: false,
      getVoices: () => [],
      speak: (utterance: { text: string }) => host.daySpeechCalls.push(utterance.text),
      cancel: () => { host.speechCancels++ },
    } })
  })
  await solo(page)
  await page.getByTestId('listen-day').click()
  await expect(page.getByTestId('listen-day')).toHaveText('Parar')
  const spoken = await page.evaluate(() => (window as unknown as { daySpeechCalls: string[] }).daySpeechCalls)
  expect(spoken).toHaveLength(1)
  expect(spoken[0]).toContain('Vamos com calma')
  const before = await page.evaluate(() => (window as unknown as { speechCancels: number }).speechCancels)
  await page.locator('[data-testid="lock"]:visible').click()
  await expect(page.getByTestId('login-form')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { speechCancels: number }).speechCancels)).toBeGreaterThan(before)
})
