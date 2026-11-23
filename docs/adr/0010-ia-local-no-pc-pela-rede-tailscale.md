# ADR-0010: IA local no PC da pessoa, servida pela rede Tailscale, para PC e celular

- Status: Aceita
- Data do registro: 2026-11-23
- Data da aceitação: 2026-11-23 (pedida pelo dono do produto)
- Referências: [ADR-0005](0005-provedores-de-ia-plugaveis.md), [ADR-0006](0006-chave-de-api-guardada-no-cofre-do-aparelho.md), [ADR-0008](0008-app-desktop-como-casca-do-ampara.md)

## Contexto

A IA pela assinatura do Claude só existe no app do PC. Para ter IA também no celular, a ADR-0006 previa uma chave
de API paga. A pessoa tem no PC uma RTX 5060 de 8 GB, o LM Studio instalado e o Tailscale ligado em todos os
aparelhos, e prefere não pagar por uso. Ela aceita respostas mais lentas.

Restrições:
- O Ampara publicado é HTTPS: chamar `http://` a partir dele é bloqueado pelo navegador (conteúdo misto).
- A CSP do Ampara só libera origens explícitas em `connect-src`.
- O repositório é público: nome da máquina e da rede Tailscale não entram no código.
- A placa já usa parte da memória com a tela e os programas abertos.

## Decisão

1. **Servidor:** LM Studio no PC, só em `127.0.0.1:1234`, **sem CORS**, com o modelo carregado como `ampara`.
2. **Intermediário próprio** (`desktop/ia-local/proxy.cjs`, só em `127.0.0.1:1235`): repassa apenas
   `GET /v1/models` e `POST /v1/chat/completions`, libera CORS somente para as origens do Ampara
   (`https://ampara.cloudlane.com.br` e `app://ampara`) e limita o tamanho do pedido.
3. **Rede:** `tailscale serve --https=443` publica o intermediário em `https://<pc>.<tailnet>.ts.net`, **só dentro da
   rede Tailscale** da pessoa (nunca `funnel`). Não abre porta no roteador nem muda o firewall.
4. **Ligar com o PC:** tarefa do Windows "Ampara IA local" ao iniciar (antes do login), criada por
   `instalar-servico.ps1`, que a própria pessoa roda como administrador; a senha do Windows fica com o Agendador.
5. **No Ampara:** provedor `ia-local` no formato OpenAI do LM Studio, com `response_format` JSON schema estrito.
   Mesmos contratos (`organizador@1`, `concretizar@1`, `perguntar@1`) e o mesmo validador. Endereço gravado no
   build (`VITE_LOCAL_AI_URL`, variável do GitHub Actions e `.env.desktop`), incluído na CSP como origem exata.
   Escolha por aparelho em Ajustes: Automático (IA local; sem ela, Claude no app do PC), IA local, Claude, Sem IA.
6. **Modelo:** escolhido por avaliação nos contratos reais. Candidatos: Qwen3.5 9B e Gemma 4 E4B (GGUF Q4).

## Alternativas consideradas

- **Chave de API no aparelho (ADR-0006):** rápida e de alta qualidade, mas paga por uso. Continua possível.
- **`--cors` do LM Studio:** libera o modelo para qualquer site aberto no PC. Rejeitado; o intermediário restringe.
- **Abrir a porta para a internet ou `tailscale funnel`:** exporia o modelo publicamente. Rejeitado.
- **Ollama como serviço:** exigiria instalar outro programa; o LM Studio já estava instalado e aceita esquema JSON.
- **Ligar só no login:** mais simples, sem administrador; a pessoa preferiu ligar junto com o PC.

## Consequências

- Positivas: IA grátis no PC e no celular, sem dados saindo da rede da pessoa; o validador segura erros do modelo.
- Negativas: mais lenta que o Claude; depende do PC ligado e do Tailscale conectado no celular; modelo pequeno erra
  mais (o que não passa pelo validador vai para a Caixa de entrada); a placa fica com parte da memória ocupada.
- O primeiro teste, com o Qwen2.5-VL 7B que já estava no PC, levou 40 a 72 s por organização e falhou as referências
  de assunto. Por isso a escolha do modelo é por medição, não por fama.

## Implementação e verificação

- **Modelo escolhido (2026-11-23): Gemma 4 E4B (Q4_K_M)**, carregado com `--gpu max --parallel 1 -c 8192`:
  ~5,6 GB na placa (sobram ~2,5 GB), modelo inteiro na VRAM. A "memória compartilhada" fica em ~0,12 GB fixos
  (área de passagem do CUDA), igual com contexto 4096, 6144 ou 8192.

  | Modelo | Cabe só na placa | Organizar (9) | Compromisso | Tempo (organizar) |
  |---|---|---|---|---|
  | Qwen2.5-VL 7B (já instalado) | não | 0/3 | errou | 40 a 72 s |
  | Qwen3.5 9B | não (vazou 0,24 a 0,42 GB) | 0 (pensa até o limite) | — | 46 s |
  | Qwen3.5 4B, sem "pensar" | sim (3,8 GB) | 4/9 | errou | 2 a 12 s |
  | Qwen3.5 4B, com "pensar" | sim | 0/9 (não responde) | — | 32 s |
  | **Gemma 4 E4B** | **sim** | **7/9** | **acertou** | 15 a 23 s |

- Ajustes vindos da avaliação: exemplo curto no prompt `organizador@1`; o validador aceita o `ref` de um assunto
  novo escrito em `assunto_id` (mesmo assunto, sem ambiguidade); uma segunda tentativa automática quando nada foi
  encaixado por erro de formato (dúvida de verdade não repete). Os Qwen3.5 baixados para o teste foram apagados.
- **Verificado:** intermediário (só Ampara, só rotas de conversa, limite de tamanho); `tailscale serve` com HTTPS
  na rede privada; teste real do app do PC organizando pela IA local via Tailscale (3 ideias em 24 s).
- **Pendente:** a pessoa rodar `instalar-servico.ps1` como administrador; variável `LOCAL_AI_URL` no GitHub para o
  app publicado (celular e web); teste no celular com o Tailscale ligado.
