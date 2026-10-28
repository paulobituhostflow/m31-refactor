# M31: Diferenciação das Novidades do `projeto-m31` no `m31-refactor`

**Data de elaboração:** 27 de Outubro de 2026  
**Contexto:** Comparação detalhada entre a evolução recente do repositório `projeto-m31` (branch `corrigindo-erro`, commits até `a51d5b6d`) e a arquitetura independente moderna do `m31-refactor` (baseada em Cloudflare Workers + Supabase PostgreSQL).

---

## 1. Visão Geral da Comparação

O repositório `m31-refactor` foi derivado a partir do commit `c342879566d47d7b53ed8387687933e9c850085d` (01/10/2026) com o objetivo de desacoplar a aplicação da plataforma legada Base44 e migrá-la para uma arquitetura serverless nativa (Cloudflare Workers, Hono, TypeScript, Supabase PostgreSQL, RLS, Storage e Realtime).

Entre 01/10/2026 e 27/10/2026, o `projeto-m31` recebeu mais de **500 arquivos alterados**, **+33.000 adições de código** e diversas funcionalidades críticas de negócio desenvolvidas sobre o ecossistema anterior.

A tabela a seguir sumariza as grandes frentes desenvolvidas no `projeto-m31` e sua situação em relação ao `m31-refactor`:

| Frente / Módulo | Situação no `projeto-m31` | Situação no `m31-refactor` | Impacto na Migração |
| :--- | :--- | :--- | :--- |
| **Gestão Operacional Delegada (Voluntárias)** | Implementada em 23/10 (`M31GestaoMobile`, fichas, caravanas, equipe, CAS, IA) | Apenas rascunho anterior de `M31GestaoMobile` com operadoras fixas | **Prioridade Máxima**: Exige portabilidade de frontend, handlers e schema |
| **Central Comercial & Regras de Preço** | `m31CentralComercial`, motor de reajustes e simulações | Lotes e preços legados hardcoded/estáticos | Portabilidade de regras, hooks e componentes de simulação |
| **Confirmação Imediata & Fila V2** | QR Code e grupo entregues de imediato a presenteadas sem perfil | Drenador V1 com dependência de cadastro completo | Adaptação para outbox transacional de Workers/Queues |
| **Cartinhas em Lote & Aprovação** | Telas de colagem, aprovação em lote e contagem regressiva | Editor individual e visualização básica | Portabilidade dos componentes de lote e visualização |
| **Plano de Suprimentos de Camisas** | Hub de supply plan, projeção de estoque e pedidos por caravana | Listagem e tracking de pedidos legados | Portabilidade de componentes de supply e hooks |

---

## 2. A Principal Novidade: Gestão Operacional das Voluntárias

A principal demanda de negócio entregue em 23/10/2026 e refinada até 27/10/2026 foi a **Gestão Operacional Delegada**, permitindo que voluntárias atuem de forma segura e produtiva diretamente pelo celular ou desktop na gestão de **Inscrições**, **Caravanas**, **Camisas** e **Voluntárias**.

### 2.1. Arquitetura de Permissões e Perfis (RBAC Granular)
* **Perfil `gestao_delegada`:** Criação de perfil restrito específico no `EventoM31Membro`.
* **Modos de Acesso:**
  - `consulta`: Leitura estrita de dados cadastrais, sem botões de ação ou mutação.
  - `operacao`: Permissão de cadastros manuais, conferência, trocas e edição.
* **Escopo por Área (`gestao_areas`):**
  - `inscritas`: Visualização e operações com participantes.
  - `caravanas`: Visualização e operações com caravanas.
  - `camisas`: Operações com pedidos e distribuição de camisas.
  - `voluntarias`: Gestão de voluntárias.
  - `equipe`: Gestão de membros da equipe (exclusivo para administradores).
* **Segurança de Acesso e Isolamento:**
  - Acesso individual via login autenticado por e-mail e sessão pessoal (`M31OperacaoSessao`).
  - Blindagem financeira: Perfis delegados não têm acesso a dados financeiros, valores de faturamento ou reconciliação de provedor (Asaas).
  - Bloqueio de elevação de privilégios: Voluntárias não podem se promover a administradoras nem gerenciar a equipe.

