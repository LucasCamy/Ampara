# ADR-0002: Estrutura fixa de quatro níveis (Área, Assunto, Ideia, Anotação)

- Status: Aceita
- Data da aceitação: 2026-11-23 (aprovada pelo dono do produto; ainda não implementada)
- Data do registro: 2026-11-23
- Referências: [08-ideias-segundo-cerebro.md, seção 2](../08-ideias-segundo-cerebro.md#2-a-estrutura-4-níveis-profundidade-fixa)

## Contexto

A pessoa pediu uma **estrutura rígida**: "não podemos deixar a moda solta". Com tags livres ou pastas criadas
pela IA sem limite, o mapa cresce sem forma, nomes mudam e a pessoa perde o sentido de tudo.
Ao mesmo tempo, a IA precisa de espaço para encaixar assuntos novos da vida real.

## Decisão

Profundidade **fixa** de quatro níveis, mais a captura bruta:

| Nível | Regra |
|---|---|
| **Área** | Catálogo inicial de 8 (Trabalho, Estudos, Saúde, Casa, Dinheiro, Relações, Projetos pessoais, Lazer e criatividade). A pessoa renomeia ou esconde; máximo 10 ativas. A IA **não cria** Áreas. |
| **Assunto** | Pertence a uma Área. A IA cria só como **provisório** (borda tracejada); fica **firme** com confirmação ou ao chegar a 3 ideias. Máximo 12 ativos por Área. |
| **Ideia** | Pertence a um Assunto. Título até 8 palavras, resumo até 2 frases, **natureza** de vocabulário fechado (`PLANO`, `DESEJO`, `PREOCUPACAO`, `PERGUNTA`, `OBSERVACAO`, `REFLEXAO`). |
| **Anotação** | Trecho **literal** de uma captura, preso a uma Ideia (ou na Caixa de entrada). Só a pessoa edita; a IA nunca. |
| **Captura** | O que a pessoa soltou de uma vez. Imutável. |

Identificadores são estáveis: renomear não quebra ligações. Não há subassuntos nem pastas aninhadas.

## Alternativas consideradas

- **PARA (Projetos, Áreas, Recursos, Arquivo):** bom para documentos e projetos com prazo, mas pede
  que a pessoa classifique por "acionabilidade" na entrada, o que é exatamente o atrito a evitar. Aproveitamos
  a ideia de **Áreas fixas** e o "Arquivo" como estado `GUARDADA`.
- **Zettelkasten puro (notas atômicas + links, sem pastas):** ótimo para ligações, mas sem hierarquia a
  pessoa não tem "pastas" para olhar, que foi o pedido. Aproveitamos **anotações atômicas** e a **malha** (ADR-0003).
- **Tags livres / pastas ilimitadas criadas pela IA:** máxima flexibilidade, mas é a "moda solta". Rejeitada.
- **Profundidade variável (subassuntos):** mais expressivo, mas o mapa fica difícil de ler e de validar. Rejeitada.

## Consequências

- Positivas: o mapa tem sempre a mesma forma; a IA escolhe dentro de opções conhecidas; o validador consegue
  conferir tudo; filtros por natureza e estado dão sentido ("minhas preocupações").
- Negativas: alguns pensamentos ficam num assunto "quase certo"; limites podem exigir juntar assuntos
  (resolvido pela revisão com propostas). O catálogo de Áreas é uma opinião de produto e pode precisar de ajuste.
