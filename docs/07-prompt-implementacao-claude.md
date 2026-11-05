# 07. Prompt Pronto para Implementar o App “Nós” no Claude Code

> **Como usar:** Copie o bloco Markdown abaixo e cole diretamente no **Claude Code** dentro da pasta `d:/Projetos/Ampara`. Ele já referencia todas as skills do seu ambiente (`C:/Users/Lucas/.gemini/config/skills/...`) e toda a documentação técnica/funcional gerada em `d:/Projetos/Ampara/docs/`.

---

```markdown
Leia obrigatoriamente antes de iniciar:
1. As skills do kit:
   - C:/Users/Lucas/.gemini/config/skills/project-workflow/SKILL.md
   - C:/Users/Lucas/.gemini/config/skills/frontend-figma-playwright/SKILL.md
   - C:/Users/Lucas/.gemini/config/skills/frontend-figma-playwright/references/product-ui-system.md
   - C:/Users/Lucas/.gemini/config/skills/frontend-figma-playwright/references/fluidez-e-revelacao.md
   - C:/Users/Lucas/.gemini/config/skills/project-workflow/references/validation.md
2. A especificação completa do projeto já documentada nesta pasta:
   - d:/Projetos/Ampara/docs/01-prd-escopo-moscow.md
   - d:/Projetos/Ampara/docs/02-ux-fluxos-navegacao.md
   - d:/Projetos/Ampara/docs/03-especificacao-telas-product-ui-system.md
   - d:/Projetos/Ampara/docs/04-arquitetura-dados-ios-offline.md
   - d:/Projetos/Ampara/docs/05-modelo-financeiro-privacidade.md
   - d:/Projetos/Ampara/docs/06-backlog-roadmap-execucao.md

(Opcional, se ainda não instaladas no projeto):
npx skills add https://github.com/Leonxlnx/taste-skill
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
npx skills add https://github.com/kylezantos/design-motion-principles
npx skills@latest add emilkowalski/skills

Quero que você atue simultaneamente como diretor de criação digital, designer de produto e UI/UX especialista em neurodivergência/TDAH, engenheiro de software sênior (React 19 + TypeScript strict + Tailwind CSS v4 + Motion + Offline-First Storage), especialista em acessibilidade/performance (60fps no compositor) e revisor visual extremamente crítico.

## CONTEXTO E DIREÇÃO CRIATIVA ("CREATIVE NORTH STAR")
- **Produto e Objetivo:** Criar a aplicação completa **“Nós”** — um app mobile-first e offline-first para um casal organizar a vida a dois com foco em **TDAH** (redução de sobrecarga cognitiva, co-regulação gentil do casal, captura rápida em menos de 3 segundos e finanças transparentes com privacidade ajustável).
- **Metáfora Funcional (*Creative North Star*):** **"Painel de Aterrissagem Calma & Livro-Razão Vivo do Casal"**.
- **Princípio de Hierarquia:** **A próxima ação vem sempre antes do histórico e das métricas.**
- **Fusão Visual (`product-ui-system.md` + `ARQ-E` + `ARQ-D`):**
  - Do `ARQ-E` (Saúde): grandes containers arredondados (`rounded-[28px]`), títulos bicolores na mesma frase (âncora da ação em `--ink` + complemento suave em `--muted`), **Dock Flutuante Fixo no Rodapé** para captura rápida em 1 toque e **Modal de Triagem Rápida em 3 cliques** para o Pedido de Ajuda.
  - Do `ARQ-D` (Boutique): temperatura orgânica e acolhedora (`--bg: #F7F6F2` no claro e `#0A0F1D` no escuro), ações rápidas direto no card (`Quick-Action`) sem abrir subtelas desnecessárias e `Toast` imediato no topo com botão **`[Desfazer]`** de 5 segundos.