### 2.2. Gestão de Inscritas
* **Ficha Cadastral Unificada (`GestaoInscricaoFicha`):** Visualização clara dos dados da inscrita, status de participação, histórico e QR Code.
* **Conferência Manual Inteligente:**
  - Permite à voluntária marcar que conferiu os dados da inscrita.
  - Gera um hash SHA256 (`conferencia_dados_hash`) baseado nos 6 campos cadastrais (`nome`, `whatsapp`, `email`, `cpf`, `cidade`, `estado`).
  - Se qualquer dado for alterado posteriormente por outra pessoa, a conferência é **automaticamente invalidada**.
* **Cadastro Manual Desacoplado de Cobrança:**
  - Identificação mínima flexível: exige apenas **Nome completo** e **WhatsApp com DDD válido**. CPF e E-mail são opcionais.
  - Criação de inscrição sem emissão prematura de cobrança Asaas ou geração de QR fantasma.
  - Detecção ativa de duplicidades (`GestaoLoteDuplicidade`) com análise de correspondência por nome normalizado, telefone e CPF.
* **Assistente de Extração por IA (`GestaoLoteIA`):**
  - Auxilia na extração dos 6 campos a partir de textos brutos recebidos (ex.: mensagens de WhatsApp).
  - Princípio de segurança estrita: **a IA nunca sobrescreve campos já preenchidos** nem edições concorrentes de outros operadores.
* **Troca de Titularidade (`substituir_titular`):**
  - Substitui a participante mantendo o mesmo código de inscrição, histórico e referências financeiras.
  - Não transporta silenciosamente dados de contato ou documentos antigos para a nova titular.
* **Visualização e Download de QR Code Existente (`GestaoQrExistente`):**
  - Apresenta o QR Code oficial já emitido sem gerar novos registros de custo.

### 2.3. Gestão de Caravanas (`GestaoCaravanas`)
* **Visão Consolidada e Ranking:** Lista de caravanas ordenadas por volume, cidades e líderes.
* **Separação por Status:** Contabilização transparente de vagas confirmadas, isentas, pendentes e fora do universo.
* **Criação e Edição Segura:**
  - Formulário com normalização de cidade/UF e WhatsApp da liderança.
  - Controle de concorrência com lock para evitar duplicação de caravanas com o mesmo nome e localidade.
* **Camisas por Caravana:** Associação de pedidos de camisas à caravana e geração de link promocional específico para os membros daquele grupo.

### 2.4. Gestão de Equipe (`M31GestaoEquipeAcessos`)
* **Gestão pelos Administradores:** Painel dedicado para o administrador convidar voluntárias, definir as áreas autorizadas (`gestao_areas`) e o modo (`consulta` vs `operacao`).
* **Desativação Imediata:** Revogação de acesso em tempo real sem afetar os históricos de auditoria.
* **Rastreabilidade Total:** Registro de cada concessão, revogação e acesso no `EventoM31ActionLog`.

### 2.5. Concorrência e Confiabilidade
* **Controle Compare-And-Set (CAS):** Edições verificam a versão do registro (`updated_date` / `version`) para impedir que uma voluntária sobrescreva as edições de outra.
* **Idempotência de Criação:** Utilização da entidade `M31GestaoRequisicao` para garantir que repetições ou perdas de conexão não gerem cadastros duplicados.

---

## 3. Demais Novidades Presentes no `projeto-m31`

### 3.1. Central Comercial & Motor de Regras
* Interface para simular e aplicar reajustes de preços de ingressos, caravanas e taxas de cartão com histórico de versões (`M31RegraComercialVersao`).
* Tratamento de exceções comerciais por ID de caravana (ex: Família da Graça) com validade temporal no relógio do servidor.

### 3.2. Fila de Confirmação Rápida (Confirmação Imediata V2)
* Liberação de envio prioritário transacional: inscrições pagas recebem confirmação imediata (WhatsApp e e-mail) mesmo fora do horário comercial regular.
* Regra expressa para presenteadas: envio imediato do QR Code e do link do grupo oficial do WhatsApp, sem exigir a conclusão prévia do perfil cadastral.

### 3.3. Gestão de Cartinhas em Lote
* Fluxo ágil para voluntárias de intercessão: aprovação em lote de mensagens, conferência de participantes conhecidas, filtros por prazo e status de impressão.

