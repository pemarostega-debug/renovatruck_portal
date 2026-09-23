# Plano de Execução — Sistema de Gestão Renova
## 3 meses | 8 módulos novos | Opus + refactor

---

## Timeline

### **FASE 0: Arquitetura & Refactor (Semanas 1-2)**
**Duração:** 2 semanas  
**Responsável:** Opus  
**Saída:** Estrutura pronta para todos os 8 módulos

- [ ] Refatorar `index.html` (12.928 linhas) → modular
  - Separar em `modules/` (cada módulo = pasta com HTML + JS + CSS)
  - Manter `index.html` como entry point (carrega scripts dinamicamente)
  - Padrão: `modules/{modulo}/index.js`, `style.css`, `template.html`
- [ ] Criar `js/core.js` (funções compartilhadas, constantes, helpers)
- [ ] Criar `js/router.js` (openModule otimizado, carregamento lazy)
- [ ] Setup `scss/` com variáveis, componentes reutilizáveis
- [ ] Criar `docs/PADROES.md` (guideline pra todos os módulos)
- [ ] Testes: rodar portal em mobile (Chrome DevTools 375px)
- [ ] Commit: "refactor: modularizar código, preparar para fase 1"

**Checklist Opus:**
- [ ] Zero console errors em desktop + mobile
- [ ] Todos os módulos existentes ainda funcionam (dashboard, kanban, contas)
- [ ] Documentação clara do novo padrão

---

### **MÓDULO 1: Conciliação Bancária (Semana 3)**
**Complexidade:** ⭐⭐⭐  
**Depende de:** Contas a Pagar + Contas a Receber (✅ existem)  
**Entrega:** Cadastro de bancos + reconciliação diária + UI

**Backend (Apps Script):**
- [ ] `conciliacao.gs`: GET `/bancos`, POST `/movimentacoes`, GET `/saldo-do-dia`
- [ ] Query na VPS: `SELECT * FROM contas_pagar WHERE data >= hoje`
- [ ] Query na VPS: `SELECT * FROM contas_receber WHERE data >= hoje`

**Frontend:**
- [ ] `modules/conciliacao/`: Cadastro de bancos (CRUD)
- [ ] Tela de reconciliação: tabelas lado a lado (Contas → Movimentações bancárias)
- [ ] Botão "Reconciliar dia anterior" (marca como confirmado)
- [ ] Permitir editar/deletar movimentações
- [ ] Botão "Fechar e registrar" (cria histórico)
- [ ] Mobile: swipe entre abas (bancos, movimentações, histórico)

**Teste:**
- [ ] Reconciliar 50 transações em < 2s
- [ ] Mobile: sem lag ao scrollar tabelas grandes

**Deploy:**
- [ ] Apps Script publicado
- [ ] Menu financeiro: novo botão "Conciliação"
- [ ] VPS cron ajustado (se necessário)

---

### **MÓDULO 2: Fluxo de Caixa (Semana 4)**
**Complexidade:** ⭐⭐⭐⭐  
**Depende de:** Conciliação Bancária + Contas a Pagar/Receber  
**Entrega:** Projeção de fluxo + cenários + BI

**Backend:**
- [ ] `fluxo-caixa.gs`: GET `/projecao?meses=12`, POST `/cenarios`, GET `/cenarios/{id}`
- [ ] Puxar dados de: Conciliação (saldos) + Contas a Pagar (saídas) + Contas a Receber (entradas)

**Frontend:**
- [ ] `modules/fluxo-caixa/`: 
  - [ ] Tabela de projeção (12 meses, linhas = dias)
  - [ ] Colunas: Saldo Inicial, Entradas, Saídas, Saldo Final
  - [ ] Gráfico de área (saldo acumulado)
  - [ ] Aba "Cenários": criar, editar, simular aportes/investimentos
  - [ ] Comparação cenário A vs B vs realizado
- [ ] Editar linhas manualmente (para simular "e se investir R$ 100k em janeiro?")
- [ ] Exportar projeção → XLSX

**Teste:**
- [ ] Mudar valor de cenário → gráfico atualiza < 500ms
- [ ] 24 meses de projeção carrega em < 1s
- [ ] Mobile: gráfico responsivo (não estufa)

**Deploy:**
- [ ] Menu financeiro: novo botão "Fluxo de Caixa"

---

### **MÓDULO 3: DRE Gerencial (Semana 5)**
**Complexidade:** ⭐⭐⭐⭐⭐  
**Depende de:** Fluxo de Caixa, Resultado Semanal (estrutura)  
**Entrega:** DRE com budget vs executado + cenários

