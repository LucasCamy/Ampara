# DESIGN.md · Ampara

> Figma MCP não está autenticado nesta sessão. Conforme autorizado no briefing, o sistema visual está
> documentado aqui, em `src/styles/tokens.css` e no guia vivo `public/styleguide.html`.

## Creative North Star

**Painel de Aterrissagem Calma & Livro-Razão Vivo do Casal.**

- Rotina e TDAH: painel de cabine silencioso. O que precisa ser feito **agora** tem destaque absoluto.
- Finanças e contas: livro-razão vivo. Realizado/pago/tomado usa **traço sólido**; previsto/pendente usa
  **borda tracejada** e superfície leve.
- Princípio de hierarquia: **a próxima ação vem sempre antes do histórico e das métricas.**

### Fusão de arquétipos

| Origem | O que entra no Ampara |
|---|---|
| ARQ-E (Saúde) | Containers `rounded-[28px]`, título bicolor (âncora em `--ink` + complemento em `--muted`), Dock flutuante de captura, triagem do Pedido de Apoio em 3 cliques |
| ARQ-D (Boutique) | Temperatura orgânica (`#F7F6F2` / `#0A0F1D`), ação rápida direto no card, `Toast` no topo com `[Desfazer]` de 5 s |

## Tokens de cor

| Token | Claro (Calma Orgânica) | Escuro (Noite Serena) | Uso |
|---|---|---|---|
| `--bg` | `#F7F6F2` | `#0A0F1D` | Fundo da página |
| `--surface` | `#FFFFFF` | `#131B2E` | Cards, sheets, módulos 28px |
| `--subtle` | `#EEF1F6` | `#1C2740` | Chips inativos, trilhos de abas |
| `--segment-active` | `#FFFFFF` | `#2C3A5A` | Item ativo do menu segmentado (sempre mais claro que o trilho, com `ring-line-strong`) |
| `--selected` | `#E3ECE8` | `#1E352F` | Item/filtro ativo |
| `--ink` | `#0F172A` | `#F1F5F9` | Texto primário, âncora do título bicolor |
| `--muted` | `#526077` | `#94A3B8` | Texto secundário, complemento do título |
| `--line` | `ink` a 10% | `ink` a 12% | Divisórias 1px |
| `--action` | `#25634B` | `#4ADE80` | Único acento de ação |
| `--on-action` | `#FFFFFF` | `#062819` | Texto sobre ação |
| `--partner-a` | `#2B5B84` | `#7DD3FC` | Identidade Parceiro A |
| `--partner-b` | `#9E4730` | `#FDA4AF` | Identidade Parceira B |
| `--couple` | `#5B4B8A` | `#C4B5FD` | Escopo Nós |
| `--state-ok` | `#1E6B45` | `#4ADE80` | Tomado / pago / concluído |
| `--state-warn` | `#8C5311` | `#FBBF24` | Previsto / pendente / snooze |
| `--state-err` | `#B42318` | `#F87171` | Atrasado / SOS |
| `--state-*-soft` | `#E8F3EC` / `#FBF3E6` / `#FBECEA` | `#12291F` / `#2A2413` / `#2E1A1F` | Fundo de destaque de estado |

**Ajuste em relação ao doc 03:** `--state-warn` claro passou de `#9A5B13` para `#8C5311`, porque
`#9A5B13` sobre `--selected` dava **4,49:1** (reprovado). Com `#8C5311` fica **5,19:1**.

## Contraste calculado (WCAG 2.1, fórmula de luminância relativa)

Script: cálculo direto dos hex acima. Mínimo: 4,5:1 para texto.

### Tema claro

| Texto \ Superfície | bg | surface | subtle | selected |
|---|---|---|---|---|
| ink | 16,51 | 17,85 | 15,77 | 14,82 |
| muted | 5,89 | 6,37 | 5,62 | 5,28 |
| action | 6,55 | 7,08 | 6,26 | 5,88 |
| partner-a | 6,62 | 7,16 | 6,33 | 5,94 |
| partner-b | 5,72 | 6,18 | 5,46 | 5,13 |
| couple | 6,89 | 7,45 | 6,58 | 6,18 |
| state-ok | 5,99 | 6,47 | 5,72 | 5,37 |
| state-warn | 5,78 | 6,25 | 5,49 | 5,19 |
| state-err | 6,08 | 6,57 | 5,81 | 5,46 |

`on-action` sobre `action`: **7,08**. Estados sobre o próprio `soft`: ok 5,69 · warn 5,67 · err 5,73. `muted` sobre `warn-soft`: 5,78.

### Tema escuro

| Texto \ Superfície | bg | surface | subtle | selected |
|---|---|---|---|---|
| ink | 17,44 | 15,66 | 13,56 | 11,94 |
| muted | 7,45 | 6,69 | 5,79 | 5,10 |
| action | 10,97 | 9,85 | 8,53 | 7,51 |
| partner-a | 11,46 | 10,29 | 8,91 | 7,85 |
| partner-b | 10,11 | 9,07 | 7,86 | 6,92 |
| couple | 10,35 | 9,29 | 8,05 | 7,09 |
| state-ok | 10,97 | 9,85 | 8,53 | 7,51 |
| state-warn | 11,45 | 10,28 | 8,90 | 7,84 |
| state-err | 6,91 | 6,20 | 5,37 | 4,73 |

