# 04. Arquitetura Técnica, Offline-First, Modelo de Dados e Integração iOS

Este documento detalha as decisões técnicas para você pesquisar e validar como construir o **“Nós”** garantindo funcionamento **100% offline**, **sincronização segura entre os dois aparelhos**, **notificações locais de alta prioridade** e **Atalhos rápidos no iPhone**.

---

## 1. Comparativo de Plataforma (Guia para sua Pesquisa)

| Critério Técnico | Opção 1: **React Native + Expo (Prebuild/CNG)** *(Recomendada)* | Opção 2: **PWA (Web App Instalado no iOS)** | Opção 3: **Swift / SwiftUI Nativo Puro** |
|---|---|---|---|
| **Linguagem / Stack** | TypeScript + React (mesma mentalidade web) | TypeScript + React + Vite | Swift 6 + SwiftUI |
| **Banco Offline Real** | **Excelente:** SQLite nativo (`expo-sqlite` / `op-sqlite`) sem risco de limpeza pelo iOS | **Arriscado no iOS:** o Safari pode limpar `IndexedDB` após dias sem uso ou pouca memória | **Excelente:** SwiftData / CoreData / SQLite |
| **Alarmes Locais Offline (Remédios)** | **100% Confiável:** Agenda gatilhos locais no `UNUserNotificationCenter` do iOS mesmo sem internet | **Limitado:** Web Push no iOS exige internet e servidor; não agenda alarme local offline confiável | **100% Confiável:** Acesso total ao `UNUserNotificationCenter` e `AlarmKit` |
| **Botões na Notificação (`✓ Já engoli` / `+5m`)** | **Nativo:** `Notification Categories` permitem responder na tela bloqueada sem abrir o app | **Fraco:** Não suporta ações nativas ricas em background offline no iOS | **Nativo:** Total suporte |
| **Atalhos do iPhone (`Shortcuts`)** | **Total:** via URL Scheme (`nosapp://...`), API REST + `expo-apple-targets` (`AppIntents`) | **Parcial:** Atalho do iOS só consegue abrir uma aba do Safari ou chamar API se tiver internet | **Total:** `AppIntents` nativo |
| **Curva de Aprendizado** | Baixa/Média para quem já conhece React/TS | Muito baixa | Alta (exige aprender ecossistema Xcode/Swift) |

### Recomendação Consolidada da Stack
- **Mobile App:** `React Native` + `Expo SDK 52+` (usando *Development Builds / Prebuild*) + `Expo Router` + `NativeWind v4` (Tailwind no React Native seguindo nosso `tokens.css`).
- **Armazenamento Local (Offline-First):** `expo-sqlite` (ou `op-sqlite`) + `Drizzle ORM` (migrations tipadas no aparelho) + `MMKV` (para configurações ultra-rápidas como tema e toggles locais).
- **Backend & Sincronização:** `Supabase` (PostgreSQL + Auth + Row-Level Security + Realtime WebSockets + Edge Functions para disparar Push ao parceiro).
- **Motor de Notificações Locais:** `Notifee` ou `expo-notifications` com `interruptionLevel: 'timeSensitive'`.

---

## 2. Diagrama de Arquitetura (Offline-First & Sincronização)

```mermaid
flowchart TB
    subgraph iPhoneA ["📱 iPhone (Você) — App 'Nós'"]
        UIA["Interface React Native (Tokens + Sheets 60fps)"]
        ShortcutsA["Atalhos do iOS (Action Button / Back Tap / Siri)"]
        LocalNotifA["UNUserNotificationCenter (Alarmes Locais Offline)"]
        SQLiteA[("SQLite Local (Drizzle)\nLeitura/Escrita < 10ms")]
        OutboxA["Fila Outbox de Mutação\n(mutation_queue)"]

        ShortcutsA -->|"URL Scheme / AppIntent"| UIA
        UIA <--> SQLiteA
        SQLiteA --> LocalNotifA
        SQLiteA --> OutboxA
    end

    subgraph Cloud ["☁️ Nuvem (Supabase — Sincronização & Segurança)"]
        SupaAuth["Supabase Auth + Pareamento do Casal"]
        SupaDB[("PostgreSQL + RLS\n(Regras de Privacidade Meu/Dela/Nós)")]
        SupaRealtime["Supabase Realtime\n(Delta Sync imediato)"]
        SupaEdge["Edge Function\n(Push de Ajuda / Atraso de Remédio)"]
        APNs["Apple Push Notification service (APNs)"]

        SupaDB <--> SupaRealtime
        SupaDB --> SupaEdge --> APNs
    end

    subgraph iPhoneB ["📱 iPhone (Sua Namorada) — App 'Nós'"]
        SQLiteB[("SQLite Local")]
        UIB["Interface React Native"]
        SQLiteB <--> UIB
    end

    OutboxA ===>|"Push Mutações (Quando Online)"| SupaDB
    SupaRealtime ===>|"Pull Deltas (updated_at > last_sync)"| SQLiteB
    APNs -.->|"Push Remoto (SOS / Lembrete)"| iPhoneB
```

