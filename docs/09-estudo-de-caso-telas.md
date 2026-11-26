# 09 · Estudo de caso das telas (TDAH e dislexia)

Revisão de 2026-11-26, feita sobre capturas do app com dados de exemplo em 390 px e 1280 px.
Objetivo: organizar sem deixar as telas todas iguais. Cada tela mantém o próprio assunto e ganha uma
ordem de leitura clara.

**Estado (2026-11-26):** aplicado e conferido. Typecheck, lint, 667 testes de domínio, auditoria de layout em
360/390/1024/1280 (também com Lexend e leitura ampla em 360) e capturas antes/depois passaram. Testes de tela:
suíte completa com 510 aprovados e 1 intermitente, e nova rodada em 3 formatos com o código final (167
aprovados). O intermitente (`solo-conversion`, "falha da RPC") também falha no código original; o das
caixinhas também falhava e foi corrigido no teste.

Ajustes feitos depois de olhar as telas: título só "Agenda"; a linha do tempo não repete a hora que já está na
coluna; com fonte larga em tela estreita, os atalhos do topo descem uma linha para não cortar o nome.

## Regras que valem em todas

| Regra | Por quê |
|---|---|
| Ação de "adicionar" sempre à direita do título da seção, na mesma linha | O olho procura sempre no mesmo lugar |
| Título em uma linha, complemento menor na linha de baixo | Frase longa com "·" cansa a leitura |
| Botões de um cartão na largura toda, em colunas iguais | Nada de botão torto, recuado ou quebrado em duas linhas |
| 3 ou 4 opções curtas viram blocos lado a lado (ícone em cima) | Acaba o "dois em cima e um sozinho embaixo" |
| Selo de estado do tamanho do texto | Selo esticado parecia botão |
| Ordem no celular: o que fazer, depois contexto, depois histórico | Próxima ação primeiro |

## Tela por tela

### Hoje
- **Problema:** pedido de ajuda (urgente) ficava abaixo de "Começo do dia" e da sugestão; cabeçalho com três
  itens em alturas e recuos diferentes; selo da sugestão com dois ícones empilhados.
- **Caso de uso:** abrir o app e saber em 3 segundos o que fazer agora.
- **Mudança:** celular em uma coluna: Agora, urgente, Foco do dia, ritual, Próximas horas, Para hoje,
  sugestão. No computador: esquerda "o que fazer", direita "contexto". "Ouvir meu dia" e "Caixa de Entrada"
  lado a lado. Próximas horas com a hora numa coluna fixa.

### Agenda
- **Problema:** dois seletores iguais empilhados antes do período; "Enviar ao amor" quebrando; 17 horas
  vazias na linha do tempo; semana cheia de cartões "Livre".
- **Caso de uso:** ver o que tem num dia e adiar o que não cabe.
- **Mudança:** "Compromisso" ao lado do título; ordem visão, período, pessoa; horas vazias seguidas viram
  "Livre até 18:00"; dia livre da semana ocupa uma linha; legenda do mês embaixo do calendário; "Amanhã" e
  "Enviar" lado a lado na largura do cartão.

### Nós
- **Problema:** página muito longa com quatro assuntos; no computador uma coluna sobrava vazia.
- **Caso de uso:** anotar uma compra no corredor do mercado, ou começar um foco juntos.
- **Mudança:** índice no topo (Compras, Foco, Calma, Datas); colunas equilibradas; "Onde comprar" em quatro
  blocos numa linha.

### Cuidados
- **Problema:** título e explicação longos; "Nova rotina" e "Ideias prontas" desalinhados; selo de horário
  esticado como botão.
- **Caso de uso:** confirmar o remédio.
- **Mudança:** título curto; uma ação no cabeçalho e "Ideias prontas" no fim da lista; selo do tamanho do texto.

### Finanças
- **Problema:** setas do mês nas duas pontas da tela; três botões de pagamento em formatos diferentes;
  coluna esquerda vazia no computador.
- **Caso de uso:** saber quem deve a quem e dar baixa numa conta.
- **Mudança:** navegador de mês compacto; ordem saldo, contas a pagar, lançamentos, depois análise, contas
  fixas e caixinhas; "Eu paguei" em destaque, as outras duas opções lado a lado.

### Ideias
- **Problema:** dois botões grandes antes do campo de escrever.
- **Caso de uso:** soltar um pensamento antes que ele suma.
- **Mudança:** campo primeiro; "Conversar" e "Perguntar" lado a lado; "Falar" e "Soltar" na mesma linha.

### Ajustes
- **Problema:** aba Aparelho com mais de 5.600 px no celular e quase tudo numa coluna só no computador.
- **Caso de uso:** mudar a fonte de leitura ou o som de um aviso sem se perder.
- **Mudança:** índice (Leitura, Avisos, Rituais, IA, Senha, Backup); Leitura em primeiro; colunas
  equilibradas; atalhos com "Testar" e "Copiar" lado a lado.

### Gavetas e barra do topo
- Tarefa: "Para quem" e "Quando" em três blocos lado a lado. Gasto: categorias em três colunas.
- Microfone, cadeado e tema num grupo só, na altura do seletor de pessoa.

## O que ficou para decidir

- **Ideias, mapa:** no computador o mapa é maior que a janela.
- **Ideias, caixa de entrada** e telas de entrada (criar espaço, senha): sem mudanças nesta rodada.
- **Fonte:** Lexend, Atkinson Hyperlegible e "Leitura ampla" já existem em Ajustes > Aparelho. O padrão não
  foi alterado.