- **Stack de Execução e Validação:**
  - React 19 + TypeScript (`strict: true`) + Vite + Tailwind CSS v4 + `Motion` (`motion/react`) + `Lucide React` + `@fontsource/plus-jakarta-sans` e `@fontsource/jetbrains-mono`.
  - Persistência *Offline-First* local completa (IndexedDB / LocalStorage estruturado com fila `sync_outbox`, simulação de pareamento e alternância instantânea de visão entre **Parceiro A (Lucas)** e **Parceira B (Namorada)** para testar e usar todos os fluxos bilaterais de casal na prática, além de camada de sincronização pronta para Supabase).
  - Suporte a PWA iOS (`manifest.webmanifest`, meta tags `apple-mobile-web-app-capable`) e rotas de **Atalhos Rápidos do iPhone (`iOS Shortcuts`)** via query/deep-link (`/?quick=task`, `/?quick=expense`, `/?quick=med`, `/?quick=sos`).
- **Figma:** Caso o Figma MCP não esteja conectado nesta sessão, fica autorizado documentar em `DESIGN.md` + `src/styles/tokens.css` + `/styleguide.html` e seguir direto para o código.

---

## ETAPAS OBRIGATÓRIAS DE EXECUÇÃO (SEM PARAR EM DECISÕES RAZOÁVEIS)

### 1. ETAPA 1 — INSPEÇÃO E GOVERNANÇA (`AGENTS.md`, `DESIGN.md`, `IMPLEMENTATION_PLAN.md`)
- Leia os 6 documentos em `docs/` e crie `AGENTS.md`, `DESIGN.md` e `IMPLEMENTATION_PLAN.md` na raiz do projeto.

### 2. ETAPA 2 — `src/styles/tokens.css` E SISTEMA VISUAL (`product-ui-system.md`)
- Implemente exatamente os tokens definidos em `docs/03-especificacao-telas-product-ui-system.md` (Tema Claro `Calma Orgânica` e Tema Escuro `Noite Serena` `#0A0F1D`):
  - **Zero hex solto** e **zero cor default do Tailwind** (`blue-500`, `emerald-500`, `gray-100`, `red-500`) nos componentes.
  - Um único acento primário de ação (`--action`). Verde (`--state-ok`), âmbar (`--state-warn`) e vermelho (`--state-err`) exclusivos para estados semânticos.
  - **Estado = Forma (ícone) + Texto + Cor + Traço:**
    - *Confirmado / Pago / Remédio Tomado:* `CircleCheck` + rótulo explícito + `--state-ok` + **borda sólida (`1px solid`)**.
    - *Previsto / Pendente / Snooze (+5m):* `CircleDashed` ou `Clock` + rótulo explícito + `--state-warn` + **borda tracejada (`1px dashed`)**.
    - *Atrasado / SOS:* `SquareX` ou `HeartHandshake` + rótulo + `--state-err`.
  - **Tipografia Tripla + `font-data` (`tabular-nums`):** Todos os valores em R$, horários, contadores de comprimidos e proporções usam `tabular-nums` e nunca aparecem mudos (sempre acompanhados de unidade, pessoa e janela de tempo).

### 3. ETAPA 3 — IMPLEMENTAÇÃO COMPLETA DAS TELAS, GAVETAS E MOTOR DE REGRAS
Implemente todas as telas e fluxos especificados em `docs/02-ux-fluxos-navegacao.md`, `docs/03-especificacao-telas-product-ui-system.md` e `docs/05-modelo-financeiro-privacidade.md`:

1. **Barra Superior de Contexto do Casal + Seletor de Perspectiva (`[Visão: Eu (Lucas) ⇄ Visão: Ela]`):**
   - Permite alternar em 1 clique qual dos dois parceiros está usando o app no momento (para validar imediatamente o que aparece ou fica oculto para o outro!), além do toggle de Tema (`Claro / Escuro`), status `Offline / Sincronizado (Fila Outbox)` e seletor de **Bateria Mental (`🔋 100% Cheia` | `⚡ 50% Média` | `🪫 10% Modo Sobrecarga`)**.
2. **Aba 1 — `HOJE` (`T02` — Painel de Aterrissagem Calma):**
   - **Card Principal "Agora / Próxima Ação":** destaca o remédio do turno atual, o compromisso imediato ou o Pedido de Apoio enviado pelo parceiro.
   - **Comportamento do Modo Sobrecarga (`🪫 10%`):** quando ativado, recolhe todas as tarefas secundárias para uma gaveta *"Pode esperar"* e exibe apenas 1 única ação essencial + o botão de pedir ajuda ao par.
   - **Pedidos de Apoio do Par:** card acolhedor quando o parceiro pede ajuda, com botões de resposta em 1 toque (`❤️ Deixa comigo (Assumir)` ou `🤝 Vamos fazer juntos (Body Doubling)`).
   - **Foco do Dia (Tarefas e Contas de Hoje):** filtro rápido instantâneo (`Todos | Meu | Dela | Nós`), conclusão em 1 toque com `Toast` + `[Desfazer]`.
