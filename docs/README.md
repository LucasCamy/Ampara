# Documentação Completa de Produto, UX e Arquitetura — App “Nós”

> **Propósito deste diretório:** Documentação estruturada de ponta a ponta para pesquisa, validação de arquitetura, design de interface (`product-ui-system` + `ARQ-E` + `ARQ-D`) e planejamento de execução do aplicativo **“Nós”** — um sistema mobile *offline-first* desenhado para casais organizarem a vida a dois com foco em **TDAH** (co-regulação, baixíssimo atrito cognitivo, captura em menos de 3 segundos e privacidade flexível).

---

## Índice dos Documentos

| # | Documento | O que você encontra nele |
|---|---|---|
| **01** | [`01-prd-escopo-moscow.md`](./01-prd-escopo-moscow.md) | **Bloco 1 — Produto e Escopo:** Problema central (assimetria de carga mental e cegueira temporal no TDAH), proposta de valor, papéis e permissões (incluindo o toggle **Ver gastos um do outro** + **Modo Surpresa**), MVP vs. Futuro, matriz **MoSCoW** e métricas de sucesso. |
| **02** | [`02-ux-fluxos-navegacao.md`](./02-ux-fluxos-navegacao.md) | **Bloco 2 — UX, Fluxos e TDAH:** Mapa de navegação (`mermaid`), as 7 jornadas principais (captura em 3s, visão Hoje, remédio em 2 estágios, gasto e divisão, transparência financeira, pedido de ajuda em 3 toques e Atalhos do iOS), estados vazios/erro/offline e ergonomia anti-sobrecarga. |
| **03** | [`03-especificacao-telas-product-ui-system.md`](./03-especificacao-telas-product-ui-system.md) | **Bloco 3 — Telas e Design System (`product-ui-system`):** Metáfora funcional (*Creative North Star*), fusão visual com `ARQ-E` (Saúde) e `ARQ-D` (Boutique), tokens `tokens.css` (Claro + Escuro) com tabela de contraste WCAG AA calculada, tipografia tripla e especificação completa de 10 telas/gavetas com wireframes estruturais. |
| **04** | [`04-arquitetura-dados-ios-offline.md`](./04-arquitetura-dados-ios-offline.md) | **Bloco 4 — Arquitetura, Offline-First, Modelo de Dados e iOS:** Comparativo de pesquisa (PWA vs. React Native/Expo vs. Swift), diagrama de arquitetura, sincronização *offline-first* (SQLite local + Supabase), schema completo do banco (ER + SQL), notificações `Time-Sensitive` e integração com **Atalhos do iPhone (`App Intents`)**. |
| **05** | [`05-modelo-financeiro-privacidade.md`](./05-modelo-financeiro-privacidade.md) | **Bloco 5 — Motor Financeiro do Casal:** Separação `Meu`, `Dela` e `Do Casal`, funcionamento do **Toggle de Transparência Mútua** + flag de **Presente/Surpresa**, fórmulas de divisão (`50/50`, `Proporcional à Renda`, `Adiantamento 100%`), cálculo de encontro de contas e fechamento do mês. |
| **06** | [`06-backlog-roadmap-execucao.md`](./06-backlog-roadmap-execucao.md) | **Bloco 6 — Plano de Execução:** Backlog priorizado com User Stories e critérios de aceite, fases de entrega (MVP, v1.1 e v2.0), matriz de riscos, plano de testes e guia prático de como instalar no iPhone de vocês dois (com ou sem conta paga da Apple). |

---

## Guia Rápido de Termos para Pesquisa (Cheat Sheet de Estudo)

Como o seu objetivo atual é **pesquisar e validar os caminhos técnicos e visuais** antes de codar, aqui estão os conceitos e bibliotecas exatas mapeados nesta documentação para você explorar:

### 1. Stack Mobile & Banco Offline-First
- **Framework recomendado:** `Expo (SDK 52+)` com **Continuous Native Generation (CNG / Prebuild)** + `React Native` + `TypeScript`.
- **Por que Expo Prebuild em vez de PWA puro?** No iOS, PWAs não têm acesso a `App Intents` (Atalhos nativos da Siri que rodam em background offline sem abrir o navegador) nem a ações interativas ricas em notificações locais com nível `timeSensitive` / `critical`.
- **Banco de Dados Local (Offline-First):**
  - **Opção A (Mais simples e direta):** `op-sqlite` ou `expo-sqlite` + `Drizzle ORM` local + fila de sincronização própria (*Outbox Pattern*) com **Supabase (PostgreSQL + Realtime)**.
  - **Opção B (Sincronização pronta):** `PowerSync` (sincroniza SQLite local com Postgres/Supabase automaticamente) ou `WatermelonDB`.

### 2. Alarmes, Remédios e Atalhos no iPhone (iOS)
- **Notificações Interativas Locais:** `Notifee` ou `expo-notifications` usando `interruptionLevel: 'timeSensitive'` (fura o Modo Foco do iOS quando autorizado) + **Notification Categories / Action Buttons** (permite clicar em `✓ Já engoli` ou `⏳ +5 min (Pegando água)` direto na tela bloqueada do iPhone sem abrir o app).
- **Atalhos do iPhone (Siri Shortcuts / Botão de Ação / Toque Atrás):**
  - Biblioteca para pesquisar: `expo-apple-targets` (para criar extensões iOS em Swift enxuto dentro do projeto Expo) expondo **`AppIntents`** (iOS 16+) ou **Deep Links com URL Scheme / Universal Links** (`nosapp://quick-action?type=expense&amount=...`) acionados pelo app nativo **Atalhos (Shortcuts)** do iPhone.
  - **Dica de Ouro para Pesquisa:** Mesmo antes de escrever código Swift para `App Intents`, o app **Atalhos do iOS** consegue abrir uma URL `nosapp://...` ou fazer um `POST` local/remoto usando o menu nativo do iPhone (acionado pelo **Toque Atrás 2x** ou **Botão de Ação** do iPhone 15 Pro/16)!

### 3. Skills de Layout e UI Mapeadas do seu Ambiente
- **Base de Produto:** [`product-ui-system.md`](file:///C:/Users/Lucas/.gemini/config/skills/frontend-figma-playwright/references/product-ui-system.md) (Metáfora funcional, `Estado = Forma + Texto + Cor`, traço sólido para realizado vs. tracejado para previsto, números com `tabular-nums` e contexto).
- **Inspiração Estrutural (`ARQ-E` — Saúde):** [`saude-fisioterapia-odonto.md`](file:///C:/Users/Lucas/.gemini/config/skills/frontend-figma-playwright/pipeline-midia/exemplos-prontos/saude-fisioterapia-odonto.md) (grandes containers arredondados `rounded-[28px]`, títulos bicolores para guiar o foco do TDAH, dock flutuante fixo no rodapé e modal de triagem rápida em 3 cliques para o Pedido de Ajuda).
- **Inspiração Tátil (`ARQ-D` — Boutique):** [`loja-roupa-sacola-whatsapp.md`](file:///C:/Users/Lucas/.gemini/config/skills/frontend-figma-playwright/pipeline-midia/exemplos-prontos/loja-roupa-sacola-whatsapp.md) (paleta orgânica acolhedora, ação rápida direto no card sem abrir subtelas e `Toast` imediato com botão `[Desfazer]`).
- **Performance de Gavetas e Listas:** [`fluidez-e-revelacao.md`](file:///C:/Users/Lucas/.gemini/config/skills/frontend-figma-playwright/references/fluidez-e-revelacao.md) (separação de contextos de estado para zero engasgo ao abrir modais/sheets).
