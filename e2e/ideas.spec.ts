import { at, expect, goSettings, goTab, noHorizontalOverflow, open, PASSWORDS, setViewer, shot, test } from './fixtures'

test('Gemini em Ajustes usa a chave da pessoa e organiza uma captura com o contrato', async ({ page }) => {
  const fakeKey = 'chave-gemini-ficticia-para-e2e'
  const capture = 'quero cultivar manjericão na varanda'
  await page.route('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'content-type, x-goog-api-key',
      } })
      return
    }
    const payload = request.postDataJSON()
    expect(request.headers()['x-goog-api-key']).toBe(fakeKey)
    expect(JSON.parse(payload.contents[0].parts[0].text).captura).toBe(capture)
    expect(payload.generationConfig.responseJsonSchema.properties.versao.enum).toEqual(['organizador@1'])
    const json = { versao: 'organizador@1', operacoes: [
      { tipo: 'CRIAR_ASSUNTO', ref: 'a1', area_id: 'A:casa', nome: 'Horta' },
      { tipo: 'CRIAR_IDEIA', trecho: capture, assunto_ref: 'a1', titulo: 'Cultivar manjericão', natureza: 'PLANO', confianca: 0.95 },
    ] }
    await route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(json) }] } }] },
    })
  })

  await open(page)
  await goSettings(page, 'aparelho')
  await page.getByTestId('ai-gemini').click()
  await expect(page.getByText('Chave necessária')).toBeVisible()
  await noHorizontalOverflow(page)
  await page.getByTestId('gemini-save').click()
  await expect(page.getByTestId('gemini-key')).toHaveAttribute('aria-invalid', 'true')
  await page.getByTestId('gemini-key').fill(fakeKey)
  await page.getByTestId('gemini-password').fill(PASSWORDS.A)
  await page.getByTestId('gemini-save').click()
  await expect(page.getByText('Chave disponível')).toBeVisible()
  await expect(page.getByTestId('gemini-key')).toHaveValue('')

  await goTab(page, 'ideias')
  await page.getByTestId('idea-capture-input').fill(capture)
  await page.getByTestId('idea-capture-save').click()
  await expect(page.getByText('Organizei em Casa › Horta')).toBeVisible()
  await setViewer(page, 'B')
  await goSettings(page, 'aparelho')
  await page.getByTestId('ai-gemini').click()
  await expect(page.getByText('Chave necessária')).toBeVisible()
  await expect(page.getByTestId('gemini-remove')).toHaveCount(0)
})