### 3.4. Hub de Suprimentos de Camisas (Supply Plan)
* Componente `HubSupplyPlan` para cálculo de estoque real, previsões de pedidos por modelo/tamanho e acompanhamento das grades de produção da fábrica.

---

## 4. Comparação Arquitetural e Plano de Aplicação no `m31-refactor`

Para aplicar essas novidades no `m31-refactor` seguindo todos os padrões de **Clean Architecture, Segurança e Resiliência**, devemos respeitar a infraestrutura de Cloudflare Workers e Supabase:

| Componente | No `projeto-m31` (Legado Base44) | No `m31-refactor` (Arquitetura Prevista) |
| :--- | :--- | :--- |
| **Backend Runtime** | Deno functions com `createClientFromRequest(req)` | Cloudflare Worker com Hono, TypeScript e `HandlerContext` |
| **Banco de Dados** | Base44 Schemas / MongoDB-like API | Supabase PostgreSQL com RLS, revisões e envelopes JSONB |
| **Autenticação** | Base44 Auth (`client.auth.me()`) | Supabase Auth com mapeamento para `m31_identities` e sessão operacional |
| **Chamadas Frontend** | `base44.functions.invoke(name, payload)` | `/api/functions/:name` no Worker via `base44Client.js` |
| **Registro de Funções**| Invocação dinâmica pela nuvem Base44 | Registro explícito tipado em `worker/registry.ts` |
| **Controle de Permissões** | Verificações inline no handler | Validador em `worker/runtime/permissions.ts` + RLS |
| **Concorrência** | Inspecção manual de campos Base44 | `UnitOfWork` com CAS transacional via `m31_commit` e lock com lease |

---

## 5. Roteiro de Aplicação das Novidades no `m31-refactor`

1. **Camada de Banco de Dados (Supabase Migration):**
   - Criar a migration SQL para a nova entidade `M31GestaoRequisicao` (`m31_m31_gestao_requisicao`).
   - Atualizar a migration para registrar a entidade em `m31_entity_catalog` e catálogo de relações.
   - Atualizar o catálogo de entidades em `worker/catalog/entities.json`.

2. **Camada de Backend (Cloudflare Worker Handlers):**
   - Portar e registrar os novos handlers em `worker/functions/`:
     - `m31AbrirSessaoOperacional`: Atualizar com o novo protocolo de sessão individual e verificação de perfil `gestao_delegada`.
     - `m31OperarParticipante`: Handler unificado com ações de listar, detalhar, cadastrar manual, editar, conferir, trocar titular, gerenciar caravana e comunicação.
     - `m31GestaoCaravanas`: Ações de listar com estatísticas, criar com lock, editar liderança/local e gerenciar camisas de caravana.
     - `m31GestaoEquipe`: Gerenciamento de acessos da equipe pelo administrador com convites e revogações seguras.
     - `m31ReembolsoInscricao`: Avaliação e simulação controlada de estornos.
   - Adicionar os handlers ao registro `worker/registry.ts`.
   - Declarar as permissões em `worker/runtime/permissions.ts`.

3. **Camada de Frontend (React + Tailwind + Design System M31):**
   - Portar os novos componentes de gestão operacional em `src/components/m31/operacional/gestao/`:
     - `GestaoCaravanas.jsx`, `GestaoInscricaoFicha.jsx`, `GestaoInscricaoForm.jsx`, `GestaoQrExistente.jsx`, `GestaoLoteDuplicidade.jsx`, `GestaoLoteIA.jsx`, `GestaoNovaCaravana.jsx`, `GestaoReembolso.jsx`, `VersiculoDoDia.jsx`, `m31Gestao.css`, etc.
   - Atualizar `src/components/m31/operacional/M31OperationalShell.jsx` com o novo layout branco/bordô e menu de abas das áreas delegadas.
   - Atualizar `src/pages/M31GestaoMobile.jsx` conectando os dados da sessão operacional às abas de Inscritas, Voluntárias, Caravanas, Camisas e Equipe.
   - Integrar os novos hooks e bibliotecas de apoio: `useM31Gestao.js`, `m31GestaoApi.js`, `m31GestaoContato.js`, `m31GestaoTelefone.js`, `m31GestaoCache.js`.

