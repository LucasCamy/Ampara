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

## Implementação e verificação

- **Implementado (2026-11-23) em `desktop/`:** Electron servindo o build web por `app://ampara` (origem padrão
  e segura: IndexedDB e WebCrypto funcionam), ponte `amparaDesktop` com `status`, `runStructured` e atalho
  `Ctrl+Shift+Espaço` que abre o campo das Ideias. Só páginas de `app://ampara` chamam a IA; o pedido tem limite
  de tamanho; o Claude Code roda sem ferramentas, plugins, MCP ou histórico (`--safe-mode --tools ""`).
- **Nuvem sem abrir o servidor:** o gateway de produção continua sem CORS. O exe acrescenta os cabeçalhos de CORS
  apenas nas respostas do endereço da nuvem gravado no build (`desktop.json`, a partir de `.env.desktop`),
  inclusive o preflight. Navegadores comuns continuam bloqueados pelo servidor.
- **Diferenças do plano:** sem service worker em `app://` (lembretes Web Push ficam no celular: `pushSupport`
  devolve `unsupported` fora de http/https). Não havia ideias `.md` no protótipo para importar; o AjudaMental foi
  desinstalado do PC da pessoa em 2026-11-23.
- **Bolinha (2026-11-23):** janela separada, transparente, sempre por cima e sem roubar o foco (`bubble.html`,
  ponte própria só com mover/abrir/menu). Clique ou `Ctrl+Shift+Espaço` abre o **painel compacto** (440 px, por cima,
  só "O que está na sua cabeça?" e "Abrir o Ampara completo"); de novo, esconde. Arrastar move e a posição fica
  salva. Fechar a janela só esconde; Sair fica no menu da bolinha e da bandeja. "Falar" usa a digitação por voz
  do Windows (Win + H). Verificado em `desktop/test/bubble.cjs`.
- **Bolinha substituída (2026-11-25):** a bolinha foi trocada pela barra escondida e as conversas entraram no cofre, ver [ADR-0013](0013-barra-do-pc-e-conversas-no-cofre.md). O texto acima sobre a bolinha vale como histórico.
- **Verificado:** `desktop/test/live.cjs` (sem nuvem) e `desktop/test/live-cloud.cjs` (Supabase do Docker),
  ambos com a assinatura real.
