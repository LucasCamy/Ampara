# ADR-0003: Malha de pensamento com ligações tipadas entre ideias

- Status: Aceita
- Data da aceitação: 2026-11-23 (aprovada pelo dono do produto; ainda não implementada)
- Data do registro: 2026-11-23
- Referências: [08-ideias-segundo-cerebro.md, seção 3](../08-ideias-segundo-cerebro.md#3-a-malha-de-pensamento)

## Contexto

A árvore (ADR-0002) organiza, mas pensamentos se cruzam entre Áreas: "correr de manhã" (Saúde) conversa com
"render mais no trabalho" (Trabalho). A pessoa pediu **malhas de pensamento**. Ligações sem regra viram
um emaranhado tão confuso quanto a cabeça cheia.

## Decisão

1. Ligações existem **só entre Ideias** (não entre anotações nem pastas), em qualquer Área.
2. Tipos fechados: `RELACIONA`, `DEPENDE_DE`, `PARTE_DE`, `CONTRADIZ`, `EVOLUI_DE`.
3. Toda ligação tem **motivo** (uma frase), **origem** (`IA` ou `PESSOA`) e **estado**:
   `SUGERIDA` (tracejada) ou `CONFIRMADA` (sólida), seguindo o idioma visual já usado no Ampara.
4. Limites: a IA sugere no máximo 3 ligações por captura e 5 por ideia. Ligação recusada é lembrada
   e não volta a ser sugerida.
5. Ligações não movem ideias nem mudam a árvore.

## Alternativas consideradas

- **Ligação genérica sem tipo:** mais simples, mas não diz *por que* duas ideias se ligam; no mapa vira teia.
- **Grafo livre com tipos criados pela IA:** expressivo, mas imprevisível e impossível de validar.
- **Sem malha (só árvore):** previsível, mas perde o valor de ver conexões entre áreas da vida.

## Consequências

- Positivas: a malha explica conexões e contradições; a pessoa controla o que vira sólido.
- Negativas: mais um tipo de dado e de interface (aceitar/recusar sugestões); cinco tipos podem não cobrir
  todos os casos (`RELACIONA` funciona como coringa).
