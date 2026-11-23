# ADR-0009: Dados das ideias privados por pessoa, no mesmo modelo de sincronização

- Status: Aceita
- Data da aceitação: 2026-11-23 (aprovada pelo dono do produto; ainda não implementada)
- Data do registro: 2026-11-23
- Referências: [supabase/schema.sql](../../supabase/schema.sql), [SECURITY.md](../../SECURITY.md), [AGENTS.md](../../AGENTS.md)

## Contexto

Ideias são o conteúdo mais íntimo do app (preocupações, reflexões, planos). O Ampara sincroniza pelo Supabase com
RLS, cofre cifrado no aparelho e fila `sync_outbox`; a sincronização **não** é criptografia de ponta a ponta.
No modo Casal, por padrão, várias coisas são visíveis ao par.

## Decisão

1. Novas tabelas no `schema.sql` (idempotente): `idea_areas`, `idea_topics`, `ideas`, `idea_captures`,
   `idea_notes`, `idea_links`, `idea_actions`, `idea_ai_log` e `ai_jobs` (fila do `repasse-pc`).
2. **Privadas por pessoa**, inclusive no Casal: leitura e escrita só por `owner_id = auth.uid()` dentro do espaço.
   Compartilhar uma ideia com o par fica para uma decisão futura.
3. Políticas separadas por operação (nunca `for all`), espelho em `e2e/fake-supabase.ts` e casos em
   `supabase/tests/validate.sql`, como manda o AGENTS.md.
4. No aparelho, as ideias entram no cofre e na fila `sync_outbox` como as demais coleções; escrita assíncrona
   sempre com `dataStore.set((cur) => ...)`.
5. Limites no banco: captura até 8000 caracteres, anotação até 4000, vocabulários com `check`.
6. `ai_jobs` guarda só referências (`captura_id`, tipo, estado) e o resultado validado; quem processa é o próprio
   dono, em outro aparelho dele.

## Alternativas consideradas

- **Criptografia de ponta a ponta só para ideias:** como a IA roda no cliente (PC ou navegador), o servidor não
  precisaria ler o texto. Porém o Ampara ainda não distribui uma chave pessoal entre os aparelhos da mesma pessoa,
  e recuperar acesso ficaria difícil. Fica como **evolução recomendada**, numa ADR própria.
- **Ideias só locais, sem nuvem:** máxima privacidade, mas perde o "acessar de qualquer lugar". Rejeitada.
- **Visíveis ao par por padrão:** coerente com outras áreas do Casal, mas inadequado para pensamentos íntimos.

## Consequências

- Positivas: segue padrões já testados do projeto; privacidade forte por RLS; o repasse ao PC funciona.
- Negativas: o operador do servidor consegue ler o texto (mesmo modelo do resto do app, a documentar no
  SECURITY.md); novas tabelas aumentam o trabalho de migração, backup (`backup:check`) e testes de RLS.