**Backend:**
- [ ] `dre.gs`: GET `/resultado?periodo=`, GET `/budget`, POST `/budget`, GET `/contas-por-natureza`
- [ ] Trazer Resultado Semanal + Contas a Pagar/Receber

**Frontend:**
- [ ] `modules/dre/`:
  - [ ] Tabela DRE (período | Receita | CMV | Lucro Bruto | Desp. Operacional | EBITDA | Resultado)
  - [ ] Comparação: Orçado vs Executado (colunas lado a lado)
  - [ ] Clicar em linha → detalhe de contas que formam aquela natureza
  - [ ] Aba "Budget": editar metas por período
  - [ ] Aba "Cenários": simular impactos
  - [ ] Gráfico de evolução (últimos 12 meses)
- [ ] Drill-down: clicar "Receita" → lista de OSs que formam

**Teste:**
- [ ] 24 períodos carregam < 1s
- [ ] Mudar budget → comparação atualiza < 300ms
- [ ] Mobile: tabelas com scroll horizontal fluido

**Deploy:**
- [ ] Menu financeiro: novo botão "DRE Gerencial"

---

### **MÓDULO 4: Dashboard Comercial (Semana 6)**
**Complexidade:** ⭐⭐⭐  
**Depende de:** OSs existentes (✅ já temos dados)  
**Entrega:** BI vendedor + comissões + peças/serviços mais vendidos

**Backend:**
- [ ] `dashboard-comercial.gs`: GET `/vendedores`, GET `/vendas?filtro=`, GET `/comissoes`
- [ ] Query: `SELECT vendedor, COUNT(*), SUM(valor) FROM ordens_finalizadas`

**Frontend:**
- [ ] `modules/dashboard-comercial/`:
  - [ ] Cards KPI: Total faturado, ticket médio, #clientes, #OSs
  - [ ] Gráfico de pizza: Faturamento por vendedor
  - [ ] Tabela: Ranking de vendedores (top 10)
  - [ ] Peças mais vendidas (top 20, com quantidade + faturamento)
  - [ ] Serviços mais vendidos (top 20)
  - [ ] Filtro por período (mês, trimestre, semestre, ano)
  - [ ] **Aba "Comissões" (admin only)**: Tabela de comissões por vendedor (editável)
  - [ ] Gráfico de evolução (últimos 12 meses)
- [ ] Mobile: cards empilhados, gráficos responsivos

**Teste:**
- [ ] 1000 OSs carregam em < 2s
- [ ] Filtro por período → atualiza < 500ms
- [ ] Mobile: toque em card detalha linha

**Deploy:**
- [ ] Menu comercial: novo botão "Dashboard Comercial"
- [ ] Verificar permissões (comissões = admin only)

---

### **MÓDULO 5: CRM Comercial (Semana 7)**
**Complexidade:** ⭐⭐⭐  
**Depende de:** Nada (novo módulo independente)  
**Entrega:** Kanban de pipeline de vendas

**Backend:**
- [ ] `crm.gs`: CRUD de prospects/clientes
- [ ] Colunas: Mapeamento | Contato | Visita | Orçamento | Ativo | Recuperar | Inativo/Perdido

**Frontend:**
- [ ] `modules/crm/`:
  - [ ] Kanban estilo Trello (7 colunas)
  - [ ] Card obrigatório: Cliente, Vendedor, Contato (email, tel), Data última interação
  - [ ] Editar card inline (drag-and-drop)
  - [ ] Botão "+" em cada coluna → novo prospect
  - [ ] Filtro por vendedor, período
  - [ ] Dashboard KPI: #prospects por coluna, taxa conversão
  - [ ] Mobile: scroll horizontal suave

**Teste:**
- [ ] Drag-and-drop 100 cards sem lag
- [ ] Mobile: columns bem dimensionadas (não quebra)

**Deploy:**
- [ ] Menu comercial: novo botão "CRM Comercial"

---

### **MÓDULO 6: Check-list Operacional + Evidências (Semana 8)**
**Complexidade:** ⭐⭐⭐⭐⭐⭐  
**Depende de:** Kanban Operacional  
**Entrega:** Captura de fotos + check-list + geração de PDF

**Decisões críticas:**
- [ ] Armazenamento: Google Drive (gratuito) vs Firebase (pago) vs S3 (pago)
  - **Recomendação:** Google Drive (usar DriveApp do Apps Script)
- [ ] Geração de PDF: PDFKit (npm) vs Google Docs (via Apps Script)
  - **Recomendação:** PDFKit (lado cliente, mais rápido)

