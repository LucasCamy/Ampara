# ADR-0014: Marcar compromissos e tarefas pela barra, completados pelo cérebro, com um clique

- Status: Aceita
- Data: 2026-11-25 (pedida pelo dono do produto)
- Referências: [ADR-0001](0001-ideias-separadas-de-tarefas.md), [ADR-0004](0004-ia-propoe-operacoes-e-o-codigo-valida.md), [ADR-0012](0012-cerebro-que-organiza-sozinho-pelo-sentido.md), [ADR-0013](0013-barra-do-pc-e-conversas-no-cofre.md)

## Contexto

A pessoa escreve na barra coisas como "amanhã tenho dentista às 18h". Hoje isso vira um pensamento e ela ainda
precisa abrir a Agenda e preencher tudo. Ela já anotou, em algum momento, o nome e o endereço da dentista. Ela
quer que o Ampara marque e complete com o que já sabe.

Riscos:
- **Data errada:** uma IA pequena erra datas relativas ("amanhã", "sexta").
- **Inventar:** endereço ou nome que nunca foi escrito.
- **Fazer sozinho:** ADR-0001 diz que nada vira tarefa ou compromisso sem a pessoa escolher.

## Decisão

1. **Quando oferecer:** ao guardar pela barra, se o texto tem um dia (hoje, amanhã, um dia da semana, "dia 28",
   "28/11"), a barra mostra uma proposta. Sem dia, segue como pensamento, como sempre.
2. **Dia e hora vêm do código** (`parseWhen`), nunca da IA. Data no passado não vale. Com hora, vira
   **compromisso** (1 hora, se não disser o fim). Sem hora, vira **tarefa** com prazo.
3. **O cérebro completa:** a busca por sentido acha as anotações parecidas, e a IA (contrato `agendar@1`) sugere
   um título curto, o local e uma observação.
4. **Sem inventar:** o local e a observação só entram se aparecem **escritos** na anotação que a IA citou. Se não
   aparecem, são descartados. A barra mostra de onde veio.
5. **Um clique:** "Marcar" cria o compromisso ou a tarefa, com Desfazer. "Só guardar como ideia" segue o caminho
   de sempre. Nada é criado sem o clique (ADR-0001).
6. **Fica ligado à ideia:** se o local veio de uma anotação, a ação é registrada na ideia dela (`idea_actions`),
   sem mudar o estado da ideia.
7. **Agenda com local e observação:** `events` ganha `location` (até 200 letras) e `notes` (até 1000 letras),
   com padrão vazio. O formulário da Agenda mostra e edita os dois.
8. **Choque de horário:** se já houver algo no mesmo horário, a proposta avisa. Ela não impede de marcar.
9. Sem IA, a proposta usa só o código: dia, hora e o texto como título.

## Alternativas consideradas

- **A IA decide a data:** testes com modelos pequenos erram datas relativas. Rejeitada.
- **Marcar sozinho:** quebra a ADR-0001 e tira o controle da pessoa. Rejeitada.
- **Local sem conferir a fonte:** risco de endereço inventado. Rejeitada.

## Consequências

- Positivas: de um texto solto para a agenda em um clique, com o que a pessoa já sabia.
- Negativas: mais duas colunas em `events`; o app antigo do celular ignora os campos novos até atualizar.
- Limites: entende português comum ("amanhã às 18h", "sexta 14h30", "dia 28 às 9"). Frases muito soltas
  ("semana que vem, de tarde") seguem como pensamento.

## Verificação (2026-11-25)

- `whenParse.test.ts`, `ideasSchedule.test.ts` e `ideaAi.test.ts`: dias, horas, faixas, título sem dia e hora,
  conferência contra invenção (um "Dr. Marcos" e uma "Avenida Brasil" inventados foram descartados), compromisso
  ligado à ideia, tarefa sem hora, Desfazer.
- `desktop/test/bar.cjs` (sem IA): proposta, Marcar, Desfazer e "Só guardar como ideia".
- `desktop/test/live-marcar.cjs` (IA local, espaço de teste): depois de uma anotação sobre a dentista,
  "amanhã tenho dentista às 18h" virou uma proposta em 9 a 11 s com "Rua das Flores, 120, sala 3" e a fonte
  "Dentista › Dados da Dentista". A busca considera também a Caixa de entrada e o que ainda não foi organizado:
  no primeiro teste a anotação tinha caído lá e o endereço não aparecia.

