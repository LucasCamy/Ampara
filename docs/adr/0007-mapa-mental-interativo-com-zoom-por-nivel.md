# ADR-0007: Mapa mental interativo com zoom por nível e esboço equivalente

- Status: Aceita
- Data da aceitação: 2026-11-23 (aprovada pelo dono do produto; ainda não implementada)
- Data do registro: 2026-11-23
- Referências: [08-ideias-segundo-cerebro.md, seção 8](../08-ideias-segundo-cerebro.md#8-o-mapa-mental-interativo-visão), [DESIGN.md](../../DESIGN.md)

## Contexto

A pessoa quer **ver** o que soltou, por "pasta" ou assunto, num mapa mental interativo. O Ampara é mobile-first
(360 px), usa tokens obrigatórios, ícones Lucide, anima só `transform` e `opacity`, e exige 0 overflow.
Um grafo com dezenas de nós não cabe em 360 px de forma legível, e a pessoa tem dislexia.

## Decisão

1. **Zoom por nível**, nunca o grafo inteiro de uma vez: Céu (Áreas) → Área (Assuntos e ideias) → Assunto →
   Cartão da Ideia (anotações, ligações, ações).
2. **Malha como camada** que se liga e desliga; ligação sólida = confirmada, tracejada = sugerida.
3. **Layout determinístico** calculado no cliente com `d3-hierarchy` (árvore radial recolhível); SVG próprio
   desenhado com tokens; pan e zoom com gestos, animando só `transform`. Posições não são gravadas.
4. **Esboço** (lista recolhível Área → Assunto → Ideia) é uma visão **completa e equivalente**, padrão no
   celular estreito e para teclado e leitor de tela. O mapa é padrão em telas largas.
5. Filtros por natureza, estado e período. Nós com estado usam o padrão `Estado = ícone + texto + cor + traço`.

## Alternativas consideradas

- **React Flow (`@xyflow/react`):** muito completo para edição de grafos, mas pesado para o uso (leitura com zoom),
  com estilo próprio a adaptar aos tokens e desempenho incerto em celular.
- **Cytoscape.js:** forte para grafos grandes, mas desenha em canvas, o que prejudica acessibilidade e o uso de tokens.
- **Grafo de forças (force-directed):** bonito, mas muda de forma a cada abertura, o que desorienta. Rejeitado.

## Consequências

- Positivas: forma estável e previsível; dependência pequena; acessível pelo esboço; respeita as regras visuais.
- Negativas: interações ricas (arrastar ideias entre assuntos no mapa) ficam para depois e serão feitas no esboço;
  o desenho próprio exige mais trabalho de layout e testes visuais nas larguras do projeto.
