# ADR-0001: Ideias são separadas de tarefas e só viram ação por escolha da pessoa

- Status: Aceita
- Data da aceitação: 2026-11-23 (aprovada pelo dono do produto; ainda não implementada)
- Data do registro: 2026-11-23
- Referências: [08-ideias-segundo-cerebro.md](../08-ideias-segundo-cerebro.md)

## Contexto

O Ampara já tem captura rápida (`quickParse`) que transforma texto em **tarefa, gasto ou compra** na hora.
A pessoa pediu um lugar para pensamentos que **ainda não são ação**: ideias, desejos, preocupações e reflexões.
Ela quer guardar esses pensamentos, ver sentido neles depois e transformar em tarefa só quando algo se concretizar.

Transformar todo pensamento em tarefa cria lista infinita e culpa, o oposto do que o Ampara busca para TDAH
("próxima ação antes do histórico", modo sobrecarga).

## Decisão

1. Criar o módulo **Ideias** como entidade própria, separada de `tasks`, `events` e lembretes.
2. A ideia tem ciclo de vida próprio: `SOLTA`, `AMADURECENDO`, `VIROU_ACAO`, `GUARDADA`.
3. **Concretizar é sempre explícito:** o botão "Isso vai acontecer" gera uma proposta de tarefa (com passos),
   evento ou lembrete. Nada é criado sem a confirmação da pessoa.
4. A ação criada guarda o vínculo com a ideia (`idea_actions`), e a ideia continua existindo.
5. A captura de ideia **nunca espera a IA**: grava primeiro, organiza depois (ou vai para a Caixa de entrada).
6. A captura rápida atual (gasto, compra, tarefa) continua como está. O campo único decide o destino:
   regras locais primeiro; o que não for gasto/compra/tarefa clara vira captura de ideia.

## Alternativas consideradas

- **Ideia como tarefa com status "rascunho":** reaproveita a tabela `tasks`, mas mistura pensamentos com
  compromissos no Hoje, na Agenda e na carga semanal. Rejeitada pelo impacto no foco.
- **Notas livres sem ciclo de vida:** simples, mas não ajuda a ver o que amadureceu nem a agir. Rejeitada.

## Consequências

- Positivas: o Hoje continua limpo; pensamentos têm um lugar seguro; a origem de cada tarefa fica rastreável.
- Negativas: novo módulo, novas tabelas e telas; a pessoa precisa aprender a diferença entre "soltar ideia"
  e "criar tarefa" (mitigado pelo campo único que decide sozinho, com prévia).

## Implementação e verificação

- **Implementado (2026-11-23):** botão "Isso vai acontecer" no cartão da ideia abre a gaveta de concretizar
  (`ConcretizeSheet`). Com IA, o contrato `concretizar@1` (`src/domain/ideasConcretize.ts`) sugere UMA forma:
  tarefa com até 3 micro-passos (o primeiro em menos de 5 minutos) ou compromisso, só quando há dia e hora ditos e
  no futuro; fora disso vira tarefa. Sem IA, a proposta é uma tarefa sem data com o nome da ideia. A pessoa edita e
  confirma; `concretizeIdea` cria a tarefa (pessoal e privada) ou o compromisso, grava `idea_actions` e marca
  `VIROU_ACAO` numa operação com Desfazer. A ideia mostra o que virou; a tarefa mostra "Veio da ideia" só para quem
  escreveu.
- **Verificado:** 8 testes de unidade, 2 E2E (à mão e com IA simulada), teste real com a assinatura (tarefa com
  micro-passos sem data; compromisso quando a anotação tinha dia e hora).