4. **Validação, Testes e Qualidade:**
   - Adicionar testes de regressão automatizados para operações manuais, troca de titularidade e concorrência CAS.
   - Executar suíte de testes (`npm test`), lint (`npm run lint`), typecheck (`npm run typecheck`) e build do frontend e worker (`npm run build`).

---

## 6. Status de Execução e Checklist da Migração

### ✅ O Que Já Foi Feito (Concluído)

1. **Banco de Dados & Schema:**
   - [x] Criada migration Supabase: `supabase/migrations/20261027000100_gestao_delegada_requisicao.sql` criando a tabela `m31_m31_gestao_requisicao` com índices, RLS restrito a `service_role`, lock seed e registro em `m31_entity_catalog`.
   - [x] Catálogo de entidades do worker atualizado em `worker/catalog/entities.json` registrando a entidade `M31GestaoRequisicao`.

2. **Backend & Cloudflare Worker (Handlers e Runtime):**
   - [x] `worker/functions/m31AbrirSessaoOperacional/`: Sessão operacional com suporte a perfil `gestao_delegada`, permissões granulares por área (`inscritas`, `voluntarias`, `caravanas`, `camisas`) e `can_manage_team`.
   - [x] `worker/functions/m31OperarParticipante/`: 10 arquivos portados com Clean Architecture:
     - `entry.ts`, `core.js`, `gestaoAccess.js`, `gestaoMutationLock.js`, `gestaoSearch.js`, `filtrosInscritas.js`, `participacaoLiberada.js`, `participacaoReconhecida.js`, `groupMembership.js`, `comunicacao.js`.
   - [x] `worker/functions/m31GestaoCaravanas/`: 6 arquivos portados:
     - `entry.ts`, `core.js`, `gestaoAccess.js`, `gestaoMutationLock.js`, `camisasCaravana.js`, `camisasTemplate.json`.
   - [x] `worker/functions/m31GestaoEquipe/`: 4 arquivos portados com proteção de admin:
     - `entry.ts`, `core.js`, `gestaoAccess.js`, `gestaoMutationLock.js`.
   - [x] `worker/functions/m31ReembolsoInscricao/`: 3 arquivos portados:
     - `entry.ts`, `gestaoAccess.js`, `reembolsoAvaliacao.js` (permissão restrita ao gestor Paulo `paulobituadv@gmail.com`).
   - [x] `worker/registry.ts`: Mapeamento correto de todos os handlers (`f205`, `f206`, `f207`) sem duplicações, totalizando 207 handlers registrados.
   - [x] `worker/runtime/permissions.ts`: Registro de perfil `'gestao_delegada'` e autorização de `m31GestaoCaravanas`, `m31GestaoEquipe`, `m31ReembolsoInscricao`.

3. **Frontend: Bibliotecas, Utilitários e Hooks:**
   - [x] `src/lib/m31GestaoApi.js`: Bridge client-side para `/api/functions`, exportação de `participacaoStatus`, `TIPOS_INGRESSO` e `tipoIngresso`.
   - [x] `src/lib/m31GestaoCache.js`: Sincronização e merge de cache otimista.
   - [x] `src/lib/m31GestaoContato.js`: Formatadores WhatsApp e datas no padrão de Fortaleza.
   - [x] `src/lib/m31GestaoEntry.js`: Identificação de rota de entrada e validação de sessão ativa.
   - [x] `src/lib/m31GestaoTelefone.js`: Normalização de telefone DDI/DDD brasileiro.
   - [x] `src/lib/shirtSupplyPlan.js`: Algoritmo de cálculo de demandas e faltas de camisas por grade.
   - [x] `src/hooks/useM31Gestao.js`: React Query hooks (`useM31Gestao`, `useM31GestaoList`, `useM31GestaoDetail`).

