# ADR-0004: A IA propõe operações fechadas e o código valida antes de gravar

- Status: Aceita
- Data da aceitação: 2026-11-23 (aprovada pelo dono do produto; ainda não implementada)
- Data do registro: 2026-11-23
- Referências: [08-ideias-segundo-cerebro.md, seções 4 e 5](../08-ideias-segundo-cerebro.md#4-como-a-ia-organiza-o-contrato)

## Contexto

Para "a IA não se perder", a estrutura (ADR-0002) e a malha (ADR-0003) precisam de garantias que não dependam
do modelo acertar. Modelos diferentes (ADR-0005) têm qualidades diferentes, e qualquer um pode inventar um
trecho que a pessoa não disse, citar um `id` inexistente ou criar pastas demais.

## Decisão

1. A IA **nunca grava direto**. Ela devolve uma lista de **operações de um conjunto fechado**
   (`ANEXAR`, `CRIAR_IDEIA`, `CRIAR_ASSUNTO`, `CAIXA_DE_ENTRADA`, `SUGERIR_LIGACAO`, `ATUALIZAR_RESUMO`,
   `SUGERIR_ESTADO`) num **JSON com esquema** versionado (`organizador@N`).
2. Um **validador puro, testado em `src/domain/`**, confere cada operação: trecho literal da captura, `id`s
   existentes e da própria pessoa, vocabulários fechados, limites e cobertura da captura sem sobreposição.
3. **Confiança decide o destino:** `>= 0,8` aplica; `0,6 a 0,8` aplica marcado "conferir"; `< 0,6` vai para
   a Caixa de entrada. Operação inválida é recusada sozinha e seu trecho vai para a Caixa de entrada.
4. **Não existem** operações de apagar ou de mexer em estrutura firme. Mudanças assim são propostas na revisão.
5. Toda organização gera um **registro** (provedor, modelo, versão do prompt, operações e resultado) e pode
   ser **desfeita** por captura.
6. Contexto enviado é **limitado**: mapa compacto e até 40 ideias candidatas escolhidas por busca local.
7. **Perguntas** usam a mesma ideia: busca local escolhe até 30 anotações; a resposta precisa citar `[n:ID]`,
   e o código confere as citações. Perguntas não alteram dados.
8. O texto de capturas e anotações é tratado como **dado**: instruções escritas dentro dele não são seguidas.

## Alternativas consideradas

- **IA com acesso de escrita por ferramentas (agente livre):** flexível, mas difícil de auditar e de limitar;
  um erro pode reorganizar tudo. Rejeitada para a organização (o agente do PC continua existindo para arquivos,
  com confirmação, no app desktop).
- **Embeddings e agrupamento automático no servidor:** encontra semelhança bem, mas exige processar o texto
  no servidor e produz grupos instáveis. Pode entrar depois apenas para **escolher candidatos**, nunca para decidir.
- **Só regras locais, sem IA:** previsível e grátis, mas não entende linguagem solta. Continua como modo sem IA.

## Consequências

- Positivas: a estrutura fica íntegra mesmo com um modelo fraco; tudo é auditável e reversível; o validador
  é testável com Vitest sem chamar IA.
- Negativas: mais código e testes; trechos com pequena diferença de digitação da IA são recusados (mitigado pela
  comparação normalizada); o limite de 40 candidatos pode esconder uma ideia antiga relevante (mitigado por
  busca local melhor e pela revisão).

## Implementação e verificação

Planejado: vocabulários em `src/domain/ideas.ts` e validador em `src/domain/ideasValidate.ts` (seguindo o padrão plano de `src/domain/`), com testes para cada regra; casos de borda (trecho inventado,
`id` de outra pessoa, 13º assunto na área, sobreposição de trechos, confiança limite). Um conjunto de capturas
reais anonimizadas vira avaliação para comparar provedores.

- **Perguntas implementadas (2026-11-23):** `src/domain/ideasAsk.ts` (`perguntar@1`). Busca local nas anotações e nos
  pensamentos ainda não organizados, com família de palavras sem dicionário e filtros lidos na pergunta (tipo,
  período, área). A IA recebe só as até 30 encontradas; cada frase traz `fontes`, e o código descarta fonte que não
  estava na lista (a frase aparece "sem fonte"). Sem nada encontrado, a IA nem é chamada. Perguntar não grava nada.
  Verificado com 15 testes de unidade, 2 E2E e teste real com a assinatura.