**Backend:**
- [ ] `evidencias.gs`: POST `/upload` (recebe base64), GET `/fotos/{os_id}`, POST `/gerar-relatorio`
- [ ] Função `uploadGoogleDrive(base64, nomearquivo)` → retorna URL
- [ ] Função `gerarPDF(checklist, fotos)` → retorna Buffer PDF

**Frontend:**
- [ ] `modules/evidencias/`:
  - [ ] **Colaborador** (link separado):
    - [ ] Selecionar OS
    - [ ] Camera app (access `<input type="file" accept="image/*" capture>`​)
    - [ ] Check-list ANTES (checkboxes)
    - [ ] Tirar fotos ANTES
    - [ ] Check-list DEPOIS
    - [ ] Tirar fotos DEPOIS
    - [ ] Preview local das fotos
    - [ ] Botão "Enviar" (upload + salva no Apps Script)
  
  - [ ] **Administrativo** (dentro do Kanban):
    - [ ] Aba "Evidências" (por OS)
    - [ ] Visualizar fotos ANTES/DEPOIS
    - [ ] Review check-list
    - [ ] Botão "Gerar Relatório PDF"
    - [ ] Pré-redação (template): "Serviço realizado conforme solicitado..."
    - [ ] Botão "Enviar email cliente" (integrar com Apps Script)

**Teste:**
- [ ] Upload foto 5MB em < 3s
- [ ] Gerar PDF (20 fotos + check-list) em < 2s
- [ ] Mobile camera: funciona em iOS + Android

**Deploy:**
- [ ] Nova pasta: `link-colaborador/` (acesso direto sem login)
- [ ] Menu operacional: novo botão "Evidências"
- [ ] Verificar permissões Google Drive (VPS tem acesso?)

---

### **MÓDULO 7: Gestão de RH (Semana 9-10)**
**Complexidade:** ⭐⭐⭐⭐⭐⭐⭐ (maior módulo)  
**Depende de:** Nada (integra planilhas Google Drive)  
**Entrega:** RH centralizado no portal

**Dados a integrar (do Drive):**
- [ ] Planilha colaboradores (nome, cargo, email, data admissão, CPF, salário)
- [ ] Controle de férias (saldo, datas usadas, vencimentos)
- [ ] Controle de horas extras
- [ ] Recrutamento (vagas, candidatos, histórico)
- [ ] Banco de currículos
- [ ] Pesquisa de clima
- [ ] Saúde e segurança (exames, registros)
- [ ] Benefícios (vale refeição, vale transporte, etc)
- [ ] Programas de cargos e salários

**Backend (integração Google Drive):**
- [ ] `rh.gs`: 
  - [ ] GET `/colaboradores` (síncrono com planilha)
  - [ ] POST `/colaborador` (atualiza planilha)
  - [ ] GET `/ferias?mes=` (calcula vencimentos)
  - [ ] GET `/horas-extras?colaborador=` (alerta se > limite)
  - [ ] Sync periódico (cron VPS) de dados do Drive

**Frontend:**
- [ ] `modules/rh/`:
  - [ ] **Colaboradores**: Tabela (nome, cargo, email, fone, data adm, status)
    - [ ] CRUD completo
    - [ ] Editar: abre modal com todos os dados
    - [ ] Mobile: cards empilhados
  
  - [ ] **Férias**: Tabela (colaborador, dias disponíveis, datas solicitadas)
    - [ ] Alertar: "X vai vencer em 30 dias"
    - [ ] Simular: "se tirar 15 dias em dezembro?"
    - [ ] Exportar planejamento de férias
  
  - [ ] **Horas Extras**: Tabela (colaborador, mês, total horas, valor)
    - [ ] Alertar: "Y fez 50+ horas este mês"
    - [ ] Gráfico de tendência
  
  - [ ] **Recrutamento**: Kanban (Abertas | Candidatos | Entrevista | Oferecido | Contratado | Rejeitado)
  
  - [ ] **Banco de Currículos**: Upload + busca (nome, experiência, cargo desejado)
  
  - [ ] **Pesquisa de Clima**: Formulário periódico
  
  - [ ] **Saúde e Segurança**: Registro de exames, PPPs, EPI
  
  - [ ] **Benefícios**: Tabela com vencimentos (vale refeição, transporte)
  
  - [ ] **Dashboard RH**:
    - [ ] Total de colaboradores
    - [ ] Turnover (últimos 12 meses)
    - [ ] Distribuição por cargo
    - [ ] Férias a vencer (próximos 90 dias)
    - [ ] Horas extras acumuladas
    - [ ] Avisos alertas (vencimentos, limites)

