import { at, expect, goTab, noHorizontalOverflow, open, quick, setEnergy, setViewer, shot, test } from './fixtures'

test.describe('Ampara', () => {
  test('Bateria 10% simplifica o Hoje para 1 ação + pedir ajuda', async ({ page, errors }, info) => {
    void errors
    await at(page, '08:05')
    await open(page)
    await expect(page.getByTestId('today-normal')).toBeVisible()
    await expect(page.getByTestId('focus-list')).toBeVisible()
    await shot(page, '01-hoje-normal', info.project.name)

    await setEnergy(page, 'OVERLOAD')
    await expect(page.getByTestId('today-overload')).toBeVisible()
    await expect(page.getByTestId('now-card')).toHaveCount(1)
    await expect(page.getByTestId('overload-help')).toBeVisible()
    // tudo o que é secundário fica recolhido em "Pode esperar"
    await expect(page.getByTestId('focus-list')).toBeHidden()
    await expect(page.getByTestId('help-request-card')).toBeHidden()
    await expect(page.getByTestId('can-wait')).toBeVisible()
    await shot(page, '02-hoje-sobrecarga', info.project.name)
    await noHorizontalOverflow(page)

    // o par vê o aviso de modo calmo
    await setViewer(page, 'B')
    await expect(page.getByTestId('partner-calm')).toBeVisible()
  })

  test('Remédio: Pegando água (+5 min) e depois Já engoli', async ({ page, errors }, info) => {
    void errors
    await at(page, '08:03')
    await open(page)
    const card = page.getByTestId('now-card')
    await expect(card).toContainText('Venvanse 30mg')
    await expect(card).toContainText('12 na caixa')

    await card.getByTestId('dose-snooze').click()
    const snooze = card.locator('[data-status="snooze"]')
    await expect(snooze).toContainText(/Pegando água · 0[45]:\d\d/)
    await expect(card).toHaveClass(/ledger-dashed/)
    await page.clock.fastForward(60_000)
    await expect(snooze).toContainText(/Pegando água · 0[34]:\d\d/)
    await shot(page, '03-remedio-snooze', info.project.name)

    await card.getByTestId('dose-take').click()
    await expect(page.getByTestId('toast').last()).toContainText('Tomado às 08:04')
    await expect(page.getByTestId('toast').last()).toContainText('restam 11')

    await goTab(page, 'rotinas')
    const dose = page.locator('[data-testid="dose-card"][data-med="Venvanse 30mg"]')
    await expect(dose.locator('[data-status="ok"]')).toContainText('Tomado às 08:04')
    await expect(dose).toHaveClass(/ledger-ok/)
    await expect(page.locator('[data-testid="med-settings"][data-med="Venvanse 30mg"]').getByTestId('stock-line')).toContainText('11 comprimidos')
    await shot(page, '04-remedios-tomado', info.project.name)
    await noHorizontalOverflow(page)
  })

  test('Rede de apoio: atraso de +30 min aparece para o par e o lembrete chega', async ({ page, errors }) => {
    void errors
    await at(page, '08:40')
    await open(page)
    await setViewer(page, 'B')
    const alert = page.getByTestId('partner-delay-alert')
    await expect(alert).toContainText('08:00')
    await alert.getByTestId('send-nudge').click()
    await expect(alert).toContainText('Lembrete enviado')
    await setViewer(page, 'A')
    await expect(page.getByLabel('Lembrete carinhoso')).toContainText('Venvanse')
  })

  test('Finanças: casal, pessoal, presente e chave de transparência', async ({ page, errors }, info) => {
    void errors
    await at(page, '10:00')
    await open(page)

    const addExpense = async (digits: string, desc: string, personal: boolean, gift = false) => {
      await quick(page, 'expense')
      const sheet = page.getByTestId('sheet-expense')
      await expect(sheet).toBeVisible()
      await sheet.getByTestId('expense-amount').pressSequentially(digits)
      await sheet.getByTestId('expense-description').fill(desc)
      if (personal) await sheet.getByRole('radio', { name: 'Só meu' }).click()
      if (gift) await sheet.getByTestId('expense-gift').click()
      if (!personal) await expect(sheet.getByTestId('expense-preview')).toBeVisible()
      await sheet.getByTestId('expense-save').click()
      await expect(sheet).toBeHidden()
    }

    // validação inline: valor zero
    await quick(page, 'expense')
    await page.getByTestId('expense-save').click()
    await expect(page.getByRole('alert').filter({ hasText: 'maior que R$ 0,00' })).toBeVisible()
    await expect(page.getByTestId('expense-amount')).toHaveAttribute('aria-invalid', 'true')
    await page.keyboard.press('Escape')

    await addExpense('4590', 'Farmácia do casal', false)
    await expect(page.getByTestId('toast').last()).toContainText('Parte de Namorada: R$ 22,95')
    await addExpense('3000', 'Cinema sozinho', true)
    await addExpense('25000', 'Colar de presente', true, true)
    await expect(page.getByTestId('toast').last()).toContainText('oculto para o par')

    await goTab(page, 'financas')
    // 110,00 do exemplo + 22,95 da farmácia
    await expect(page.getByTestId('balance-sentence')).toHaveText('Namorada transfere R$ 132,95 para você para zerar novembro')
    await shot(page, '05-financas-casal', info.project.name)
    await page.getByTestId('fin-MINE').click()
    await expect(page.getByTestId('personal-list')).toContainText('Colar de presente')
    await expect(page.getByTestId('personal-list')).toContainText('oculto para Namorada')

    // visão dela com a transparência de Lucas ATIVADA
    await setViewer(page, 'B')
    await page.getByTestId('fin-PARTNER').click()
    await expect(page.getByTestId('personal-list')).toContainText('Cinema sozinho')
    await expect(page.getByTestId('personal-list')).not.toContainText('Colar de presente')
    await expect(page.getByText('Colar de presente')).toHaveCount(0)
    await shot(page, '06-financas-dele-leitura', info.project.name)
    await page.getByTestId('fin-US').click()
    await expect(page.getByTestId('couple-list')).toContainText('Farmácia do casal')
    await expect(page.getByTestId('balance-sentence')).toHaveText('Você transfere R$ 132,95 para Lucas para zerar novembro')

    // Lucas desliga a chave
    await setViewer(page, 'A')
    await page.getByTestId('fin-MINE').click()
    await page.getByTestId('share-toggle').click()
    await expect(page.getByTestId('share-toggle')).toHaveAttribute('aria-checked', 'false')
    await setViewer(page, 'B')
    await page.getByTestId('fin-PARTNER').click()
    await expect(page.getByTestId('personal-closed')).toContainText('Visão pessoal fechada no momento')
    await expect(page.getByTestId('personal-closed')).toContainText('Os gastos do casal seguem visíveis na aba Nós')
    await expect(page.getByText('Cinema sozinho')).toHaveCount(0)
    await shot(page, '07-financas-dele-fechada', info.project.name)

    // quitação zera o saldo
    await page.getByTestId('fin-US').click()
    await page.getByTestId('settle').click()
    await expect(page.getByTestId('balance-sentence')).toHaveText('R$ 0,00 · Contas de novembro em dia')
    await noHorizontalOverflow(page)
  })

  test('Pedido de ajuda em 3 cliques e aceite na visão do par', async ({ page, errors }, info) => {
    void errors
    await at(page, '10:00')
    await open(page)
    await quick(page, 'sos')
    const sheet = page.getByTestId('sheet-sos')
    await sheet.getByTestId('sos-task').filter({ hasText: 'Ligar na imobiliária' }).click()
    await sheet.getByTestId('sos-take-over').click()
    await shot(page, '08-sos-passo-3', info.project.name)
    await sheet.getByTestId('sos-urgency-NOW').click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('help-waiting')).toContainText('Ligar na imobiliária')

    await setViewer(page, 'B')
    const card = page.getByTestId('help-request-card').filter({ hasText: 'Ligar na imobiliária' })
    await expect(card).toContainText('Assumir por mim')
    await expect(card).toContainText('Agora')
    await shot(page, '09-sos-visao-par', info.project.name)
    await card.getByTestId('help-take-over').click()
    await expect(card).toHaveCount(0)
    // a tarefa passou para ela
    await expect(page.locator('[data-task-title="Ligar na imobiliária sobre o reajuste"]').first()).toContainText('Meu')

    await setViewer(page, 'A')
    await expect(page.getByTestId('help-answered')).toContainText('Namorada assumiu')
  })

  test('Tarefa rápida em menos de 3 toques com Desfazer', async ({ page, errors }) => {
    void errors
    await at(page, '10:00')
    await open(page)
    await quick(page, 'task')
    const sheet = page.getByTestId('sheet-task')
    await sheet.getByTestId('task-save').click()
    await expect(sheet.getByRole('alert')).toBeVisible()
    const input = sheet.getByLabel('O que precisa ser feito?')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await input.fill('Comprar pilhas')
    await input.press('Enter')
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('toast').last()).toContainText('Tarefa salva para hoje')
    await page.getByTestId('toast').last().getByRole('button', { name: 'Desfazer' }).click()
    await expect(page.locator('[data-task-title="Comprar pilhas"]')).toHaveCount(0)
  })

  test('Offline-first: fila sync_outbox segura as mudanças e persiste após recarregar', async ({ page, errors }) => {
    void errors
    await at(page, '10:00')
    await open(page)
    const pill = page.locator('[data-testid="sync-pill"]:visible')
    await expect(pill).toHaveAttribute('data-state', 'ok')
    await pill.click()
    await expect(pill).toHaveAttribute('data-state', 'offline')
    await quick(page, 'task')
    const input = page.getByTestId('sheet-task').getByLabel('O que precisa ser feito?')
    await input.fill('Comprar lâmpada offline')
    await input.press('Enter')
    await expect(pill).toHaveText(/Offline · 1/)

    await page.reload()
    await goTab(page, 'agenda')
    await expect(page.locator('[data-task-title="Comprar lâmpada offline"]').first()).toBeVisible()
    await expect(page.locator('[data-testid="sync-pill"]:visible')).toHaveAttribute('data-state', 'offline')

    await page.locator('[data-testid="sync-pill"]:visible').click()
    await page.clock.fastForward(2000)
    await expect(page.locator('[data-testid="sync-pill"]:visible')).toHaveAttribute('data-state', 'ok')
  })

  for (const kind of ['task', 'expense', 'med', 'sos'] as const) {
    test(`Atalho do iPhone /?quick=${kind}`, async ({ page, errors }) => {
      void errors
      await at(page, '08:05')
      await open(page, `/?quick=${kind}${kind === 'expense' ? '&amount=12,50' : ''}`)
      await expect(page.getByTestId(`sheet-${kind}`)).toBeVisible()
      await expect(page).not.toHaveURL(/quick=/)
      if (kind === 'expense') await expect(page.getByTestId('expense-amount')).toHaveValue('R$ 12,50')
      if (kind === 'med') await expect(page.getByTestId('sheet-med')).toContainText('Venvanse 30mg')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId(`sheet-${kind}`)).toBeHidden()
    })
  }

  test('Todas as telas sem overflow, nos dois temas', async ({ page, errors }, info) => {
    void errors
    await at(page, '10:00')
    await open(page)
    for (const tab of ['hoje', 'agenda', 'rotinas', 'financas', 'ajustes'] as const) {
      await goTab(page, tab)
      await noHorizontalOverflow(page)
      await shot(page, `10-tela-${tab}`, info.project.name)
    }
    await goTab(page, 'agenda')
    for (const v of ['WEEK', 'MONTH', 'INBOX'] as const) {
      await page.getByTestId(`agenda-${v}`).click()
      await expect(page.getByTestId(`agenda-${v}`)).toHaveAttribute('aria-checked', 'true')
      await noHorizontalOverflow(page)
      await shot(page, `11-agenda-${v.toLowerCase()}`, info.project.name)
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', info.project.name.endsWith('dark') ? 'dark' : 'light')
  })
})
