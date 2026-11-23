# ADR-0005: Provedores de IA plugáveis (assinaturas no PC e chaves de API)

- Status: Aceita
- Data da aceitação: 2026-11-23 (aprovada pelo dono do produto; ainda não implementada)
- Data do registro: 2026-11-23
- Referências: [ADR-0004](0004-ia-propoe-operacoes-e-o-codigo-valida.md), [ADR-0006](0006-chave-de-api-guardada-no-cofre-do-aparelho.md), [ADR-0008](0008-app-desktop-como-casca-do-ampara.md)

## Contexto

A pessoa quer usar o que já paga (assinatura do Claude) e talvez outra assinatura (ChatGPT/Codex), ou ligar
uma **chave de API** para ter IA também na **web e no celular**. O app desktop AjudaMental já usa a assinatura do
Claude chamando o **Claude Code** instalado (`claude -p --json-schema`) e expõe ferramentas por MCP local.

Restrições:
- Assinaturas de consumo só são usadas pelos **programas oficiais** delas (CLI no PC), em uso pessoal.
  Não extraímos tokens de login nem oferecemos a assinatura a outras pessoas.
- Na web e no celular não há CLI: só chave de API ou repasse para o PC.
- A organização precisa ser igual em qualquer provedor (ADR-0004).

## Decisão

1. Uma interface única **`ProvedorIA`** com três capacidades: `organizar`, `perguntar`, `concretizar`.
   Todas recebem o mesmo prompt versionado e devolvem o mesmo esquema JSON; o validador é o mesmo.
2. Adaptadores previstos:

| Adaptador | Onde roda | Como | Custo |
|---|---|---|---|
| `claude-assinatura` | PC (exe) | Claude Code oficial, `claude -p` com `--json-schema` | Limite da assinatura |
| `codex-assinatura` | PC (exe) | Codex CLI oficial, `codex exec` com esquema de saída (flags conferidas na implementação) | Limite da assinatura |
| `anthropic-chave` | Web, celular, PC | API da Anthropic com chave da pessoa | Por uso |
| `openai-chave` | Web, celular, PC | API da OpenAI com chave da pessoa | Por uso |
| `repasse-pc` | Web, celular | Cria um pedido na fila; o exe processa com o provedor dele e devolve | Do provedor do PC |

3. Em cada aparelho, a pessoa escolhe **um provedor principal** e, se quiser, um reserva.
   Sem provedor, o módulo funciona sem IA (Caixa de entrada + organização manual).
4. O registro de cada organização guarda provedor e modelo, para comparar qualidade.
5. Adaptadores compatíveis com OpenAI (por exemplo, modelos locais) ficam como evolução, sem compromisso agora.

## Alternativas consideradas

- **Só um provedor (Claude por API):** mais simples, mas obriga custo por uso e ignora as assinaturas.
- **Servidor central com uma chave do app:** permitiria IA para qualquer pessoa, mas o custo e a responsabilidade
  ficam com o dono do app, e o texto pessoal passaria pelo servidor. Fora do escopo.
- **Usar a assinatura direto do navegador:** não existe forma oficial; rejeitada.

## Consequências

- Positivas: liberdade de escolha; usa o que a pessoa já paga; web e celular ganham IA por chave ou repasse.
- Negativas: vários adaptadores para manter e testar; qualidade varia entre modelos (mitigado pelo validador e
  por uma avaliação comum); o repasse só responde com o PC ligado.

## Implementação e verificação

- **Implementado (2026-11-23):** interface `AiProvider` em `src/ai/provider.ts` e o adaptador `claude-assinatura`
  pela ponte do app do PC (`window.amparaDesktop`). Contrato único em `src/domain/ideasPrompt.ts`
  (`organizador@1`, esquema com operação "plana" e campos nulos). Orquestração em `src/store/ideaAi.ts`:
  candidatas por busca local, chamada, validação contra o mapa atual e `applyOrganization`.
- **Verificado:** teste real com a assinatura (Claude Code) criando 3 ideias de uma captura; teste real com o
  Supabase local recebendo as ideias e o registro `claude-assinatura / claude-opus-5-5`; E2E com a ponte simulada.
- **Pendente:** `codex-assinatura`, chaves de API (ADR-0006) e `repasse-pc`.
