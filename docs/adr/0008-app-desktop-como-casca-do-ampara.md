# ADR-0008: O app desktop (exe) vira uma casca Electron do próprio Ampara

- Status: Aceita
- Data da aceitação: 2026-11-23 (aprovada pelo dono do produto; ainda não implementada)
- Data do registro: 2026-11-23
- Referências: repositório `LucasCamy/AjudaMental` (protótipo desktop atual), [ADR-0005](0005-provedores-de-ia-plugaveis.md)

## Contexto

O protótipo **AjudaMental** (Electron) já tem: bolinha flutuante sempre por cima, atalho global, voz do Windows,
agente de arquivos do PC com confirmação e IA pela assinatura do Claude (Claude Code + MCP local).
Ele guarda ideias em arquivos `.md` locais e tem interface própria. A pessoa quer acessar tudo também no celular
e na web, e "adicionar um exe" que converse com o Ampara.

## Decisão

1. O exe passa a **carregar o próprio Ampara** (mesma interface, mesmo cofre, mesma sincronização) e acrescenta
   só o que o navegador não faz: bolinha e campo rápido, atalho global, bandeja, provedores por CLI
   (`claude-assinatura`, `codex-assinatura`), processamento do `repasse-pc` e ferramentas de arquivos do PC.
2. O Ampara é **empacotado dentro do exe** e servido por protocolo próprio (`app://ampara`), não carregado do site.
   A sincronização com o Supabase continua igual.
3. A ponte nativa (`preload`) expõe **funções de alto nível** (`organizar`, `perguntar`, `arquivos.*`), só para a
   origem empacotada. Mudanças em arquivos pedem confirmação num **diálogo do processo principal**, fora da página.
4. O Ampara detecta a ponte e liga os recursos de desktop; sem ponte (web/celular), eles somem.
5. As ideias `.md` do protótipo são **importadas** uma vez para o módulo Ideias. O código útil do protótipo
   (janela da bolinha, `fstools`, `claudecode`, voz) é reaproveitado na casca.

## Alternativas consideradas

- **Exe separado que escreve direto no Supabase:** duplicaria regras de domínio, privacidade e sincronização,
  com risco de conflito com o cofre e a fila `sync_outbox`. Rejeitada.
- **Exe carregando o site publicado:** sempre atualizado, mas dar acesso a arquivos do PC para uma origem remota
  amplia o impacto de qualquer falha no site ou no proxy. Rejeitada.
- **Tauri:** binário menor, mas exigiria reescrever o que já existe em Electron. Pode ser reavaliado depois.

## Consequências

- Positivas: uma única interface e base de dados em PC, web e celular; o exe fica fino; segurança melhor que
  carregar o site.
- Negativas: cada versão do Ampara precisa de um novo build do exe (atualização automática fica como evolução);
  o build do exe passa a depender do build do Ampara; Electron pesa cerca de 100 MB.
