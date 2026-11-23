# ADR-0006: Chave de API guardada no cofre do aparelho, com chamada direta ao provedor

- Status: Aceita
- Data da aceitação: 2026-11-23 (aprovada pelo dono do produto; ainda não implementada)
- Data do registro: 2026-11-23
- Referências: [ADR-0005](0005-provedores-de-ia-plugaveis.md), [SECURITY.md](../../SECURITY.md)

## Contexto

Para ter IA na web e no celular sem o PC ligado, a pessoa vai colar uma chave de API. É preciso decidir
**onde a chave fica** e **por onde a chamada passa**. O Ampara já tem cofre cifrado no aparelho
(PBKDF2 + AES-GCM, DEK por espaço e slot por pessoa) e CSP restrita (`script-src 'self'`).
No modo Casal, duas pessoas podem abrir o mesmo cofre no mesmo aparelho, cada uma com sua senha.

## Decisão

1. A chave fica **só no aparelho**, dentro do cofre, **cifrada com uma chave da própria pessoa**
   (derivada do slot dela), para que o par no mesmo aparelho não consiga usá-la.
2. A chave **não sincroniza** e **não vai para o Supabase**. Em outro aparelho, a pessoa cola de novo.
3. A chamada vai **direto do navegador para o provedor** (Anthropic ou OpenAI, no modo de acesso pelo
   navegador que cada SDK documenta). A CSP ganha `connect-src` **apenas** para o domínio do provedor escolhido.
4. A chave só fica decifrada **em memória** com o cofre aberto; bloquear o cofre a esquece.
5. Teto de gasto: contador mensal no aparelho com aviso e recomendação de limite no painel do provedor.
6. A chave nunca aparece em logs, backups `.ampara` ou mensagens de erro.

## Alternativas consideradas

- **Guardar a chave no servidor (Edge Function/worker que chama o provedor):** permitiria organizar com todos os
  aparelhos desligados e a partir de lembretes, mas coloca a custódia da chave e o texto pessoal no servidor,
  aumenta infraestrutura e risco de abuso. Fica para uma ADR futura, se houver necessidade real.
- **Sincronizar a chave cifrada entre aparelhos:** conveniente, mas o Ampara ainda não distribui chaves pessoais
  entre aparelhos com segurança. Rejeitada por agora.

## Consequências

- Positivas: a chave e o texto não passam pelo servidor do Ampara; segue o modelo de cofre existente.
- Negativas: uma falha de XSS poderia ler a chave em memória (mitigado pela CSP estrita e pela abertura mínima de
  `connect-src`); a pessoa cola a chave em cada aparelho; o gasto depende do provedor e do limite configurado lá.