`on-action` sobre `action`: **9,09**. Estados sobre o próprio `soft`: ok 8,84 · warn 9,25 · err 5,91. `muted` sobre `warn-soft`: 6,02.

Todas as combinações usadas passam AA.

## Tipografia tripla

1. **Display:** Plus Jakarta Sans 700, `tracking-tight`. Títulos bicolores: `<Title anchor="Para agora," rest="uma coisa de cada vez." />`.
2. **Interface:** Plus Jakarta Sans 400/500/600, 15-16px. Inputs sempre 16px.
3. **Dados:** JetBrains Mono 500 com `tabular-nums` (`.font-data`). Valores sempre com unidade, pessoa e janela.

## Estado = forma + texto + cor + traço

| Estado | Ícone | Rótulo exemplo | Cor | Traço |
|---|---|---|---|---|
| Tomado / pago / concluído | `CircleCheck` | "Tomado às 09:04" | `--state-ok` | `1px solid` |
| Previsto / pendente | `CircleDashed` | "Previsto p/ dia 10" | `--state-warn` | `1px dashed` |
| Snooze água | `Clock` | "Pegando água · 04:12" | `--state-warn` | `1px dashed` |
| Atrasado | `SquareX` | "Atrasado há 35 min" | `--state-err` | `1px solid` + fundo soft |
| Pedido de apoio | `HeartHandshake` | "Pedido de apoio" | `--state-err` | fundo soft |

Marcadores do calendário mensal: `●` compromisso do casal (`--couple`), `▲` conta que vence (`--state-warn`),
`■` saúde/remédio (`--partner-a`), sempre com legenda textual e `aria-label`.

## Forma, sombra e motion

- Raios: `--radius-module: 28px`, `--radius-card: 20px`, `--radius-control: 14px`, `--radius-pill: 999px`.
- Sombra clara tingida de `ink` a 6-8%. No escuro, elevação por borda `1px` clara, sem sombra preta.
- Motion: `--ease-out: cubic-bezier(0.22,1,0.36,1)`, gaveta `cubic-bezier(0.32,0.72,0,1)`; entra 260 ms, sai 170 ms.
- Pressão tátil: `.press:active { transform: scale(0.97) }` em 120 ms.
- Seleção (abas, chips, filtros, dias): 0 ms.
- `prefers-reduced-motion: reduce`: todas as durações viram 0,01 ms.

## Layout (recompor, não encolher)

| Largura | Composição |
|---|---|
| `< 640px` | Top bar compacta, conteúdo em pilha, Dock flutuante acima da Bottom Nav de 5 abas (Hoje, Agenda, Nós, Cuidados, Finanças) |
| `640-1023px` | Mesmo esquema com conteúdo centralizado em 640px e cards em 2 colunas onde couber |
| `>= 1024px` | Sidebar 248px (navegação + captura rápida), conteúdo em 2 colunas, sem Dock |

## Componentes-chave

- `TopBar`: seletor de perspectiva `[Lucas | Parceira]`, bateria mental, status de sync, tema.
- `Dock`: `+ Tarefa`, `+ Gasto`, `Remédio`, `Ajuda` (alvos 52px, `rounded-[24px]`).
- `Sheet`: bottom sheet no mobile, diálogo centralizado no desktop. Foco preso, `Esc` fecha, foco volta ao gatilho.
- `Toast`: topo, `aria-live="polite"`, botão `[Desfazer]`, 5 s.
- `StatusBadge`: implementa a tabela de estados.

## Padrões de interação (revisão de 2026-11-06)

- **Seletores (`Segmented`):** `stretch` é o padrão das telas: colunas iguais na largura toda até o tablet e
  largura natural no computador (com a barra lateral); `fill` sempre na largura toda (cartões estreitos, barra
  lateral). Divisória fina entre opções não selecionadas. Alvo de 44px. Mais de 3 opções de categoria viram
  `ChoiceChips` (borda + ícone), não grade.
- **Navegação de período:** setas com borda (48px) e o rótulo no meio (`Novembro de 2026`), igual na Agenda e
  nas Finanças; "Mês atual"/"Hoje" só quando fora do período atual.
- **Carregando:** `Button busy` mantém rótulo e largura, troca o ícone por um indicador que gira (parado com
  movimento reduzido) e anuncia `aria-busy`, sem a opacidade de desabilitado. Abas carregam sob demanda com
  `ScreenSkeleton` (forma da tela); a abertura do app usa o mesmo esqueleto. Pré-carregamento ocioso mantém o
  app offline.
- **Hoje em três camadas:** urgente (sempre no topo; no modo sobrecarga, primeiro em "Pode esperar"), a próxima
  ação (Foco do dia, Próximas horas) e "Para hoje" com até 3 cartões e "Mais para hoje (N)".
- **Agenda única:** marcas do dia com ícone + texto e borda tracejada (previsão): coração (data especial), gota
  (menstruação), traço (semana de mais cuidado). O ciclo do par segue a privacidade da dona.
- **Dados:** "Para onde foi" usa barras horizontais ranqueadas de uma série, na cor de quem gastou (casal ou
  pessoa), com valor e % em texto; contraste de cada cor validado (≥ 3:1) em `surface` e `subtle`, claro e
  escuro.
