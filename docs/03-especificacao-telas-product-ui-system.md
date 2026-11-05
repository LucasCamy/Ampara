# 03. Especificação de Telas e Design System (`product-ui-system` + `ARQ-E` + `ARQ-D`)

Esta especificação aplica rigorosamente as regras de [`product-ui-system.md`](file:///C:/Users/Lucas/.gemini/config/skills/frontend-figma-playwright/references/product-ui-system.md), combinadas com os padrões estruturais de [`saude-fisioterapia-odonto.md`](file:///C:/Users/Lucas/.gemini/config/skills/frontend-figma-playwright/pipeline-midia/exemplos-prontos/saude-fisioterapia-odonto.md) (`ARQ-E`) e a ergonomia de ação rápida de [`loja-roupa-sacola-whatsapp.md`](file:///C:/Users/Lucas/.gemini/config/skills/frontend-figma-playwright/pipeline-midia/exemplos-prontos/loja-roupa-sacola-whatsapp.md) (`ARQ-D`).

---

## 1. Direção Criativa do Produto ("Creative North Star")

- **Metáfora Funcional do Domínio:** **"Painel de Aterrissagem Calma & Livro-Razão Vivo do Casal"**.
  - Na rotina e TDAH: funciona como um **painel de cabine silencioso**, onde o que precisa ser feito **agora** tem destaque absoluto sobre o passado ou o mês que vem.
  - Nas finanças e contas da casa: funciona como um **livro-razão vivo**, onde o dinheiro/compromisso **realizado/pago/tomado** usa **traço sólido e peso firme**, enquanto tudo o que é **previsto/pendente/agendado** usa **borda tracejada (`dashed`) e superfície leve**.
- **Fusão dos Arquétipos da Pasta `pipeline-midia`:**
  - **Do `ARQ-E` (Saúde):** Grandes módulos arredondados (`rounded-[28px]`), **títulos bicolores na mesma frase** (ancorando a atenção imediata do TDAH nas primeiras palavras), **Dock Flutuante Inferior** e **Triagem Rápida em 3 passos**.
  - **Do `ARQ-D` (Boutique):** Temperatura humana e acolhedora (fugindo de hospital ou planilha bancária fria), **Quick-Action direto no card** e **`Toast` imediato com botão `[Desfazer]`**.

---

## 2. Sistema de Tokens (`tokens.css`) e Tabela de Contraste WCAG AA

Proibido usar cores soltas ou classes genéricas (`blue-500`, `green-500`, `gray-200`). Todos os componentes consomem tokens semânticos com suporte nativo a **Tema Claro (Calma Diurna)** e **Tema Escuro (Conforto Noturno TDAH)**:

### Definição dos Tokens de Cor

| Token Semântico | Tema Claro (`Calma Orgânica`) | Tema Escuro (`Noite Serena`) | Função na Interface |
|---|---|---|---|
| `--bg` | `#F7F6F2` *(Linho calmo)* | `#0A0F1D` *(Azul-noturno ARQ-E)* | Fundo geral da tela (zero branco estourado que cansa a vista) |
| `--surface` | `#FFFFFF` *(Puro elevado)* | `#131B2E` *(Slate noturno)* | Cards principais, sheets e módulos arredondados (`rounded-[28px]`) |
| `--subtle` | `#EEF1F6` *(Gelo clínico ARQ-E)* | `#1C2740` *(Agrupamento suave)* | Chips inativos, blocos secundários e trilhos de abas |
| `--selected` | `#E3ECE8` *(Sálvia suave)* | `#1E352F` *(Sálvia noturno)* | Item selecionado, filtro ativo (`Meu` / `Dela` / `Nós`) |
| `--ink` | `#0F172A` *(Slate profundo)* | `#F1F5F9` *(Alabastro claro)* | Texto primário, valores-âncora e parte forte dos títulos bicolores |
| `--muted` | `#526077` *(Cinza clínico AA)* | `#94A3B8` *(Cinza sereno AA)* | Texto secundário, legendas e segunda metade dos títulos bicolores |
| `--line` | `rgba(15, 23, 42, 0.10)` | `rgba(241, 245, 249, 0.12)` | Divisórias de `1px` (sólidas para confirmado, `dashed` para previsto) |
| `--action` | `#25634B` *(Sálvia profundo)* | `#4ADE80` *(Menta luminosa)* | **Único acento de ação primária** (botões principais, links, foco) |
| `--on-action` | `#FFFFFF` | `#062819` | Texto/ícone sobre o botão `--action` |
| `--partner-a` | `#2B5B84` *(Azul Oceano)* | `#7DD3FC` | Identificador visual sutil do **Parceiro A (`Meu`)** |
| `--partner-b` | `#9E4730` *(Terracota ARQ-D)* | `#FDA4AF` | Identificador visual sutil da **Parceira B (`Dela`)** |
| `--couple` | `#5B4B8A` *(Índigo Acolhedor)* | `#C4B5FD` | Identificador visual do escopo **`Nós (Casal)`** |
| `--state-ok` | `#1E6B45` *(Verde confirmado)* | `#4ADE80` | Estado **Realizado / Tomado / Pago** (sempre com `CircleCheck`) |
| `--state-warn` | `#9A5B13` *(Âmbar atenção)* | `#FBBF24` | Estado **Pendente / Snooze Água / Previsto** (sempre com `CircleDashed`) |
| `--state-err` | `#B42318` *(Vermelho alerta)* | `#F87171` | Estado **Atrasado / Erro / SOS** (sempre com `SquareX` ou `LifeBuoy`) |

### Tabela de Contraste WCAG AA Calculado (Mínimo exigido: `4,5:1`)

| Par de Contraste (Texto sobre Superfície) | Razão no Tema Claro | Razão no Tema Escuro | Status WCAG |
|---|---|---|---|
| `--ink` sobre `--bg` | `16.4 : 1` | `16.8 : 1` | **AAA Aprovado** |
| `--ink` sobre `--surface` | `17.8 : 1` | `13.9 : 1` | **AAA Aprovado** |
| `--ink` sobre `--selected` | `14.6 : 1` | `11.2 : 1` | **AAA Aprovado** |
| `--muted` sobre `--bg` | `5.7 : 1` | `6.8 : 1` | **AA Aprovado (≥ 4,5:1)** |
| `--muted` sobre `--surface` | `6.2 : 1` | `5.6 : 1` | **AA Aprovado (≥ 4,5:1)** |
| `--muted` sobre `--subtle` | `5.4 : 1` | `4.7 : 1` | **AA Aprovado (≥ 4,5:1)** |
| `--on-action` sobre `--action` | `7.1 : 1` | `10.4 : 1` | **AAA Aprovado** |
| `--state-ok` sobre `--surface` | `6.5 : 1` | `8.9 : 1` | **AA/AAA Aprovado** |
| `--state-warn` sobre `--surface` | `5.1 : 1` | `9.4 : 1` | **AA/AAA Aprovado** |
| `--state-err` sobre `--surface` | `6.1 : 1` | `6.3 : 1` | **AA Aprovado** |

---

## 3. Tipografia Tripla, Estados e Microinterações (`product-ui-system`)

### Tipografia Tripla
1. **Display / Cabeçalhos Bicolores (`Plus Jakarta Sans` ou `Fraunces` — SemiBold/Bold):**
   - Usa a assinatura bicolor do `ARQ-E`: a ação principal vem em `--ink` e o contexto em `--muted`.
   - Exemplo: **`"Para agora,"`** (`--ink`) + **`"uma coisa de cada vez."`** (`--muted`).
2. **Interface e Leitura (`Plus Jakarta Sans` — Regular/Medium):**
   - Inputs sempre `≥ 16px` (impede zoom forçado no iOS), labels claras acima dos campos, alvos de toque `≥ 48px`.
3. **Dados e Números (`JetBrains Mono` ou `tabular-nums` obrigatório):**
   - Todo valor monetário, horário de remédio, contador de estoque ou saldo entre o casal usa `font-variant-numeric: tabular-nums`.
   - **Regra dos Números Nunca Mudos:** NUNCA exibir apenas `R$ 240,00`. Exibir sempre **`R$ 240,00 · Parte sua no mercado de hoje`**.

### Regra Semântica: `Estado = Forma (Ícone) + Texto + Cor + Traço`
- **Confirmado / Pago / Remédio Tomado:** Ícone `CircleCheck` + Rótulo `"Tomado às 09:04"` ou `"Pago"` + `--state-ok` + **Borda contínua sólida (`1px solid`)**.
- **Previsto / Pendente / Snooze (+5m):** Ícone `CircleDashed` ou `Clock` + Rótulo `"Previsto p/ dia 10"` ou `"Aguardando 5 min"` + `--state-warn` + **Borda tracejada (`1px dashed`)**.
- **Atrasado / Precisa de Ajuda:** Ícone `SquareX` ou `HeartHandshake` + Rótulo `"Atrasado há 35 min"` + `--state-err` + fundo suave de destaque.

### Motion de Produto (Anti-Flick & Fluidez)
- **Troca de Abas e Chips (`Meu` | `Dela` | `Nós`):** Troca de estado ativo em **`0ms` (instantânea)** para zero efeito de piscar.
- **Pressão Tátil:** Qualquer card ou botão responde ao toque com `transform: scale(0.97)` em `120ms cubic-bezier(0.22, 1, 0.36, 1)`.
- **Gavetas (`Sheets`):** Entram em `260ms` e saem em `170ms` animando apenas `transform: translateY(...)` no compositor nativo (conforme [`fluidez-e-revelacao.md`](file:///C:/Users/Lucas/.gemini/config/skills/frontend-figma-playwright/references/fluidez-e-revelacao.md)).

---

## 4. Inventário Completo e Especificação das 10 Telas/Sheets

### Tela `T01` — Onboarding & Pareamento do Casal
- **Objetivo:** Conectar as contas dos dois parceiros com atrito zero e configurar a regra padrão de divisão financeira e privacidade inicial.
- **Usuário:** Ambos (no primeiro acesso).
- **Conteúdo e Componentes:**
  - Boas-vindas com título bicolor: **"Bem-vindos ao Nós."** + *"Menos peso mental, mais parceria."*
  - Card de convite com **Código de 6 dígitos** (`font-data`), **QR Code** e botão **"Enviar convite no WhatsApp do meu amor"**.
  - Configuração rápida em 2 passos:
    1. *Como vocês costumam dividir os gastos da casa?* (`50% / 50%` | `Proporcional à renda` | `Decidir a cada gasto`).
    2. *Querem deixar a aba de gastos pessoais visível um para o outro?* (`Ativado — podemos mudar quando quiser` | `Desativado — só gastos do casal visíveis`).
- **Critérios de Aceite:** Pareamento concluído em tempo real via Supabase Realtime; funciona mesmo se o segundo parceiro aceitar horas depois.

---

### Tela `T02` — Aba 1: `HOJE` (Painel de Aterrissagem Calma — Home)
- **Objetivo:** Responder em 1 segundo o que precisa ser feito **agora**, mostrar o estado de energia do casal e evitar sobrecarga visual.
- **Usuário:** Ambos (uso diário contínuo).
- **Wireframe Estrutural:**
  ```text
  ┌──────────────────────────────────────────────────────────┐
  │ Bom dia, Lucas                    [🔋 Minha Energia: ⚡] │
  │ Par: 🔋 Ela está com bateria cheia hoje         [⚙️]     │
  ├──────────────────────────────────────────────────────────┤
  │ ╭─ AGORA · PRÓXIMA AÇÃO (rounded-[28px] surface) ──────╮ │
  │ │ 💊 09:00 · Venvanse 30mg (Restam 12 na caixa)        │ │
  │ │ [ ✓ Já engoli ]   [ ⏳ Pegando água +5m ]            │ │
  │ ╰──────────────────────────────────────────────────────╯ │
  │                                                          │
  │ ╭─ 💌 PEDIDO DE APOIO DELA (se houver) ────────────────╮ │
  │ │ "Amor, travei para ligar na imobiliária. Assume?"    │ │
  │ │ [ ❤️ Deixa comigo ]        [ 🤝 Fazemos juntos 18h ] │ │
  │ ╰──────────────────────────────────────────────────────╯ │
  │                                                          │
  │ FOCO DO DIA (Máx. 3 prioridades)     [Meu] [Dela] [Nós]  │
  │ ┌──────────────────────────────────────────────────────┐ │
  │ │ ○ Comprar ração do gato          [Nós · ⚡ 15m] [🆘] │ │
  │ │ - - - - - - - - - - - - - - - - - - - - - - - - - -  │ │
  │ │ ◌ Pagar internet (Previsto R$ 120,00 · Hoje)   [Pag] │ │
  │ └──────────────────────────────────────────────────────┘ │
  │                                                          │
  │ ╭─ DOCK FLUTUANTE DE CAPTURA RÁPIDA (ARQ-E) ───────────╮ │
  │ │  [ + Tarefa ]  [ + Gasto ]  [ ✓ Remédio ]  [ 🆘 ]    │ │
  │ ╰──────────────────────────────────────────────────────╯ │
  │   [ ☀️ Hoje ]    [ 📅 Agenda ]   [ 💊 Rotina ]  [ 💳 R$ ] │
  └──────────────────────────────────────────────────────────┘
  ```
- **Estados:**
  - *Modo Normal (`100%` / `50%`):* Exibe Próxima Ação + Pedidos de Apoio + até 3 tarefas-foco + resumo das próximas 4 horas.
  - *Modo Sobrecarga (`10%`):* Oculta a lista secundária, amplia o card de **1 única ação** e destaca o botão **`🆘 Pedir Ajuda ao Amor`**.
- **Critérios de Aceite:** Concluir remédio ou tarefa direto no card dispara `Toast` com `[Desfazer]` e atualiza o próximo item instantaneamente.

---

### Tela `T03` — Aba 2: `AGENDA & TAREFAS` (Visão Dia · Semana · Mês)
- **Objetivo:** Visualizar compromissos e demandas no tempo sem misturar bagunça pessoal com agenda compartilhada.
- **Conteúdo e Componentes:**
  - **Seletor Temporal Superior (Anti-Flick):** `[ Dia ]` | `[ Semana ]` | `[ Mês ]` + `[ Caixa de Entrada (Sem Data) ]`.
  - **Filtro de Escopo:** `[ Todos ]` | `[ Meu (Azul) ]` | `[ Dela (Terracota) ]` | `[ Nós (Índigo) ]`.
  - **Visão Dia:** Linha do tempo horária (`08:00` às `22:00`) mostrando blocos de tempo + tarefas sem horário fixo no topo.
  - **Visão Semana:** 7 colunas compactas ou lista empilhada de 7 dias com indicadores geométricos de carga do dia (leve, moderado, cheio — ajudando o casal a não marcar 5 coisas pesadas no mesmo sábado).
  - **Visão Mês:** Grade mensal com pontos diferenciados por forma/cor (`●` Evento do Casal, `▲` Conta que vence, `■` Consulta médica) + lista do dia selecionado logo abaixo.
- **Ações Primárias:** Marcar concluído, arrastar para amanhã (`Adiar 1 dia`), delegar/enviar para o parceiro (`💌 Enviar ao par`).

---

### Tela `T04` — Aba 3: `REMÉDIOS & ROTINAS` (Alarmes Recorrentes e Estoque)
- **Objetivo:** Garantir adesão a medicamentos contínuos (TDAH, anticoncepcional, vitaminas, remédios do pet) e rotinas domésticas recorrentes.
- **Conteúdo e Componentes:**
  - **Seção "Medicamentos de Hoje":** Cards grandes com horário (`tabular-nums`), dosagem, status claro (`CircleCheck` Tomado às 09:02 vs. `CircleDashed` Aguardando 14:00) e contador de estoque (`"Restam 6 comprimidos · Dura até sexta"`).
  - **Toggle por Medicamento (`Rede de Apoio do Par`):** Chave `"Avisar meu amor se eu atrasar mais de 30 min"`.
  - **Seção "Rotinas da Casa & Hábitos":** Lembretes recorrentes (ex.: *Tirar o lixo Seg/Qua/Sex às 20h*, *Dar remédio do pet*), indicando quem fez pela última vez (*"Última vez: Dela na quarta-feira"*).
- **Critérios de Aceite:** Quando o estoque chega ao limite configurado (ex.: ≤ 5 unidades), cria automaticamente uma tarefa sugerida: *"Comprar [Nome do Remédio] / Pedir receita"*.

---

### Tela `T05` — Aba 4: `FINANÇAS` (`Meu` · `Dela` · `Nós` + Encontro de Contas)
- **Objetivo:** Mostrar em 1 segundo como está o saldo entre o casal, separar o que é individual do que é conjunto e permitir ligar/desligar a transparência mútua.
- **Wireframe Estrutural:**
  ```text
  ┌──────────────────────────────────────────────────────────┐
  │ Finanças de Novembro           [ 👁️ Ver um do outro: ON ]│
  │ [ 🤝 Do Casal (Nós) ]     [ 👤 Meu ]     [ 👩 Dela ]     │
  ├──────────────────────────────────────────────────────────┤
  │ ╭─ BALANÇO DO CASAL · ENCONTRO DE CONTAS ──────────────╮ │
  │ │ Saldo atual de acerto:                               │ │
  │ │ Lucas recebe R$ 145,00 de [Nome] neste mês           │ │
  │ │ ──────────────────────────────────────────────────── │ │
  │ │ Gasto Realizado (Sólido): R$ 1.840,00                │ │
  │ │ Previsto até dia 30 (Tracejado): + R$ 620,00         │ │
  │ │ [ ✓ Registrar Acerto / Quitar Saldo ]                │ │
  │ ╰──────────────────────────────────────────────────────╯ │
  │                                                          │
  │ LANÇAMENTOS DO CASAL (Divisão padrão: 50% / 50%)         │
  │ ┌──────────────────────────────────────────────────────┐ │
  │ │ ✓ 🛒 Supermercado (Pago por Lucas)      R$ 290,00    │ │
  │ │   Divisão 50/50 · Parte dela: R$ 145,00 (Sólido)     │ │
  │ ├ - - - - - - - - - - - - - - - - - - - - - - - - - - -┤ │
  │ │ ◌ ⚡ Conta de Luz (Vence dia 15)         R$ 180,00    │ │
  │ │   Previsto (Borda Tracejada) · [ Marcar como Pago ]  │ │
  │ └──────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────┘
  ```
- **Comportamento das 3 Sub-Abas Financeiras:**
  1. **`[ Do Casal (Nós) ]`:** Sempre visível para ambos. Mostra o **Card de Encontro de Contas**, os gastos realizados (traço sólido) e as contas fixas previstas (traço pontilhado).
  2. **`[ Meu ]`:** Seus ganhos, gastos individuais e seu **"Saldo Livre para Gastar Sem Culpa"**. Possui no topo o toggle **`👁️ Permitir que meu amor veja minha aba: [ ON / OFF ]`**.
  3. **`[ Dela ]`:**
     - Se ela deixou o toggle dela em **`ON`**: você visualiza os lançamentos pessoais dela em modo leitura (exceto qualquer item que ela tenha marcado como `🔒 Presente/Surpresa`, que fica oculto).
     - Se ela deixou o toggle dela em **`OFF`**: exibe um card elegante e respeitoso informando que a visão pessoal está privada no momento.

---

### Gaveta `S01` — Sheet de Captura Rápida de Tarefa / Lembrete
- **Objetivo:** Criar tarefa pessoal, compartilhada ou enviar demanda para o parceiro em `< 3 segundos`.
- **Componentes:** Input de texto único + 3 chips de destino (`Meu`, `Nós`, `Enviar p/ Amor`) + 3 chips de data (`Hoje`, `Amanhã`, `Definir data/alarme`) + botão `Salvar`.

### Gaveta `S02` — Sheet de Registro Rápido de Gasto
- **Objetivo:** Anotar uma despesa na fila do caixa antes de guardar o celular no bolso.
- **Componentes:**
  - Teclado numérico grande em `tabular-nums` (`R$ 0,00`).
  - Seletor principal: **`[ 🤝 Do Casal ]`** vs. **`[ 👤 Só Meu ]`**.
  - Se `Do Casal`: chips **`Quem pagou? [Eu | Ela]`** e **`Divisão: [Padrão 50/50 | Proporcional | 100% p/ Ela]`**.
  - Se `Só Meu` (e a transparência mútua estiver ligada): checkbox discreto **`[ 🔒 É presente / surpresa (ocultar do par) ]`**.
  - 6 chips de categoria com ícone Phosphor/Lucide (`Mercado`, `Comida/Delivery`, `Casa/Contas`, `Farmácia/Saúde`, `Transporte`, `Lazer`).

### Gaveta `S03` — Sheet / Card de Confirmação de Remédio
- **Objetivo:** Resolver o disparo do alarme sem permitir esquecimento pós-alarme.
- **Ações Primárias (Alvos de `56px` de altura):**
  1. **`✓ Já engoli agora`** (marca concluído com timestamp exato e desconta 1 unidade do estoque).
  2. **`⏳ Pegando água — tocar de novo em 5 min`** (cria alarme local de alta prioridade daqui a 5 minutos).
  3. **`⏭️ Pular dose de hoje`** (pede motivo opcional em 1 clique: *Esqueci / Acabou o remédio / Orientação médica*).

### Modal `S04` — Triagem Rápida de Pedido de Ajuda ("SOS Casal" — `ARQ-E`)
- **Objetivo:** Pedir socorro executivo ao parceiro em 3 toques sem precisar explicar tudo por mensagem.
- **Passos (1 tela compacta):**
  1. **Qual tarefa ou situação?** (Escolhe item do dia ou *"Rotina geral / Cabeça travada"*).
  2. **O que você precisa?** (`🏃 Que você assuma isso por mim` | `🤝 Fazer junto comigo (Body Doubling)` | `🔔 Me cobrar com carinho mais tarde`).
  3. **Para quando?** (`Agora` | `Até a noite` | `Sem pressa`).

### Tela `T06` — Ajustes do Casal, Privacidade e Atalhos do iPhone
- **Objetivo:** Gerenciar o pareamento, a proporção financeira padrão, as chaves de privacidade e instalar os Atalhos do iOS em 1 toque.
- **Conteúdo:**
  - **Bloco Privacidade Financeira:** Toggle `"Deixar meus gastos pessoais visíveis para meu par"` + status atual do parceiro.
  - **Bloco Regra de Divisão do Casal:** `50% / 50%` ou slider de proporção (ex.: `60% / 40%`).
  - **Bloco Galeria de Atalhos do iPhone:** 4 botões `"Adicionar aos Atalhos do iOS"` (links `shortcuts://...` prontos para instalar no iPhone de cada um).
