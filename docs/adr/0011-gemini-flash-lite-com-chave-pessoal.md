# ADR-0011: Gemini 3.1 Flash-Lite como provedor opcional, com chave pessoal no cofre

- Status: Aceita
- Data do registro: 2026-11-23
- Data da aceitação: 2026-11-23 (pedida pelo dono do produto)
- Referências: [ADR-0004](0004-ia-propoe-operacoes-e-o-codigo-valida.md), [ADR-0005](0005-provedores-de-ia-plugaveis.md), [ADR-0006](0006-chave-de-api-guardada-no-cofre-do-aparelho.md), [ADR-0010](0010-ia-local-no-pc-pela-rede-tailscale.md)

## Contexto

A IA local (ADR-0010) só responde com o PC ligado. O Claude pela assinatura só existe no app do PC. Faltava uma
opção na nuvem para usar no celular com o PC desligado. O Gemini 3.1 Flash-Lite tem nível gratuito e saída
estruturada nativa. No nível gratuito, o Google pode usar o conteúdo para melhorar os produtos dele.

## Decisão

1. **Provedor `gemini`** (`src/ai/gemini.ts`): `v1beta/models/gemini-3.1-flash-lite:generateContent`, chave no
   cabeçalho `x-goog-api-key`, `thinkingLevel: minimal`, saída com `responseJsonSchema`. Usa os mesmos contratos
   (`organizador@1`, `concretizar@1`, `perguntar@1`) e os mesmos validadores.
2. **Esquema adaptado só no envio:** a API recusa o esquema com `maxItems` e com enums anuláveis no formato
   original. O adaptador tira `maxItems` e escreve os enums anuláveis com `anyOf`. Os limites continuam no
   validador do Ampara (50 operações por captura).
3. **Escolha e reserva:** a pessoa pode escolher "Gemini" em Ajustes. No modo **Automático**, a ordem é:
   IA local → Gemini (só se a pessoa guardou a chave) → Claude no app do PC. Uma IA que não responde passa a vez
   para a próxima. Antes de chamar a IA local, o app pergunta se ela está no ar (até 6 s, resposta guardada por
   1 min), para não esperar o tempo-limite inteiro com o PC desligado. A escolha é por pessoa e por aparelho.
4. **Nada se perde:** se nenhuma IA responder, o pensamento fica guardado como pendente. O app tenta de novo
   sozinho ao abrir, quando a internet volta, ao voltar para o app e a cada 5 min (até 5 por vez, do mais antigo
   para o mais novo). Pensamentos que a pessoa desfez não são organizados de novo sem ela pedir.
5. **Chave (segue a ADR-0006):** cifrada no slot da pessoa, com chave própria embrulhada pela chave da senha
   (AAD `ampara:gemini:v1:<pessoa>`). Fica fora de backups e da sincronização. Salvar ou remover pede a senha.
   Bloquear o cofre cancela as chamadas em curso.
6. **Aviso de privacidade na tela:** com a chave gratuita, usar só conteúdo sem dados pessoais, sensíveis ou
   confidenciais. Para pensamentos reais, a recomendação é a **IA local** ou uma **chave paga**.

## Avaliação

Mesma bateria fictícia nos dois modelos: 8 capturas, 13 trechos, gabarito fixo. Um trecho conta quando uma
operação o cobre inteiro, sem pegar outro trecho, no destino certo (e com o tipo certo, se for ideia nova).
A nota é o resultado depois do validador, com a segunda tentativa do app.

| Modelo | Trechos certos | Capturas inteiras | Mediana por captura |
|---|---:|---:|---:|
| Gemini 3.1 Flash-Lite `minimal` (API gratuita, 1 rodada) | 11/13 | 6/8 | 8,9 s |
| Gemma 4 E4B local, validador antigo (3 rodadas) | 10, 9, 11 | 5, 4, 6 | 12 a 20 s |
| Gemma 4 E4B local, com as duas regras de corte no prompt (3 rodadas) | 10, 8, 7 | 5, 3, 3 | 12 a 16 s |
| Gemma 4 E4B local, validador novo (3 rodadas) | 11, 10, 10 | 6, 5, 6 | 16 a 18 s |

O que se aprendeu:
- **Qualidade parecida.** Na média, o Gemma local fica perto do Flash-Lite. O Flash-Lite responde em cerca de
  metade do tempo.
- **Validador novo:** o Gemma repetia o mesmo id de assunto existente em `assunto_id` e `assunto_ref`. Isso não é
  ambíguo, então agora o validador aceita como `assunto_id`. Com isso, o caso "ideia nova" passou nas 3 rodadas.
- **As regras de corte não entraram no prompt.** As duas regras propostas (juntar as etapas de um plano e tratar
  detalhe de passagem como contexto) pioraram o Gemma e não corrigiram o caso do "débito mensal". O prompt
  continua o mesmo. Se a ideia voltar, ela precisa de uma bateria maior e de testes nos dois modelos.
- **Erros que ainda existem:** os dois modelos cortam "o professor falou do débito… mas eu só quero treinar
  conversa" em dois trechos. O Flash-Lite também dividiu a cerâmica em duas ideias.
- **Limite:** a bateria é pequena. Os números descrevem estes casos, não uma diferença estável entre os modelos.

## Alternativas consideradas

- **Gemini 4 Hydrogen:** empatou no Playground, mas a API gratuita só devolveu HTTP 503 e 429.
- **GPT-OSS 120B pela Groq:** 9/13. Errou destinos e mudou o texto literal de um trecho.
- **Só IA local:** é grátis e privada, mas não funciona com o PC desligado.

## Consequências

- Positivas: há IA no celular sem o PC ligado, e a organização continua quando o PC desliga. A chave não passa pelo servidor do Ampara. O contrato e o validador
  são os mesmos para todos os provedores.
- Negativas: no nível gratuito, o texto vai para o Google e pode ser usado por ele. A CSP passa a liberar
  `https://generativelanguage.googleapis.com`. O contador mensal de uso previsto na ADR-0006 ainda não existe; a
  cota aparece no painel do projeto Google.