---

## 3. Estratégia Offline-First e Resolução de Conflitos

### Como funciona a leitura e escrita sem internet:
1. **A UI nunca espera pela rede:** Toda ação (`+ Tarefa`, `+ Gasto`, `✓ Tomei remédio`) grava **primeiro** na tabela correspondente do `SQLite` local e insere um registro na tabela local `sync_outbox` (`id`, `entity_type`, `entity_id`, `operation`, `payload_json`, `hlc_timestamp`, `status`).
2. **Sincronização de Subida (`Push Outbox`):** Quando o `NetInfo` detecta conexão (ou quando o app vai para primeiro plano), um worker envia os lotes da `sync_outbox` para o Supabase de forma **idempotente** (usando `UUID v7` gerado no cliente).
3. **Sincronização de Descida (`Pull Delta + Realtime`):** O app busca apenas registros onde `server_updated_at > last_pulled_at` e aplica no SQLite local. Enquanto ambos estão com o app aberto, o `Supabase Realtime` entrega mudanças em `< 300ms`.

### Regras de Resolução de Conflitos
- **Conflito em Conclusão de Tarefa / Dose de Remédio:** **Vence o estado Positivo (`completed` / `taken`)**. Se você marcou a rotina compartilhada como feita offline às 09:00 e ela também marcou às 09:05, o sistema mantém o registro de conclusão das 09:00 sem duplicar o desconto de estoque.
- **Conflito em Edição de Texto / Valor de Gasto:** **Last-Write-Wins (LWW) por coluna**, preservando um registro na tabela `audit_history` para que nada se perca silenciosamente.

---

## 4. Modelo de Dados Completo (ER e Tabelas)

```mermaid
erDiagram
    COUPLES ||--|{ PROFILES : "possui 2 membros"
    COUPLES ||--o{ TASKS : "organiza"
    COUPLES ||--o{ EVENTS : "agenda"
    COUPLES ||--o{ MEDICATIONS : "monitora"
    COUPLES ||--o{ TRANSACTIONS : "registra"
    COUPLES ||--o{ HELP_REQUESTS : "apoia"
    MEDICATIONS ||--o{ MEDICATION_LOGS : "histórico de doses"

    COUPLES {
        uuid id PK
        string invite_code UK "Código de 6 dígitos"
        string split_mode "50_50 | PROPORTIONAL | CUSTOM"
        numeric partner_a_Ratio "Ex: 0.50"
        numeric partner_b_Ratio "Ex: 0.50"
        timestamptz created_at
    }

    PROFILES {
        uuid id PK
        uuid couple_id FK
        string display_name
        string energy_level "FULL | MEDIUM | OVERLOAD"
        boolean share_personal_finances "Toggle: Ver gastos um do outro"
        string push_token
        timestamptz updated_at
    }

    TASKS {
        uuid id PK
        uuid couple_id FK
        uuid created_by FK
        uuid assigned_to FK "Null se for de ambos"
        string visibility_scope "ME | PARTNER | US"
        string title
        string effort_level "QUICK_5M | FOCUS"
        string status "PENDING | DONE | ARCHIVED"
        date due_date
        timestamptz completed_at
        uuid completed_by FK
        timestamptz updated_at
    }

    MEDICATIONS {
        uuid id PK
        uuid couple_id FK
        uuid owner_id FK "De quem é o remédio ou rotina"
        string visibility_scope "PRIVATE | COUPLE_SUPPORT"
        string name "Ex: Venvanse 30mg"
        string dosage "1 cápsula"
        string schedule_times_json "Ex: ['08:30', '14:00']"
        int stock_count "Estoque atual na caixa"
        int low_stock_threshold "Alerta quando <= 5"
        boolean notify_partner_on_delay "Rede de Apoio (+30m)"
        int delay_minutes_threshold "Padrão: 30"
    }

    MEDICATION_LOGS {
        uuid id PK
        uuid medication_id FK
        date scheduled_date
        string scheduled_time
        string status "PENDING | SNOOZED_WATER | TAKEN | SKIPPED"
        timestamptz taken_at
        uuid confirmed_by FK
        int snooze_count
    }

    TRANSACTIONS {
        uuid id PK
        uuid couple_id FK
        uuid created_by FK
        uuid paid_by FK "Quem desembolsou o valor"
        string scope "PERSONAL | COUPLE"
        boolean is_secret_gift "Oculta do par mesmo com transparência ON"
        string type "EXPENSE | INCOME | SETTLEMENT"
        string status "PREDICTED_DASHED | CONFIRMED_SOLID"
        numeric amount_cents "Valor em centavos (evita erro de float)"
        string category "MARKET | FOOD | HOME | HEALTH | LEISURE | OTHER"
        string description
        string split_rule "DEFAULT | 50_50 | PROPORTIONAL | FULL_FOR_PARTNER"
        numeric partner_a_share_cents "Quanto cabe ao Parceiro A"
        numeric partner_b_share_cents "Quanto cabe à Parceira B"
        date competence_date
        timestamptz updated_at
    }

    HELP_REQUESTS {
        uuid id PK
        uuid couple_id FK
        uuid requester_id FK
        uuid target_task_id FK "Opcional"
        string help_type "TAKE_OVER | BODY_DOUBLING | REMIND_ME"
        string urgency "NOW | TODAY | THIS_WEEK"
        string note
        string status "OPEN | ACCEPTED | RESOLVED"
        timestamptz created_at
    }
```

