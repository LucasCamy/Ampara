# ADR-0012: Um cérebro que organiza sozinho, por trás, guiado pelo sentido e pelo jeito da pessoa

- Status: Aceita
- Data do registro: 2026-11-25
- Data da aceitação: 2026-11-25 (pedida pelo dono do produto)
- Referências: [ADR-0004](0004-ia-propoe-operacoes-e-o-codigo-valida.md), [ADR-0010](0010-ia-local-no-pc-pela-rede-tailscale.md), [ADR-0011](0011-gemini-flash-lite-com-chave-pessoal.md)

## Contexto

Os pensamentos chegam em sequência. Esperar a IA organizar cada um tira a pessoa do fluxo. Conferir cada resultado
vira retrabalho, e isso vai contra o motivo do Ampara existir. A pessoa quer um cérebro que **aprende o jeito
dela** e mapeia tudo sozinho.

Dois problemas técnicos:
- A busca era por palavras. "fui correr" não achava a ideia "Corrida" sem uma palavra em comum.
- O modelo de sentido que já estava no PC (nomic-embed) quase não separa assuntos em português. Num teste,
  "as plantas murcharam" ficou mais perto da estante do que da rega.

## Decisão

1. **Sentido local:** o EmbeddingGemma 300M (~230 MB), carregado no LM Studio como `ampara-sentido`, junto com
   o modelo `ampara`. Ele é carregado de forma explícita, para o LM Studio não descarregar um para usar o outro.
   O intermediário também libera `POST /v1/embeddings`. No mesmo teste em português, acertou 6 de 6 casos em
   cerca de 0,1 s. O pensamento vago ficou baixo em todos os destinos.
2. **Memória do sentido:** o sentido de cada texto é calculado uma vez e guardado **só na memória** do app aberto
   (pela impressão do texto). Ele não é gravado em disco nem sincronizado, porque deriva de texto privado. Sem a
   IA local, o app volta para a busca por palavras.
3. **O sentido ajuda a escolher o contexto:** as ideias candidatas mandadas para a IA e as anotações do
   "Perguntar às ideias" passam a somar o sentido às palavras.
4. **Por trás, sem esperar:** soltar só guarda. O campo fica livre na hora, com um palpite rápido pelo sentido
   ("parece ser de Saúde › Corrida"). A organização entra numa fila, **um por vez**, porque a placa atende um
   pedido de cada vez.
5. **Sequência:** pensamentos soltos com até 3 minutos de diferença vão como contexto do seguinte. A IA usa esse
   contexto só para entender, e os trechos continuam vindo só da captura atual.
6. **O jeito da pessoa:** a IA recebe como exemplos as anotações mais parecidas que já estão no mapa, com o
   lugar onde ficaram. Primeiro entram as que **a própria pessoa** organizou. Isso "treina" a IA com o mapa real,
   sem guardar nada novo: quando a pessoa muda algo de lugar, o exemplo muda junto. A anotação ganhou
   "Mover para outra ideia", que é a correção mais natural.
7. **Sem fila de conferir:** a IA aplica o que tem confiança. O que ficou abaixo de 0,8 só ganha uma marca
   discreta no mapa. A Caixa de entrada fica para o que não tem sentido nenhum (frase vaga ou ordem dentro do
   texto). Desfazer continua disponível. O validador da ADR-0004 continua igual.

## Avaliação (Gemma 4 E4B local, mesma bateria da ADR-0011)

| Situação | Trechos certos (3 rodadas) |
|---|---|
| Prompt atual, sem extras | 11, 10, 10 |
| Com duas regras novas no prompt explicando os extras | 8, 9, 8 |
| Prompt atual, com exemplos e contexto anterior na entrada | 9, 10, 10 |

- Regras a mais no prompt atrapalham o modelo pequeno (o mesmo efeito visto na ADR-0011). Por isso o prompt não
  mudou: os campos novos têm nomes que se explicam (`dito_pouco_antes_so_para_entender` e
  `onde_a_pessoa_guardou_coisas_parecidas`).
- Com o Gemma, os exemplos e o contexto **ainda não mostraram ganho**. Num teste à parte, o caso do "débito mensal"
  continuou errado com exemplo, e a continuação "e também comprar um tênis" empatou (2 de 3, com e sem contexto).
  Eles ficam porque não pioram de forma clara e porque modelos maiores (Gemini, Claude) costumam usar melhor esse
  tipo de pista. A medição com esses modelos fica pendente.
- O ganho medido do sentido está na **escolha do contexto**: com mais de 40 ideias, a ideia certa só chega até a IA
  se a busca a encontrar. Na busca por sentido em português, o modelo acertou 6 de 6.

## Teste real no app do PC (2026-11-25)

Espaço de teste, só IA local:
- 3 pensamentos soltos em sequência em 0,2 s; a fila organizou tudo em 38 a 71 s.
- "e comprar um tênis melhor pra isso" entrou na ideia da corrida (o contexto da sequência funcionou).
- "hoje fui trotar na praça" ganhou o palpite "Saúde › Rotina de exercícios e corrida" em 0,2 s.
- "o que eu pensei sobre exercício?" achou as 3 anotações de corrida sem nenhuma palavra em comum.

**Calibração:** um corte fixo falhou ("trotar" ficou em 0,36 contra "correr"). Os valores variam, mas o assunto
certo fica na frente. Por isso vale o que está acima de 0,36 **e** a até 0,1 do mais parecido (`focusSense`). O
palpite só aparece com um vencedor claro (pelo menos 0,03 à frente do segundo).

## Alternativas consideradas

- **Mandar o mesmo pensamento para a IA local e para o Gemini ao mesmo tempo:** tudo iria para o Google, e a
  placa só atende um pedido por vez. A paralelização ficou entre o sentido (leve) e a fila (pesada).
- **Treinar (fine-tuning) um modelo:** caro, lento e preso a um modelo. Exemplos tirados do próprio mapa
  custam quase nada e acompanham as mudanças da pessoa (o ganho ainda precisa ser medido).
- **Guardar o sentido no cofre:** possível depois. Hoje, recalcular tudo ao abrir é rápido (~0,1 s a cada 12
  textos).

## Consequências

- Positivas: soltar fica instantâneo, a organização acompanha o jeito da pessoa e a busca entende sinônimos.
- Negativas: com o PC desligado não há sentido, e a busca volta a ser por palavras. A placa passa a usar
  ~6,8 de 8 GB. A pessoa precisa reinstalar a tarefa da IA local para carregar o modelo de sentido ao ligar.