test('ideias: soltar, organizar à mão, esboço, estado, filtros e mapa', async ({ page, errors }, info) => {
  void errors
  await at(page, '10:00')
  await open(page)
  await goTab(page, 'ideias')
  await expect(page.getByTestId('ideas-screen')).toBeVisible()

  // soltar vazio explica; soltar de verdade grava na hora e limpa o campo
  await page.getByTestId('idea-capture-save').click()
  await expect(page.getByTestId('idea-capture').getByRole('alert')).toContainText('Escreva ou dite')
  const input = page.getByTestId('idea-capture-input')
  await input.fill('quero correr de manhã antes do trabalho')
  await page.getByTestId('idea-capture-save').click()
  await expect(page.getByText('Guardado na Caixa de entrada')).toBeVisible()
  await expect(input).toHaveValue('')
  await noHorizontalOverflow(page)
  await shot(page, '70-ideias-soltar', info.project.name)

  // Caixa de entrada: organizar à mão (Área > novo Assunto > nova Ideia)
  await page.getByTestId('ideas-view-caixa').click()
  const inbox = page.getByTestId('ideas-inbox')
  await expect(inbox).toContainText('quero correr de manhã antes do trabalho')
  await inbox.getByTestId('inbox-organize').click()
  const sheet = page.getByTestId('sheet-organizeIdea')
  await expect(sheet).toBeVisible()
  await sheet.getByTestId('organize-save').click()
  await expect(sheet.getByRole('alert').first()).toContainText('Escolha uma área')
  await sheet.getByTestId('organize-area-A:saude').click()
  await sheet.getByTestId('organize-topic-new').click()
  await sheet.getByLabel('Nome do assunto').fill('Corrida')
  await sheet.getByLabel('3. Nome da ideia').fill('Correr de manhã')
  await sheet.getByTestId('nature-PLANO').click()
  await shot(page, '71-ideias-organizar', info.project.name)
  await sheet.getByTestId('organize-save').click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('Guardado em Saúde')).toBeVisible()
  await expect(page.getByText('Caixa de entrada vazia.')).toBeVisible()

  // Esboço: Saúde > Corrida > Correr de manhã (solta)
  await page.getByTestId('ideas-view-esboco').click()
  const outline = page.getByTestId('ideas-outline')
  await expect(page.getByTestId('outline-area-A:saude')).toContainText('1 ideia')
  const row = outline.getByRole('button', { name: /Correr de manhã/ })
  await expect(row).toContainText('Solta')
  await expect(row).toContainText('Plano')
  await expect(row).toContainText('1 anotação')
  await noHorizontalOverflow(page)
  await shot(page, '72-ideias-esboco', info.project.name)

  // Cartão da ideia: a anotação literal aparece; guardar tira das ativas
  await row.click()
  const card = page.getByTestId('sheet-idea')
  await expect(card.getByTestId('idea-notes')).toContainText('quero correr de manhã antes do trabalho')
  await card.getByTestId('idea-state-guardada').click()
  await card.getByTestId('idea-save').click()
  await expect(card).toBeHidden()
  await expect(page.getByText('Ideia salva')).toBeVisible()
  await expect(outline.getByRole('button', { name: /Correr de manhã/ })).toHaveCount(0)
  await page.getByTestId('ideas-show-guardadas').click()
  await expect(page.getByTestId('ideas-outline').getByRole('button', { name: /Correr de manhã/ })).toContainText('Guardada')
  await page.getByTestId('ideas-show-todas').click()

  // Mapa: Céu > Saúde > ideia abre o cartão
  await page.getByTestId('ideas-view-mapa').click()
  const map = page.getByTestId('ideas-map')
  await expect(map.getByTestId('map-node-A:saude')).toBeVisible()
  await map.getByTestId('map-node-A:saude').click()
  await expect(map.getByRole('button', { name: 'Ideia Correr de manhã' })).toBeVisible()
  await map.getByRole('button', { name: 'Aproximar' }).click()
  await noHorizontalOverflow(page)
  await shot(page, '73-ideias-mapa', info.project.name)
  await map.getByRole('button', { name: 'Centralizar' }).click()
  await map.getByRole('button', { name: 'Ideia Correr de manhã' }).click()
  await expect(page.getByTestId('sheet-idea')).toBeVisible()
  await page.keyboard.press('Escape')
  await map.getByTestId('map-crumb-root').click()
  await expect(map.getByTestId('map-node-A:trabalho')).toBeVisible()
})

test('captura livre: o que não é gasto, compra ou tarefa vira ideia', async ({ page, errors }) => {
  void errors
  await at(page, '10:00')
  await open(page)
  await page.locator('[data-testid="quick-capture"]:visible').first().click()
  const sheet = page.getByTestId('sheet-quickCapture')
  await sheet.getByTestId('quick-input').fill('será que vale a pena trocar de emprego')
  await expect(sheet.getByTestId('quick-idea-preview')).toContainText('Vai para Ideias')
  await sheet.getByTestId('quick-save').click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('Guardado em Ideias, na Caixa de entrada')).toBeVisible()
  await goTab(page, 'ideias')
  await page.getByTestId('ideas-view-caixa').click()
  await expect(page.getByTestId('ideas-inbox')).toContainText('será que vale a pena trocar de emprego')
})

test('ideias são privadas no mesmo aparelho e o módulo pode ser desligado', async ({ page, errors }) => {
  void errors
  await at(page, '10:00')
  await open(page)
  await goTab(page, 'ideias')
  await page.getByTestId('idea-capture-input').fill('pensamento só do Lucas')
  await page.getByTestId('idea-capture-save').click()
  await page.getByTestId('ideas-view-caixa').click()
  await expect(page.getByTestId('ideas-inbox')).toContainText('pensamento só do Lucas')

  await setViewer(page, 'B')
  await goTab(page, 'ideias')
  await page.getByTestId('ideas-view-caixa').click()
  await expect(page.getByText('Caixa de entrada vazia.')).toBeVisible()
  await expect(page.getByText('pensamento só do Lucas')).toHaveCount(0)

  // desligar o módulo tira a aba (os dados ficam guardados)
  await goSettings(page, 'casal')
  await page.getByTestId('settings-module-ideas').click()
  await expect(page.locator('[data-testid="nav-ideias"]:visible, [data-testid="side-ideias"]:visible')).toHaveCount(0)
})

