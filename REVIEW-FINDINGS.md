# Code Review Findings — Sistema de Gestão Renova
## Análise do código atual para Fase 0 (Refactor)

**Data:** 19/09/2026  
**Escopo:** index.html (12.928 linhas) + apps-script/  
**Foco:** Bugs, redundância, responsividade mobile  

---

## 🔴 CRÍTICO (Bloqueia refactor)

### 1. **Single-file HTML de 12.928 linhas — impossível manter**
- **Arquivo:** index.html:1-12928
- **Problema:** Código monolítico. Mistura 8 módulos, CSS, JS e HTML tudo junto.
- **Por quê importa:** Cada mudança em um módulo recompila tudo. Sem isolamento = bugs cascata. Mobile testing = pesadelo.
- **Solução:** Sair de single-file → estrutura modular em `modules/{nome}/` conforme PADRÃO-ARQUITETURA.md

### 2. **CSS duplicado 3x**
- **Arquivo:** index.html:13-277 (`:root`, `*`, `body`, etc.) aparece 3 vezes (linhas 14, 53, 116)
- **Problema:** Espaço desperdiçado. Cascata de regras conflitantes (último ganha).
- **Solução:** CSS único em `css/base.css` + módulos em `modules/{nome}/style.css`

### 3. **JavaScript misturado com HTML (onclick inline)**
- **Arquivo:** index.html:293-379 (exemplos: `onclick="doLogin()`, `onclick="goHome()`, etc.)
- **Problema:** Difícil debugar, sem event delegation, DOM acoplado ao JS.
- **Solução:** Event listeners em JS, delegação de eventos (`document.addEventListener`)

### 4. **Credenciais potencialmente expostas (Apps Script)**
- **Arquivo:** apps-script/*.gs
- **Sinal:** Verificar se há `const SHEET_ID`, `APIKEY`, `PASSWORD` hardcoded
- **Solução:** Mover para `.env` e ler no Apps Script (ou via secretos do Google)

---

## 🟠 IMPORTANTE (Conserte antes de deploy)

### 5. **Responsividade mobile deficiente**
- **Arquivo:** index.html:101-113 (media query `max-width:640px`)
- **Problema:** 
  - Tabelas não ficam responsivas (sem transform em TD)
  - Cards empilham 1 coluna só em mobile < 640px
  - Botões podem ter < 44px (acessibilidade)
  - Header em mobile fica quebrado (linha 105: `flex-direction:column`)
- **Teste:** Abrir em Chrome DevTools 375px — verá quebra de layout
- **Solução:** Implementar mobile-first em PADRÃO-ARQUITETURA.md (seções 4 e 7)

### 6. **Carregamento lazy dos módulos falta**
- **Arquivo:** index.html:1805 (função `openModule()`)
- **Problema:** Todos os scripts carregam de uma vez (dados.json, charts, xlsx, etc.)
- **Solução:** `router.js` com lazy-load: carrega módulo só quando aberto

### 7. **Tratamento de erro incompleto**
- **Arquivo:** index.html:1695+ (ex.: `fetchData()` linha 161)
- **Problema:** `alert()` em erro é amador. Sem retry ou fallback.
- **Solução:** Toast + retry automático (conforme PADRÃO-ARQUITETURA.md seção 5)

### 8. **Console.log e TODO não removidos (produção)**
- **Arquivo:** Verificar grep por `console.log`, `TODO`, `FIXME`
- **Solução:** Remover ou deixar em log.js controlado

---

## 🟡 VALE MELHORAR (Eficiência/manutenção)

### 9. **Código repetido (DRY violation)**
- **Arquivo:** index.html (múltiplas ocorrências)
  - Tabela renderizada 5+ vezes com lógica similar
  - KPI cards desenhadas inline sem componente
  - Modais abrem/fecham com `.classList.toggle()` × 8 módulos
- **Solução:** Funções auxiliares em `js/core.js` (conforme PADRÃO-ARQUITETURA.md seção 5)

### 10. **Variáveis globais sem namespace**
- **Arquivo:** index.html (linhas 1695+)
  - `let db = []` (global)
  - `let charts = {}`
  - `let state = {}`
- **Problema:** Risco de colisão com módulos novos
- **Solução:** IIFE + singleton por módulo: `const MODULE_DASHBOARD = (() => { ... })()`

### 11. **Gráficos (Chart.js) sem configuração responsiva**
- **Arquivo:** index.html (ex.: linha 418, `buildDailyChart()`)
- **Problema:** Gráfico pode não caber em mobile (maintainAspectRatio não setado)
- **Solução:** Configurar Chart.js com `responsive: true, maintainAspectRatio: false`

### 12. **Dados sensíveis em dados.json (público)**
- **Arquivo:** `dados.json` (commitado no repo público)
- **Problema:** Repo é GitHub Pages (público). Dados de clientes/faturamento visíveis.
- **Solução:** Apenas OSs/serviços públicos em dados.json. Dados sensíveis via API Apps Script (autenticada).

---

## 🟢 BOAS PRÁTICAS (Já faz bem)

- ✅ Uso de variáveis CSS (`:root`)
- ✅ Tailwind incluído (CDN)
- ✅ Chart.js + xlsx para BI/export
- ✅ Responsividade considerada (grid auto-fill)
- ✅ Autenticação basic (RV.papel)
- ✅ Font-Awesome para ícones

---

## 📋 Checklist para Opus — Fase 0

**Ordem:**
1. Refatorar HTML → `modules/{modulo}/` (dashboard, kanban, contas-pagar, etc.)
2. Extrair CSS → `css/base.css` + módulos
3. Extrair JS → `js/core.js`, `js/router.js`, `js/auth.js`
4. Implementar lazy-load dos módulos
5. Testes mobile (375px, 768px, 1024px)
6. Verificar zero console errors
7. Commit: `refactor: modularizar código`

**Não fazer na Fase 0:**
- ❌ Novo módulo (Conciliação fica para Semana 3)
- ❌ Redesign de UI
- ❌ Mudar banco de dados

---

## 📊 Métrica de Sucesso (Fase 0)

| Critério | Antes | Depois |
|----------|-------|--------|
| Tamanho index.html | 12.928 linhas | < 2.000 linhas (entry point) |
| CSS duplicado | 3x | 1x (base.css) |
| Módulos isolados | Não | Sim (8 módulos independentes) |
| Load mobile 375px | ❌ Quebra | ✅ Funciona 60fps |
| Deploy tempo | ~30s | ~10s (menos compilação) |
| Console errors | ? | 0 |

---

## 📂 Estrutura Final Esperada (após Fase 0)

```
renovatruck_portal/
├── index.html              (mínimo, ~1.5k linhas)
├── js/
│   ├── core.js            (funções comuns)
│   ├── router.js          (openModule lazy)
│   ├── auth.js
│   └── utils.js
├── css/
│   ├── base.css           (variáveis, reset)
│   └── responsive.css     (breakpoints)
├── modules/
│   ├── dashboard/
│   │   ├── index.js
│   │   ├── template.html
│   │   └── style.css
│   ├── kanban/
│   ├── contaspagar/
│   ├── contasreceber/
│   ├── resultado/
│   ├── precificacao/
│   ├── abc/
│   ├── historico/
│   └── manual/
└── [resto igual]
```

---

**Status:** 🟡 Aguardando Opus implementar Fase 0  
**Dependência:** Nenhuma  
**Próximo:** Após conclusão, passar para Opus: Módulo 1 (Conciliação Bancária)