4. **Frontend: Componentes e Telas da Gestão Operacional:**
   - [x] Componentes em `src/components/m31/operacional/gestao/`:
     - `m31Gestao.css`: Design system bordô/branco (#8b1a2b).
     - `VersiculoDoDia.jsx`: Mensagem bíblica diária inspiracional para voluntárias.
     - `GestaoDialog.jsx`: Modal padronizado acessível.
     - `GestaoAreaConsulta.jsx`: Visualização somente-leitura para voluntárias em modo consulta.
     - `GestaoLoteDuplicidade.jsx`: Comparador lado a lado de duplicidades.
     - `GestaoLoteBloco.jsx`: Bloco de revisão individual do assistente IA.
     - `GestaoLoteIA.jsx`: Assistente de cadastro em lote de participantes com parsing inteligente.
     - `GestaoQrExistente.jsx`: Exibição e geração do QR Code de credenciamento.
     - `GestaoReembolsoConfirmar.jsx`, `GestaoReembolsoCard.jsx`, `GestaoReembolso.jsx`: Fluxo auditado de estorno.
     - `GestaoComunicacao.jsx`: Ações rápidas de contato e disparo de mensagens.
     - `GestaoInscricaoForm.jsx`: Formulário de criação e edição com validações.
     - `GestaoInscricaoFicha.jsx`: Ficha completa da inscrita com status de pagamento, participação e caravana.
     - `GestaoCamisasCaravana.jsx`: Gestão e conferência de camisas encomendadas por caravana.
     - `GestaoPrecoCaravana.jsx`: Configuração de valores promocionais por caravana.
     - `GestaoExcluirCaravana.jsx`: Exclusão segura de caravana com proteção de dados.
     - `GestaoNovaCaravana.jsx`: Cadastro de novas caravanas com lock de concorrência.
     - `GestaoCaravanas.jsx`: Painel central de controle de todas as caravanas do evento.
   - [x] `src/components/m31/gestao/M31GestaoEquipeAcessos.jsx` & `M31GestaoEquipeAcessos.css`: Gestão de acessos da equipe.
   - [x] `src/components/m31/operacional/inscritas/`:
     - `confirmacaoResultado.js`: Mapeamento de regras de confirmação.
     - `M31FilaConfirmacao.jsx`: Fila operacional de confirmações pendentes.
     - `M31VinculoPagamento.jsx`: Vinculação de pagamentos órfãos.
     - `M31InscritasOperational.css` & `M31InscritasOperational.jsx`: Tabela operacional com filtros, busca instantânea e paginação.
   - [x] `src/components/m31/operacional/voluntarias/M31VoluntariasOperational.jsx`: Atualizado com resumos de intercessão e filtros.
   - [x] `src/components/m31/operacional/camisas/hub/HubSupplyPlan.jsx` & `HubSupplyPlan.css`: Painel de suprimentos de camisas.
   - [x] `src/components/m31/operacional/M31CamisasMobile.jsx` & `HubEstoque.jsx`: Conectados ao plano de suprimentos.
   - [x] `src/components/m31/operacional/M31OperationalShell.jsx`: Topbar com marca M31 Filhas, `VersiculoDoDia`, perfil e navegação por abas dinâmicas.
   - [x] `src/pages/M31GestaoMobile.jsx`: Orquestrador mobile/desktop com autenticação de sessão e chaveamento de abas.

5. **Testes e Build:**
   - [x] `npm run typecheck`: 0 erros (tanto no Worker quanto nas ferramentas).
   - [x] `npm run lint`: 0 erros no ESLint.
   - [x] `npm run build`: Build do Vite concluído com sucesso.
   - [x] `npm run build:worker`: Build do Cloudflare Worker com Wrangler concluído com sucesso.
   - [x] `node scripts/check-artifacts.mjs`: Validação de segurança concluída sem segredos ou vazamentos.
   - [x] `tests/runtime.test.mjs`: Testes dos 207 handlers registrados passando com sucesso.
   - [x] `tests/gestao/`: 14 testes automatizados de regressão de gestão passando com 100% de sucesso (`identidadeQr.test.mjs`, `manualForm.test.mjs`, `participacaoManual.test.mjs`).

---

### ⏳ O Que Falta / Próximos Passos (Backlog Secundário)

1. **Central Comercial & Regras de Preço (Frente Futura):**
   - Caso desejado pelo gestor em próximas iterações: migrar o simulador `m31CentralComercial` e regras dinâmicas de cupons/reajustes que foram prototipadas no `projeto-m31`.

2. **Cartinhas em Lote (Frente Secundária):**
   - Portar a tela de aprovação de cartinhas em lote (`cartinhasLoteAprovacao`) quando a equipe for operar a entrega de cartinhas no evento.