**Teste:**
- [ ] Sync de 100 colaboradores em < 1s
- [ ] Alertas em tempo real (check a cada 1h)
- [ ] Mobile: formulários rápidos (< 5 campos visíveis)

**Deploy:**
- [ ] Apps Script: autenticação com Google Drive
- [ ] VPS cron: sincronizar planilhas a cada 1h
- [ ] Menu RH: novo botão "Gestão de RH"

---

### **MÓDULO 8: Área do Colaborador (Semana 10, paralelo a RH)**
**Complexidade:** ⭐⭐⭐  
**Depende de:** RH (estrutura de colaboradores)  
**Entrega:** Self-service de dados pessoais

**Frontend:**
- [ ] `link-colaborador/` (URL única por colaborador, sem login):
  - [ ] Folha de ponto fechada (mês atual + 5 anteriores)
  - [ ] Horas extras por mês (tabelado)
  - [ ] Faltas (justificadas/não)
  - [ ] Férias (saldo + histórico)
  - [ ] Recados (mensagens do RH)
  - [ ] Prêmios/reconhecimentos (histórico)
  - [ ] Pontos disciplinares (se houver)
  - [ ] Contatos úteis (RH, admin, segurança)

**Segurança:**
- [ ] URL com token único por colaborador (gerado no Apps Script)
- [ ] Apenas dados próprios visíveis
- [ ] Zero edição (read-only)

**Teste:**
- [ ] Mobile: carrega em < 2s, layout responsivo
- [ ] Sem console errors

**Deploy:**
- [ ] URL: `https://renovatruck.com.br/colaborador?token=XXXXX`
- [ ] Comunicar ao RH como gerar links

---

## Refactor & Mobile (Paralelo)

### Semanas 1-2:
- [ ] Modularizar HTML (já está no checklist da Fase 0)

### Cada novo módulo:
- [ ] **Antes de merge:** Testar em mobile (DevTools 375px, 768px, 1024px)
- [ ] **Responsividade:** Sem horizontal scroll, botões 44px+, texto legível
- [ ] **Performance:** Load < 2s, interação < 300ms

### Ao final (Semana 11):
- [ ] Revisar front-end total (Capricho skill)
- [ ] Criar app web (manifest.json, PWA shortcuts)
- [ ] Teste real em iPhone + Android

---

## Critérios de Conclusão por Módulo

✅ **Código:**
- [ ] Zero console errors (desktop + mobile)
- [ ] Código segue `docs/PADROES.md`
- [ ] Comentários em funções complexas
- [ ] Variáveis bem nomeadas (em PT-BR)

✅ **Funcionalidade:**
- [ ] CRUD completo onde aplicável
- [ ] Validações de entrada
- [ ] Mensagens de erro amigáveis
- [ ] Teste com dados reais (> 100 registros)

✅ **Performance:**
- [ ] Load < 2s, interação < 300ms, sem lag
- [ ] Mobile: sem lag ao scroll, sem quebra de layout

✅ **UX:**
- [ ] Mobile first (testado em 375px)
- [ ] Botões 44px+, inputs acessíveis
- [ ] Feedback visual (loading, sucesso, erro)

✅ **Deploy:**
- [ ] Apps Script publicado (se necessário)
- [ ] Menu atualizado com novo botão
- [ ] VPS cron configurado (se necessário)
- [ ] Documentação: como usar + como manter

✅ **Commit:**
- [ ] Mensagem clara: `feat: módulo X implementado`
- [ ] Branch: `feat/modulo-x`, depois merge em main
- [ ] Tags: `v1.1` (Conciliação), `v1.2` (Fluxo), etc.

---

## Pontos de Atenção

⚠️ **Crítico:**
- **Semana 1-2:** Se refactor ficar ruim, tudo fica difícil depois
- **Apps Script:** Publicar sem erro; testar com VPS antes de deploy
- **Mobile:** Testar ANTES de considerar pronto
- **Google Drive:** Verificar quotas (upload de fotos em escala)

⚠️ **Risco técnico:**
- Single file HTML → estrutura modular pode gerar bugs de carregamento (solver: lazy load testing)
- Novo Apps Script → pode conflitar com existentes (solver: nomes únicos, namespacing)
- Fotos no Google Drive → limite de storage (solver: planejar limpeza periódica)

---

## Próximos Passos

1. **Revisar este plano** (Haiku agora, você)
2. **Levar PADRÃO-ARQUITETURA.md pra Opus**
3. **Opus executa Fase 0** (refactor)
4. **Opus executa Módulo 1** (Conciliação)
5. **Loop:** Feedback → próximo módulo

---

**Status:** 🟡 Aguardando início Fase 0
**Última atualização:** 19/09/2026
