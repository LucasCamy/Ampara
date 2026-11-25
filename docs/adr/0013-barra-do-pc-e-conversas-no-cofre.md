# ADR-0013: Barra escondida no lugar da bolinha e conversas guardadas no cofre

- Status: Aceita
- Data: 2026-11-25
- Referências: [ADR-0001](0001-ideias-separadas-de-tarefas.md), [ADR-0004](0004-ia-propoe-operacoes-e-o-codigo-valida.md), [ADR-0008](0008-app-desktop-como-casca-do-ampara.md), [ADR-0009](0009-dados-das-ideias-privados-no-supabase.md)

## Contexto

A pessoa (TDAH e dislexia) tinha dois apps no PC: o Ampara e o protótipo AjudaMental. Ela quer um só, o Ampara, e
aprovou a direção do protótipo: uma barra de escrita estilo PowerToys Run, **escondida** até `Ctrl+Shift+Espaço`,
layout enxuto, e conversas salvas com botão **Extrair**. O protótipo guardava conversas em arquivos `.md` soltos
na pasta de documentos, fora do cofre e sem sincronização.

## Decisão

1. **Barra no lugar da bolinha** (`desktop/bar.*`). Janela própria, sem moldura, por cima, escondida ao abrir o
   exe. `Ctrl+Shift+Espaço` (ou a bandeja) mostra; some ao clicar fora (exceto enquanto a voz do Windows dita) e com
   Esc. Tem campo, microfone (Win + H), "Ver conversas" e "Abrir o Ampara completo". A posição é arrastável e salva.
2. **A barra não grava nada.** Ela só envia o texto ao processo principal, que o entrega à janela do Ampara
   (`takeBarSubmit`). Quem grava é o app, no cofre cifrado. Se o cofre está fechado, o texto espera no exe até
   o login. Enter guarda como ideia (captura atual de Ideias); `Ctrl+Enter` abre uma conversa.
3. **Painel compacto** de 480 px e até 580 px de altura, aberto logo abaixo da barra (acima se não couber), com
   três abas só de texto: Soltar, Conversa, Conversas. Uma coisa por vez, a última resposta em destaque e o resto em
   "Ver mais".
4. **Conversas ficam no cofre e na nuvem**, como coleção `ideaConversations` (tabela `idea_conversations`):
   privadas de quem conversou (`owner_id`), com a mesma política por comando, `synced_at` e `keep_newest` das
   outras tabelas `idea_*`, e `purgeUnauthorized` (o aparelho do par nunca as guarda). Não são arquivos `.md`:
   o cofre já cifra, sincroniza entre aparelhos e entra no backup.
5. **A IA só conversa.** A resposta é um texto curto num esquema `{ resposta }`, pelo mesmo provedor de sempre
   (`runStructured`). Nenhuma ferramenta, nenhum acesso a arquivos.
6. **Extrair não grava ideias por conta própria.** Transforma a conversa numa captura (`Eu: ... Ampara: ...`) e ela
   passa pelo organizador e pelo validador (ADR-0004). Decisões e passos viram anotações em ideias; **nada vira
   tarefa sozinho** (ADR-0001): a pessoa concretiza no fluxo de sempre. A conversa guarda `extractedCaptureId`
   para mostrar "extraída para as Ideias". A captura cabe em 8000 caracteres: passando disso, ficam as falas
   mais novas, inteiras.

## Alternativas consideradas

- **`.md` em Documentos (como o protótipo):** fora do cofre, sem cifra, sem sincronização e fora da privacidade do
  domínio. Rejeitada.
- **Conversa só no aparelho (sem tabela):** mais simples, mas some ao trocar de PC e foge da regra de que Ideias são
  do cofre e da nuvem. Rejeitada.
- **Extrair gerando tarefas direto:** quebra o ADR-0001. Rejeitada.
- **Barra gravando no cofre por conta própria:** duplicaria a sessão e a cifra fora do app. Rejeitada.

## Consequências

- Positivas: uma só interface, dados privados e sincronizados, sem regra nova de privacidade.
- Negativas: mais uma tabela no ciclo de sincronização (9 consultas de ideias por ciclo; ver pendência de
  sincronizar `idea_*` só para quem usa Ideias, em `IMPLEMENTATION_PLAN.md`); a conversa só avança com o Ampara
  aberto e o cofre destravado.
- **Não incluído:** o agente de arquivos do PC (`fstools` e `claudecode` do protótipo). Exige confirmação por
  diálogo do processo principal e revisão de segurança própria (ADR-0008, item 3). Fica como pendência.