### Índices e Regras de Segurança (Row-Level Security — RLS no Supabase)
1. **Índices Locais e Remotos Obrigatórios:**
   - `idx_tasks_couple_date_status ON tasks (couple_id, due_date, status)`
   - `idx_med_logs_date_status ON medication_logs (scheduled_date, status)`
   - `idx_tx_couple_competence_scope ON transactions (couple_id, competence_date, scope)`
2. **Política RLS para Privacidade Financeira (`transactions`):**
   Um usuário `U` do casal `C` pode ler (`SELECT`) uma linha da tabela `transactions` se e somente se:
   - `created_by = U.id` (é um lançamento criado por ele mesmo), **OU**
   - `scope = 'COUPLE'` (é um gasto ou acerto do casal), **OU**
   - `(scope = 'PERSONAL' AND is_secret_gift = FALSE AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = transactions.created_by AND p.share_personal_finances = TRUE))`
   *(Ou seja: a própria regra do banco garante que, se você desligar o botão de ver os gastos um do outro ou marcar um item como presente surpresa, o outro aparelho nem recebe aquele registro!).*

---

## 5. Alarmes Locais, Push e Integração com Atalhos do iPhone (`iOS Shortcuts`)

### A. Notificações Locais e Alarmes de Remédio no iOS
1. **Agendamento Antecipado Local (7 dias à frente):** O app agenda localmente no iPhone os próximos 7 dias de horários de remédios usando `UNCalendarNotificationTrigger`. Mesmo se o usuário viajar de avião sem internet, o iPhone dispara o alarme no segundo exato.
2. **Nível de Interrupção (`Time-Sensitive`):** Configurado com `interruptionLevel: 'timeSensitive'`, permitindo que o alarme de medicação apareça na tela bloqueada e emita som mesmo durante modos de Foco (Trabalho/Sono), desde que autorizado pelo usuário nas configurações do iOS.
3. **Ações Rápidas na Notificação (`UNNotificationCategory`):**
   - `ACTION_TAKEN`: `"✓ Já engoli"` (executa em background `foreground: false`).
   - `ACTION_SNOOZE_WATER`: `"⏳ Pegando água (+5 min)"` (agenda automaticamente um `UNTimeIntervalNotificationTrigger` para `300 segundos` depois).
4. **Rede de Apoio (Ping de Atraso ao Parceiro):**
   - Ao agendar o remédio das `09:00`, se `notify_partner_on_delay = true`, o servidor agenda uma verificação leve para `09:30`. Se até `09:30` o `MEDICATION_LOGS` não tiver `status = 'TAKEN'`, a Edge Function envia um Push para o parceiro: *"💛 O remédio das 09h de Lucas ainda não foi confirmado. Quer mandar um lembrete?"*.

### B. Como Integrar os 4 Atalhos Rápidos no iPhone (2 Abordagens para Pesquisa)

Você tem **duas maneiras** de fazer os Atalhos do iPhone funcionarem perfeitamente (podendo começar pela #1 no MVP em 1 hora e evoluir para a #2 na v1.1):

1. **Abordagem 1 (Mais rápida para o MVP — Deep Link + API via app Atalhos nativo):**
   - O app registra o esquema `nosapp://`:
     - `nosapp://quick/task?title=...&scope=US`
     - `nosapp://quick/expense?amount=...&scope=COUPLE`
     - `nosapp://quick/med-confirm`
     - `nosapp://quick/sos`
   - No app **Atalhos (Shortcuts)** do iPhone, você cria um atalho de 2 blocos: `Pedir Entrada (Texto/Número)` → `Abrir URL nosapp://...` (ou `Obter Conteúdo de URL` via `POST` para salvar 100% em background sem abrir tela!).
   - Esse atalho pode ser colocado na **Tela Bloqueada**, no **Centro de Controle**, no **Botão de Ação** ou no **Toque Atrás (Back Tap)**.
2. **Abordagem 2 (Nativa Avançada — `App Intents` em Swift via `expo-apple-targets`):**
   - Expor 4 structs `AppIntent` em Swift que leem e gravam direto no banco SQLite compartilhado via **iOS App Group (`group.com.casal.nos`)**, permitindo inclusive falar: *"Siri, confirmei meu remédio no Nós"*.