test('com a IA do PC: soltar organiza sozinho, mostra onde ficou e Desfazer volta para a Caixa', async ({ page, errors }) => {
  void errors
  await at(page, '10:00')
  // simula a ponte do exe (window.amparaDesktop) sem gastar a assinatura
  await page.addInitScript(() => {
    const op = (o: Record<string, unknown>) => ({ tipo: null, trecho: null, ideia_id: null, assunto_id: null, assunto_ref: null, ref: null, area_id: null, nome: null, titulo: null, natureza: null, motivo: null, de_ideia: null, para_ideia: null, tipo_ligacao: null, resumo: null, estado: null, confianca: null, ...o })
    ;(window as unknown as { amparaDesktop: unknown }).amparaDesktop = {
      version: 'teste',
      status: async () => ({ claude: true, model: 'modelo-teste' }),
      runStructured: async (req: { input: string }) => {
        const { captura } = JSON.parse(req.input) as { captura: string }
        await new Promise((r) => setTimeout(r, 300))
        return {
          model: 'modelo-teste',
          json: { versao: 'organizador@1', operacoes: [
            op({ tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:estudos', nome: 'Idiomas' }),
            op({ tipo: 'CRIAR_IDEIA', trecho: captura, assunto_ref: 's', titulo: 'Aprender inglês', natureza: 'PLANO', confianca: 0.9 }),
          ] },
        }
      },
    }
  })
  await open(page)
  await goTab(page, 'ideias')
  await expect(page.getByTestId('idea-capture')).toContainText('A IA organiza em seguida')
  await page.getByTestId('idea-capture-input').fill('quero aprender inglês')
  await page.getByTestId('idea-capture-save').click()
  await expect(page.getByTestId('idea-organizing')).toBeVisible()
  await expect(page.getByText('Organizei em Estudos › Idiomas.')).toBeVisible()
  await page.getByTestId('ideas-view-esboco').click()
  await expect(page.getByTestId('ideas-outline').getByRole('button', { name: /Aprender inglês/ })).toBeVisible()
  // Desfazer: a ideia some e o pensamento volta para a Caixa, pronto para organizar de novo
  await page.getByRole('button', { name: 'Desfazer' }).first().click()
  await expect(page.getByTestId('ideas-outline').getByRole('button', { name: /Aprender inglês/ })).toHaveCount(0)
  await page.getByTestId('ideas-view-caixa').click()
  await expect(page.getByTestId('inbox-organize-ai')).toBeVisible()
  await page.getByTestId('inbox-organize-ai').click()
  await expect(page.getByText('Organizei em Estudos › Idiomas.')).toBeVisible()
})

test('IA fora do ar: o pensamento fica guardado e é organizado sozinho quando a IA volta', async ({ page, errors }) => {
  void errors
  await at(page, '10:00')
  await page.addInitScript(() => {
    const op = (o: Record<string, unknown>) => ({ tipo: null, trecho: null, ideia_id: null, assunto_id: null, assunto_ref: null, ref: null, area_id: null, nome: null, titulo: null, natureza: null, motivo: null, de_ideia: null, para_ideia: null, tipo_ligacao: null, resumo: null, estado: null, confianca: null, ...o })
    const w = window as unknown as { amparaDesktop: unknown; aiDown: boolean }
    w.aiDown = true
    w.amparaDesktop = {
      version: 'teste',
      status: async () => ({ claude: true, model: 'modelo-teste' }),
      runStructured: async (req: { input: string }) => {
        if (w.aiDown) throw new Error('A IA não respondeu.')
        const { captura } = JSON.parse(req.input) as { captura: string }
        return {
          model: 'modelo-teste',
          json: { versao: 'organizador@1', operacoes: [
            op({ tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:lazer', nome: 'Jardinagem' }),
            op({ tipo: 'CRIAR_IDEIA', trecho: captura, assunto_ref: 's', titulo: 'Plantar suculentas', natureza: 'PLANO', confianca: 0.9 }),
          ] },
        }
      },
    }
  })
  await open(page)
  await goTab(page, 'ideias')
  await page.getByTestId('idea-capture-input').fill('quero plantar suculentas na janela')
  await page.getByTestId('idea-capture-save').click()
  await expect(page.getByText('Está guardado, e eu organizo quando a IA voltar.')).toBeVisible()
  // a IA volta (PC ligado, internet de volta): o app tenta de novo sozinho
  await page.evaluate(() => {
    (window as unknown as { aiDown: boolean }).aiDown = false
    window.dispatchEvent(new Event('online'))
  })
  await expect(page.getByText('Organizei 1 pensamento que estava esperando.')).toBeVisible()
  await page.getByTestId('ideas-view-esboco').click()
  await expect(page.getByTestId('ideas-outline').getByRole('button', { name: /Plantar suculentas/ })).toBeVisible()
})

test('isso vai acontecer: a ideia vira tarefa com micro-passo, fica ligada e a tarefa mostra a origem', async ({ page, errors }, info) => {
  void errors
  await at(page, '10:00')
  await open(page)
  await goTab(page, 'ideias')
  await page.getByTestId('idea-capture-input').fill('quero voltar a correr de manhã')
  await page.getByTestId('idea-capture-save').click()
  await page.getByTestId('ideas-view-caixa').click()
  await page.getByTestId('inbox-organize').click()
  const org = page.getByTestId('sheet-organizeIdea')
  await org.getByTestId('organize-area-A:saude').click()
  await org.getByTestId('organize-topic-new').click()
  await org.getByLabel('Nome do assunto').fill('Corrida')
  await org.getByLabel('3. Nome da ideia').fill('Voltar a correr')
  await org.getByTestId('nature-PLANO').click()
  await org.getByTestId('organize-save').click()
  await expect(org).toBeHidden()

  await page.getByTestId('ideas-view-esboco').click()
  await page.getByTestId('ideas-outline').getByRole('button', { name: /Voltar a correr/ }).click()
  await page.getByTestId('idea-concretize').click()
  const sheet = page.getByTestId('sheet-concretize')
  await expect(sheet.getByLabel('O que fazer')).toHaveValue('Voltar a correr')
  await sheet.getByLabel('O que fazer').fill('Correr 20 minutos')
  await sheet.getByLabel('Passo 1').fill('Separar o tênis')
  await sheet.getByTestId('concretize-today').click()
  await noHorizontalOverflow(page)
  await shot(page, '74-ideias-concretizar', info.project.name)
  await sheet.getByTestId('concretize-save').click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('Virou tarefa: Correr 20 minutos')).toBeVisible()

  // a ideia continua, agora "Virou ação", com a tarefa ligada
  await page.getByTestId('ideas-show-todas').click()
  const row = page.getByTestId('ideas-outline').getByRole('button', { name: /Voltar a correr/ })
  await expect(row).toContainText('Virou ação')
  await row.click()
  const card = page.getByTestId('sheet-idea')
  await expect(card.getByTestId('idea-actions')).toContainText('Correr 20 minutos')
  await card.getByTestId('idea-actions').getByRole('button').first().click()
  const task = page.getByTestId('sheet-task')
  await expect(task.getByTestId('task-from-idea')).toContainText('Voltar a correr')
  await page.keyboard.press('Escape')

  // a tarefa está no Hoje
  await goTab(page, 'hoje')
  await expect(page.getByText('Correr 20 minutos').first()).toBeVisible()
})

test('isso vai acontecer com a IA do PC: a sugestão preenche a gaveta e a pessoa confirma', async ({ page, errors }) => {
  void errors
  await at(page, '10:00')
  await page.addInitScript(() => {
    ;(window as unknown as { amparaDesktop: unknown }).amparaDesktop = {
      version: 'teste',
      status: async () => ({ claude: true, model: 'modelo-teste' }),
      runStructured: async (req: { system: string; input: string }) => {
        await new Promise((r) => setTimeout(r, 200))
        if (req.system.includes('concretizar@1')) {
          return { model: 'm', json: { versao: 'concretizar@1', forma: 'COMPROMISSO', titulo: 'Corrida com o João', passos: [], esforco: null, quando: null, data: '2026-11-07', inicio: '07:00', fim: '07:45', motivo: 'Vocês combinaram dia e hora.' } }
        }
        const { captura } = JSON.parse(req.input) as { captura: string }
        const op = (o: Record<string, unknown>) => ({ tipo: null, trecho: null, ideia_id: null, assunto_id: null, assunto_ref: null, ref: null, area_id: null, nome: null, titulo: null, natureza: null, motivo: null, de_ideia: null, para_ideia: null, tipo_ligacao: null, resumo: null, estado: null, confianca: null, ...o })
        return { model: 'm', json: { versao: 'organizador@1', operacoes: [
          op({ tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:saude', nome: 'Corrida' }),
          op({ tipo: 'CRIAR_IDEIA', trecho: captura, assunto_ref: 's', titulo: 'Correr com o João', natureza: 'PLANO', confianca: 0.9 }),
        ] } }
      },
    }
  })
  await open(page)
  await goTab(page, 'ideias')
  await page.getByTestId('idea-capture-input').fill('combinei de correr com o João sábado às 7h')
  await page.getByTestId('idea-capture-save').click()
  await expect(page.getByText('Organizei em Saúde › Corrida.')).toBeVisible()
  await page.getByTestId('ideas-view-esboco').click()
  await page.getByTestId('ideas-outline').getByRole('button', { name: /Correr com o João/ }).click()
  await page.getByTestId('idea-concretize').click()
  const sheet = page.getByTestId('sheet-concretize')
  await expect(sheet.getByTestId('concretize-reason')).toContainText('Vocês combinaram dia e hora.')
  await expect(sheet.getByLabel('Compromisso')).toHaveValue('Corrida com o João')
  await expect(sheet.getByLabel('Início')).toHaveValue('07:00')
  await sheet.getByTestId('concretize-save').click()
  await expect(page.getByText('Virou compromisso: Corrida com o João')).toBeVisible()
})

test('perguntar às ideias: sem IA mostra as anotações; com a IA do PC responde citando e a fonte abre a ideia', async ({ page, errors }, info) => {
  void errors
  await at(page, '10:00')
  await page.addInitScript(() => {
    ;(window as unknown as { amparaDesktop: unknown }).amparaDesktop = {
      version: 'teste',
      status: async () => ({ claude: true, model: 'm' }),
      runStructured: async (req: { system: string; input: string }) => {
        if (req.system.includes('perguntar@1')) {
          const ids = (JSON.parse(req.input) as { anotacoes: { id: string }[] }).anotacoes.map((n) => n.id)
          return { model: 'm', json: { versao: 'perguntar@1', sem_resposta: false, frases: [
            { texto: 'Você quer voltar a correr de manhã.', fontes: [ids[0]] },
            { texto: 'Também quer nadar.', fontes: ['inventada'] },
          ] } }
        }
        const { captura } = JSON.parse(req.input) as { captura: string }
        const op = (o: Record<string, unknown>) => ({ tipo: null, trecho: null, ideia_id: null, assunto_id: null, assunto_ref: null, ref: null, area_id: null, nome: null, titulo: null, natureza: null, motivo: null, de_ideia: null, para_ideia: null, tipo_ligacao: null, resumo: null, estado: null, confianca: null, ...o })
        return { model: 'm', json: { versao: 'organizador@1', operacoes: [
          op({ tipo: 'CRIAR_ASSUNTO', ref: 's', area_id: 'A:saude', nome: 'Corrida' }),
          op({ tipo: 'CRIAR_IDEIA', trecho: captura, assunto_ref: 's', titulo: 'Voltar a correr', natureza: 'PLANO', confianca: 0.9 }),
        ] } }
      },
    }
  })
  await open(page)
  await goTab(page, 'ideias')
  await page.getByTestId('idea-capture-input').fill('quero voltar a correr de manhã')
  await page.getByTestId('idea-capture-save').click()
  await expect(page.getByText('Organizei em Saúde › Corrida.')).toBeVisible()

  await page.getByTestId('ideas-ask').click()
  const sheet = page.getByTestId('sheet-askIdeas')
  await sheet.getByTestId('ask-input').fill('o que eu falei sobre corrida?')
  await sheet.getByTestId('ask-submit').click()
  const answer = sheet.getByTestId('ask-answer')
  await expect(answer).toContainText('Você quer voltar a correr de manhã.')
  // citação inventada pela IA não vira fonte
  await expect(answer.getByTestId('ask-unsourced')).toHaveCount(1)
  await expect(sheet.getByTestId('ask-found')).toContainText('quero voltar a correr de manhã')
  await noHorizontalOverflow(page)
  await shot(page, '75-ideias-perguntar', info.project.name)
  await answer.getByTestId('ask-source').first().click()
  await expect(page.getByTestId('sheet-idea')).toBeVisible()
})

test('perguntar às ideias sem IA: só a busca, sem resposta inventada', async ({ page, errors }) => {
  void errors
  await at(page, '10:00')
  await open(page)
  await goTab(page, 'ideias')
  await page.getByTestId('idea-capture-input').fill('tenho medo de não pagar o cartão')
  await page.getByTestId('idea-capture-save').click()
  await page.getByTestId('ideas-ask').click()
  const sheet = page.getByTestId('sheet-askIdeas')
  await expect(sheet).toContainText('Sem IA neste aparelho')
  await sheet.getByTestId('ask-input').fill('o que falei do cartão?')
  await sheet.getByTestId('ask-submit').click()
  await expect(sheet.getByTestId('ask-found')).toContainText('tenho medo de não pagar o cartão')
  await expect(sheet.getByTestId('ask-answer')).toHaveCount(0)
  await sheet.getByTestId('ask-input').fill('xadrez')
  await sheet.getByTestId('ask-submit').click()
  await expect(sheet.getByText('Nada encontrado nas suas anotações.')).toBeVisible()
})