3. **Aba 2 — `AGENDA & TAREFAS` (`T03` — Visão `Dia` · `Semana` · `Mês` · `Caixa de Entrada`):**
   - **Visão Dia:** linha do tempo horária + demandas do dia.
   - **Visão Semana:** 7 dias com indicador geométrico de carga cognitiva do dia (Leve, Moderada, Alta) e botão rápido `"Adiar para amanhã"` ou `"💌 Enviar para meu amor"`.
   - **Visão Mês:** calendário mensal diferenciando por forma + cor (`●` Compromisso do Casal, `▲` Conta que vence, `■` Saúde/Remédio) e lista detalhada do dia selecionado abaixo.
4. **Aba 3 — `REMÉDIOS & ROTINAS` (`T04` — Anti-Cegueira de Alarme):**
   - Lista de medicamentos e rotinas recorrentes com horário (`tabular-nums`), dosagem e contador de estoque da caixa (com alerta automático quando restarem `<= 5` comprimidos).
   - **Confirmação em 2 Estágios (Anti-Esquecimento TDAH):**
     - Botão **`✓ Já engoli`** (registra horário exato, muda borda para sólida e desconta `-1` do estoque).
     - Botão **`⏳ Pegando água (+5 min)`** (inicia contador regressivo visível de 5 minutos e estado `SNOOZED_WATER` tracejado para não deixar esquecer).
   - **Toggle "Rede de Apoio do Par (+30 min)":** opção individual por remédio (`notify_partner_on_delay`). Se ativada e o remédio atrasar mais de 30 min, exibe o alerta empático na visão do parceiro com botão `"Mandar lembrete carinhoso 💧"`.
5. **Aba 4 — `FINANÇAS` (`T05` — `Do Casal (Nós)` · `Meu` · `Dela` + Encontro de Contas):**
   - **Sub-aba `🤝 Do Casal (Nós)`:**
     - **Card de Encontro de Contas (Saldo Líquido em Centavos):** mostra em linguagem humana quem deve quanto a quem neste mês (ex.: *"Ela transfere R$ 110,00 para Lucas para zerar o mês"*), separando **Realizado/Pago (traço sólido)** de **Previsto/Contas Fixas (traço tracejado)**, com botão **`[ ✓ Registrar Acerto / Quitar Saldo ]`**.
     - Lista de despesas compartilhadas mostrando quem pagou, regra de divisão aplicada (`50/50`, `Proporcional à renda 60/40`, `100% adiantado para o par`) e quanto coube a cada um.
   - **Sub-abas `👤 Meu` e `👩 Dela` com a Chave de Transparência ("Ver um do outro"):**
     - Inclua o toggle interativo **`👁️ Permitir que meu par veja meus gastos pessoais: [ Ativado / Desativado ]`**.
     - **Regra 1:** Quando **Desativado** pelo dono da aba, ao alternar para a visão do parceiro, a aba pessoal exibe o estado privado respeitoso (*"Visão pessoal fechada no momento. Os gastos do casal seguem visíveis na aba Nós."*).
     - **Regra 2:** Quando **Ativado**, o parceiro consegue ver os gastos pessoais em modo **somente leitura**, **EXCETO** os lançamentos marcados com a flag **`🎁 Presente / Surpresa (`is_secret_gift`)`**, cuja descrição e item ficam ocultos para não estragar surpresas!
6. **Aba/Tela `AJUSTES & ATALHOS DO IPHONE` (`T06`):**
   - Configuração da proporção financeira padrão do casal (`50/50` ou personalizada, ex.: `60/40`).
   - Painel de Privacidade Financeira dos dois parceiros.
   - **Galeria dos 4 Atalhos Rápidos do iPhone (`iOS Shortcuts`):** instruções + botões de teste imediato para as 4 URLs rápidas (`?quick=task`, `?quick=expense`, `?quick=med`, `?quick=sos`).
