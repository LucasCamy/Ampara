# 01. Produto, Escopo e Priorização MoSCoW — App “Nós”

## 1. Problema Principal e Resultado Desejado

### O Problema Real (A Vida a Dois com TDAH)
Ferramentas tradicionais de produtividade (Todoist, Notion, Apple Reminders) e de finanças (Splitwise, planilhas, apps de banco) falham para casais neurodivergentes (especialmente com TDAH) por 4 motivos críticos:
1. **Paralisia Executiva por Excesso de Informação:** Abrir um app e ver 40 tarefas atrasadas, um calendário lotado e gráficos financeiros complexos gera bloqueio imediato e fechamento do app.
2. **Cegueira Temporal e "Falso Concluído" em Remédios:** A pessoa recebe o alarme do remédio, desliza a notificação pensando *"vou pegar água na cozinha e já tomo"* e, 15 segundos depois, esquece completamente se tomou ou não.
3. **Atrito Emocional na Divisão de Carga Mental:** Pedir ajuda pelo WhatsApp (*"Você pagou a luz?"*, *"Consegue comprar ração?"*) mistura-se com conversas do dia a dia, esquece-se no histórico e muitas vezes soa como cobrança ou gera culpa em quem travou num dia de baixa dopamina.
4. **Tudo ou Nada na Privacidade Financeira:** Ou o casal usa uma planilha única onde um sente que está sendo vigiado em cada café que compra, ou usa controles 100% separados e perde a conta de quem pagou o mercado, a farmácia e as contas da casa.

### Resultado Desejado (Visão do Produto)
O **“Nós”** é uma central de **co-regulação, rotina e finanças leves para o casal**, onde:
- **Capturar qualquer coisa leva menos de 3 segundos** (via Dock Flutuante no app ou Atalho do iPhone na tela bloqueada).
- **A tela inicial (`Hoje`) responde em 1 segundo: *"O que precisa da minha atenção agora?"***, ocultando o ruído futuro quando o usuário sinaliza que está com a bateria mental baixa.
- **Cuidar um do outro é estruturado e sem culpa:** é possível enviar tarefas, lembretes gentis e pedidos de ajuda claros (*"Faz comigo?"* vs. *"Assume por mim hoje?"*).
- **As finanças respeitam a individualidade e a parceria:** separação clara entre `Meu`, `Dela` e `Do Casal`, com **botão de ativar/desativar a visualização mútua dos gastos pessoais** e proteção para presentes/surpresas.

---

## 2. Usuários, Papéis e Matriz de Permissões

O sistema é desenhado para um **Espaço de Casal (`Couple Space`)** composto exatamente por **2 membros parceiros** em igualdade de papéis (sem hierarquia de "administrador vs. convidado" no uso diário), pareados via código/link de convite único.

### Regra de Visibilidade e Permissão por Domínio

| Tipo de Dado / Item | Escopo `Meu` (Pessoal A) | Escopo `Dela` (Pessoal B) | Escopo `Nós` (Compartilhado) |
|---|---|---|---|
| **Tarefas e Demandas** | Criador vê e edita. Parceiro só vê se o criador enviar/delegar ou marcar como visível no dia. | Criadora vê e edita. Parceiro só vê se ela enviar/delegar ou marcar como visível no dia. | Ambos veem, editam, concluem e podem usar o botão **"Passar o bastão / Pedir ajuda"**. |
| **Agenda / Eventos** | Visível para o dono (e opcionalmente como *"Ocupado"* ou visível na agenda do casal). | Visível para a dona (e opcionalmente como *"Ocupada"* ou visível na agenda do casal). | Sincronizado na agenda de ambos com lembretes independentes para cada um. |
| **Remédios e Rotinas** | Privado por padrão. Se a opção **"Rede de Apoio do Par"** estiver ativa naquele remédio, o parceiro vê o status (`Tomado` / `Atrasado +30m`). | Privado por padrão. Se a opção **"Rede de Apoio do Par"** estiver ativa naquele remédio, o parceiro vê o status (`Tomado` / `Atrasado +30m`). | Rotinas conjuntas (ex.: passear com pet, lixo, vitaminas) visíveis e confirmáveis por qualquer um dos dois. |
| **Finanças (`Do Casal`)** | — | — | **100% Transparente para ambos:** quem pagou, valor total, regra de divisão (`50/50`, `Proporcional`, `100% adiantado`) e impacto no saldo de encontro de contas. |
| **Finanças Pessoais (`Meu` / `Dela`)** | Controlado pelo **Toggle de Transparência Mútua** (ver abaixo). | Controlado pelo **Toggle de Transparência Mútua** (ver abaixo). | — |