7. **Dock Flutuante Inferior (`ARQ-E`) + As 4 Gavetas Rápidas (`S01` a `S04`):**
   - `S01 (+ Tarefa Rápida)`: título, destino (`Meu | Nós | Enviar p/ Amor`), momento (`Hoje | Amanhã | Caixa de Entrada`) e esforço (`⚡ 5m | 🧠 Foco`).
   - `S02 (+ Registrar Gasto)`: valor em centavos, descrição, categoria, escopo (`Do Casal` com pagador e regra de divisão **ou** `Só Meu` com opção `🎁 Presente / Surpresa`) e status (`Pago Sólido` vs. `Previsto Tracejado`).
   - `S03 (✓ Confirmar Remédio)`: escolha rápida entre `✓ Já engoli`, `⏳ Pegando água (+5 min)` e `⏭️ Pular dose`.
   - `S04 (🆘 Pedir Ajuda em 3 Cliques)`: 1. Qual tarefa/situação → 2. Como ajudar (`Assumir por mim` | `Fazer junto / Body Doubling` | `Me lembrar mais tarde`) → 3. Urgência (`Agora | Hoje | Semana`).

---

## REGRAS DE FLUIDEZ, ERGONOMIA E ANTI-SLOP (`fluidez-e-revelacao.md` & `product-ui-system.md`)
- **Recompor, não encolher:** Bottom Nav ergonômica no mobile (`< 640px`, com Dock Flutuante acima dela) e Sidebar limpa + layout em colunas no desktop (`>= 1024px`).
- **Inputs `>= 16px` e alvos `>= 48px`**, estrutura de campo com `label` acima e erro inline abaixo com `role="alert"` e `aria-invalid` (nunca erro só em toast).
- **Motion de produto:** seleção em abas e filtros (`Meu | Dela | Nós` e `Dia | Semana | Mês`) troca **na hora (0ms, zero flick)**; gavetas (`Sheets`) animadas via `transform` no compositor sem `backdrop-filter` pesado; separação de contextos React para zero re-render global ao abrir modal.
- **Anti-Slop:** zero gradiente roxo-azul, zero emoji como ícone estrutural (use ícones `Lucide` consistentes), zero travessão longo (`—`).

---

## ETAPA 5 E 6 — TESTES AUTOMATIZADOS (`VITEST`) + VALIDAÇÃO `PLAYWRIGHT`
1. **Testes Unitários (`npm test` com Vitest):**
   - Teste o motor financeiro em centavos (`50/50`, `Proporcional`, `100% adiantado para o par` e quitação `SETTLEMENT`).
   - Teste a matriz de privacidade financeira (`share_personal_finances` `ON/OFF` + ocultação de `is_secret_gift` na visão do parceiro).
   - Teste a máquina de estados de medicação (`PENDING` -> `SNOOZED_WATER` -> `TAKEN`, desconto de estoque e alerta de atraso `+30m`) e a fila `sync_outbox`.
2. **Validação E2E e Visual no Navegador (`Playwright`):**
   - Rode `typecheck`, `lint`, `test` e `build`.
   - Com Playwright, valide nas larguras mobile (`360px`, `390px` iPhone) e desktop (`1280px`, `1440px`), nos temas **Claro** e **Escuro**:
     - Alternar a Bateria Mental para `🪫 10% Sobrecarga` e verificar a simplificação da tela `Hoje`.
     - Confirmar um remédio com `⏳ Pegando água (+5m)` e depois `✓ Já engoli`.
     - Lançar um gasto `Do Casal`, um gasto pessoal normal e um gasto pessoal marcado como `🎁 Presente / Surpresa`; alternar para a visão da parceira e comprovar que o toggle de privacidade bloqueia/libera a aba pessoal e mantém o presente oculto.
     - Testar um Pedido de Ajuda em 3 cliques (`S04`) e aceitar na visão do parceiro.
     - Testar os parâmetros de Atalhos do iPhone (`/?quick=task`, `/?quick=expense`, `/?quick=med`, `/?quick=sos`).
     - Garantir `0` erros de console e `0` overflow horizontal.
```