### O Toggle de Transparência Financeira ("Ver um do outro")
Conforme definido para o projeto, cada usuário possui uma chave de privacidade que pode ser ativada ou desativada a qualquer momento em `Ajustes > Privacidade Financeira` (ou direto no topo da aba Finanças):
1. **Modo Privado (Desativado):** Os lançamentos marcados como `Meu` ficam visíveis apenas para você (o parceiro vê apenas os gastos `Do Casal` e o saldo de acerto entre vocês).
2. **Modo Transparente (Ativado):** Permite que o parceiro visualize (em modo **somente leitura**) a sua aba de gastos pessoais e seu resumo de orçamento livre do mês, facilitando o planejamento financeiro conjunto quando vocês quiserem revisar as contas juntos.
3. **Exceção de "Modo Surpresa / Presente" (`🔒 Ocultar do par`):** Mesmo quando o *Modo Transparente* está **Ativado**, qualquer gasto pessoal pode receber a marcação `🔒 Presente / Surpresa`. Esse item específico aparece apenas no seu cálculo de saldo total, mas sua descrição e categoria ficam ocultas para o parceiro (evitando estragar surpresas de aniversário, Dia dos Namorados, etc.).

---

## 3. O que é Indispensável no MVP vs. Versões Futuras

### Indispensável no MVP (Versão 1.0 — Uso Real Diário do Casal)
- Pareamento das duas contas (Espaço do Casal) + funcionamento 100% offline com sincronização automática quando houver rede.
- Tela **"Hoje (Foco TDAH)"** unificando: Próxima Ação imediata, Remédios do turno, Tarefas do dia e Seletor de Bateria Mental (`🔋 Cheia`, `⚡ Média`, `🪫 Sobrecarga`).
- Gestão de **Tarefas** (`Meu`, `Dela`, `Nós`) com envio/delegação para o parceiro e botão **"Pedir Ajuda"** em 3 cliques.
- **Alarmes de Remédios e Rotinas** com confirmação em 2 estágios (`✓ Já engoli` vs. `⏳ Pegando água +5 min`), controle simples de estoque da caixa e alerta opcional de Rede de Apoio se atrasar > 30 min.
- **Agenda** com visualização por **Dia**, **Semana** e **Mês**.
- **Finanças Simples** com lançamentos `Meu`, `Dela` e `Do Casal`, toggle de ativar/desativar visualização mútua, regra de divisão padrão configurável (ex.: 50/50 ou proporcional) e **Saldo de Encontro de Contas** (*"Quem deve quanto a quem neste mês"*).
- **Dock Flutuante de Captura Rápida** no app + suporte aos **4 Atalhos Rápidos no iPhone** (via URL Scheme / App Intents acionáveis pelo app Atalhos do iOS).

### Fica para Versões Futuras (Pós-MVP)
- **v1.1:** Widgets interativos na Tela Bloqueada e Tela Inicial do iOS, Live Activities na Dynamic Island para contagem regressiva de rotina/foco conjunto (*Body Doubling Timer*), anexos de comprovantes/fotos de receitas médicas.
- **v2.0:** Importação automática de notificações bancárias/OFX, listas de mercado colaborativas com organização por corredor, metas financeiras de longo prazo ("Caixinhas do Casal" com projeção) e gamificação cooperativa sem punição de perda de ofensiva (*streak forgiveness* para TDAH).

---

## 4. Priorização MoSCoW

| Categoria | Itens | Justificativa |
|---|---|---|
| **MUST HAVE** *(Obrigatório no MVP)* | • Banco local SQLite *offline-first* com fila de sync.<br>• Visão `Hoje` (Próxima Ação antes do histórico).<br>• Tarefas `Meu` / `Dela` / `Nós` + Pedido de Ajuda ao par.<br>• Remédios com alarme local `Time-Sensitive` e snooze de 5 min (*"Pegando água"*).<br>• Agenda Dia / Semana / Mês.<br>• Finanças `Meu` / `Dela` / `Do Casal` com cálculo de saldo entre o casal e Toggle de Transparência.<br>• 4 Atalhos rápidos integrados ao app Atalhos do iPhone. | Sem esses itens, o app não cumpre a promessa central de substituir controles fragmentados e apoiar o TDAH offline e rápido. |
| **SHOULD HAVE** *(Importante, entra logo após a espinha dorsal)* | • Seletor de **Bateria Mental** (`100% / 50% / 10%`) que reduz a densidade da tela.<br>• Flag `🔒 Presente / Surpresa` em gastos pessoais.<br>• Alerta automático ao parceiro quando remédio crítico atrasa > 30 min.<br>• Aviso de estoque baixo de remédio (ex.: *"Restam 5 comprimidos — comprar receita"*).<br>• Despesas fixas recorrentes do casal (aluguel, luz, internet) com status `Previsto` (tracejado) → `Pago` (sólido). | Eleva drasticamente a retenção e resolve dores específicas de casais com TDAH (esquecer de renovar receita e contas fixas). |
| **COULD HAVE** *(Desejável se sobrar tempo ou na v1.1)* | • Timer de *Body Doubling* (cronômetro de 25 min para o casal fazer uma tarefa chata junto).<br>• Áudio curto / nota de voz rápida anexada à tarefa enviada ao parceiro.<br>• Widgets nativos na tela bloqueada do iPhone.<br>• Metas financeiras compartilhadas (*Caixinhas: Viagem, Casa*). | Ótimos diferenciais de engajamento, mas o app já resolve a dor central sem eles no dia 1. |
| **WON'T HAVE** *(Fora de escopo no momento)* | • Integração direta Open Finance / conexão automática com senhas de bancos.<br>• Suporte a grupos com mais de 2 pessoas (repúblicas/equipes).<br>• Gráficos contábeis complexos (DRE, investimentos em bolsa, múltiplos cartões com fechamento automático de fatura).<br>• Punição por falha de hábito (zerar contadores com mensagens negativas). | Aumentam a complexidade técnica/regulatória em 10x ou geram frustração e abandono em pessoas com TDAH. |

---

## 5. Métricas de Sucesso e Critérios de Aceite do Produto

### Métricas de Sucesso (Para validar no uso de vocês dois)
1. **Tempo de Captura (`Time-to-Capture`):** **≤ 3 segundos** desde abrir o app (ou acionar o Atalho do iPhone) até salvar uma tarefa rápida, confirmar um remédio ou registrar um gasto.
2. **Confiabilidade de Medicação:** **≥ 95% de confirmação real** dos remédios diários, eliminando a dúvida *"Será que eu já tomei hoje?"*.
3. **Zero Perda Offline:** **100% das ações** feitas no metrô, elevador ou modo avião são gravadas localmente em `< 50ms` e sincronizadas sem duplicação quando a conexão retorna.
4. **Clareza Financeira Mensal:** Fechar o acerto do mês entre o casal em **menos de 2 minutos**, sabendo exatamente o saldo líquido entre os dois sem abrir planilhas.

### Critérios Gerais de Aceite (Definition of Done)
- [ ] Qualquer item criado offline aparece imediatamente na UI com indicador sutil de sincronização pendente e sincroniza automaticamente ao reconectar.
- [ ] Nenhum estado na interface depende exclusivamente de cor: todos combinam **Ícone Geométrico + Rótulo + Cor + Estilo de Borda** (sólida para realizado, tracejada para previsto/pendente).
- [ ] O toggle **"Permitir que meu par veja meus lançamentos pessoais"** reflete instantaneamente nas permissões de leitura do parceiro, respeitando a ocultação de itens marcados como `🔒 Presente / Surpresa`.
- [ ] Os 4 fluxos de Atalhos do iOS (`+ Tarefa`, `+ Gasto`, `✓ Remédio`, `🆘 Ajuda`) podem ser disparados sem navegar por submenus.
