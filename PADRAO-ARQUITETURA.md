# Padrão de Arquitetura — Sistema de Gestão Renova
## Modularização, convenções e guidelines

---

## 1. Estrutura de Pastas (Pós-Refactor)

```
renovatruck_portal/
├── index.html                  # Entry point (mínimo, só scripts)
├── js/
│   ├── core.js                # Funções compartilhadas, constantes globais
│   ├── router.js              # openModule() otimizado, carregamento lazy
│   ├── auth.js                # Login, sessão, papéis (rvPodeEditar, etc)
│   └── utils.js               # Helpers (parseDate, fmtMoney, norm, clean)
├── css/
│   ├── tailwind.min.css       # CDN ou bundle local
│   ├── base.css               # Variáveis CSS, resets, padrão Renova
│   └── responsive.css         # Mobile-first breakpoints
├── modules/
│   ├── dashboard/
│   │   ├── index.js
│   │   ├── template.html
│   │   ├── style.css
│   │   └── README.md
│   ├── kanban/
│   ├── contaspagar/
│   ├── contasreceber/
│   ├── resultado/
│   ├── precificacao/
│   ├── abc/
│   ├── historico/
│   ├── manual/
│   ├── conciliacao/            # ← NOVO
│   ├── fluxo-caixa/            # ← NOVO
│   ├── dre/                    # ← NOVO
│   ├── dashboard-comercial/    # ← NOVO
│   ├── crm/                    # ← NOVO
│   ├── evidencias/             # ← NOVO
│   ├── rh/                     # ← NOVO
│   └── colaborador/            # ← NOVO (link separado)
├── assets/
│   ├── logo-renova.jpg
│   └── [ícones, imagens]
├── apps-script/
│   ├── core.gs                 # Funções compartilhadas
│   ├── contas-pagar.gs
│   ├── contas-receber.gs
│   ├── resultado-semanal.gs
│   ├── conciliacao.gs          # ← NOVO
│   ├── fluxo-caixa.gs          # ← NOVO
│   ├── dre.gs                  # ← NOVO
│   ├── dashboard-comercial.gs  # ← NOVO
│   ├── crm.gs                  # ← NOVO
│   ├── evidencias.gs           # ← NOVO
│   ├── rh.gs                   # ← NOVO
│   └── manual-empresa.gs       # (mantém)
├── integracao/
│   ├── extrair-*.js            # (mantém)
│   └── LEIA-ME-*.md
├── docs/
│   ├── PADROES.md              # ← NOVO (guideline)
│   ├── CHECKLIST-DEPLOYMENT.md # ← NOVO
│   └── API-APPS-SCRIPT.md      # ← NOVO (referência de todos os /exec)
├── link-colaborador/           # ← NOVO (separado)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── PLANO-EXECUCAO.md
├── PADRAO-ARQUITETURA.md       # (este arquivo)
├── CLAUDE.md
├── .env
└── dados.json
```

---

## 2. Padrão de Módulo (Template)

### Arquivo: `modules/{modulo}/index.js`

```javascript
/**
 * Módulo: {Nome Legível}
 * Descrição: {O que faz}
 * Depende de: {Quais dados}
 * Publicado: {Data}
 * Autor: Claude Opus
 */

const MODULE_{MODULO_UPPER} = (() => {
  // ─── ESTADO ────────────────────────────────────────────────
  let state = {
    data: [],
    filters: {},
    activeTab: 'tab-principal',
  };

  // ─── CONFIG ────────────────────────────────────────────────
  const CONFIG = {
    API_ENDPOINT: 'https://script.google.com/macros/s/AKfycb...XXXXX/exec',
    REFRESH_INTERVAL: 30000, // ms
    PAGE_SIZE: 50,
  };

  // ─── INIT ──────────────────────────────────────────────────
  async function init() {
    log('[{modulo}] Inicializando...');
    try {
      renderUI();
      attachEventListeners();
      await loadData();
      log('[{modulo}] ✓ Pronto');
    } catch(e) {
      logError('[{modulo}] Erro ao inicializar', e);
      showErrorMsg('Erro ao carregar módulo. Tente novamente.');
    }
  }

  // ─── FETCH ────────────────────────────────────────────────
  async function loadData() {
    showLoading('Carregando dados...');
    try {
      const res = await fetch(CONFIG.API_ENDPOINT);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      state.data = processRows(payload);
      render();
      hideLoading();
    } catch(e) {
      hideLoading();
      logError('[{modulo}] Erro ao buscar dados', e);
      showErrorMsg('Erro ao carregar. Verifique conexão.');
    }
  }

  function processRows(payload) {
    // ← Transformar dados brutos em estado limpo
    return (payload || []).map(row => ({
      ...row,
      // parsed fields, calculated fields
    }));
  }

  // ─── RENDER ────────────────────────────────────────────────
  function renderUI() {
    const html = document.getElementById('screen-{modulo}');
    if (html) html.innerHTML = TEMPLATE;
  }

  function render() {
    // ← Lógica de render incremental
    // renderTabs();
    // renderTable();
    // renderCharts();
  }

  // ─── EVENTS ────────────────────────────────────────────────
  function attachEventListeners() {
    // Delegação de eventos (document.addEventListener melhor que inline onclick)
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-novo')) handleNew();
      else if (e.target.classList.contains('btn-editar')) handleEdit(e);
      else if (e.target.classList.contains('btn-deletar')) handleDelete(e);
      else if (e.target.classList.contains('btn-salvar')) handleSave();
    });

    // Abas
    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Input de busca (com debounce)
    const searchInput = document.querySelector('[data-search]');
    if (searchInput) {
      searchInput.addEventListener('input', debounce((e) => {
        state.filters.search = e.target.value;
        render();
      }, 300));
    }
  }

  // ─── HANDLERS ───────────────────────────────────────────────
  async function handleNew() {
    openModal('novo-item');
  }

  async function handleEdit(e) {
    const id = e.target.closest('[data-id]').dataset.id;
    const item = state.data.find(x => x.id === id);
    if (!item) return;
    populateModal(item);
    openModal('editar-item');
  }

  async function handleDelete(e) {
    const id = e.target.closest('[data-id]').dataset.id;
    if (!confirm('Confirma deletar?')) return;
    try {
      showLoading('Deletando...');
      await fetch(CONFIG.API_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', id })
      });
      state.data = state.data.filter(x => x.id !== id);
      render();
      showSuccessMsg('Deletado com sucesso!');
    } catch(e) {
      logError('[{modulo}] Erro ao deletar', e);
      showErrorMsg('Erro ao deletar.');
    }
  }

  async function handleSave() {
    const formData = getFormData();
    if (!validateForm(formData)) return;
    
    try {
      showLoading('Salvando...');
      const res = await fetch(CONFIG.API_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ action: 'save', data: formData })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      // Atualizar estado localmente
      if (formData.id) {
        state.data = state.data.map(x => x.id === formData.id ? formData : x);
      } else {
        state.data.push(formData);
      }
      
      closeModal();
      render();
      showSuccessMsg('Salvo com sucesso!');
    } catch(e) {
      logError('[{modulo}] Erro ao salvar', e);
      showErrorMsg('Erro ao salvar. Tente novamente.');
    }
  }

  function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('[data-tab]').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });
    document.querySelectorAll('[data-tab-pane]').forEach(p => {
      p.style.display = p.dataset.tabPane === tabName ? 'block' : 'none';
    });
  }

  // ─── HELPERS ───────────────────────────────────────────────
  function getFormData() {
    return {
      id: document.querySelector('[name="id"]')?.value || '',
      campo1: document.querySelector('[name="campo1"]')?.value || '',
      campo2: parseFloat(document.querySelector('[name="campo2"]')?.value || 0),
      // ...
    };
  }

  function validateForm(data) {
    if (!data.campo1) {
      showErrorMsg('Campo obrigatório não preenchido.');
      return false;
    }
    return true;
  }

  function populateModal(item) {
    document.querySelector('[name="id"]').value = item.id;
    document.querySelector('[name="campo1"]').value = item.campo1;
    // ...
  }

  // ─── PUBLIC API ────────────────────────────────────────────
  return {
    init,
    loadData,
  };
})();

// ── INTEGRAÇÃO GLOBAL ──────────────────────────────────────────
function initModuloXXX() {
  MODULE_MODULO_UPPER.init();
}

// Inserir no template HTML:
// <script src="modules/{modulo}/index.js"></script>

// Chamar em openModule():
// if(m === '{modulo}' && typeof initModuloXXX === 'function') initModuloXXX();

const TEMPLATE = `
<!-- Aqui entra o HTML do módulo (vide seção 3) -->
`;
```

---

## 3. Template HTML de Módulo

Padrão para `modules/{modulo}/template.html`:

```html
<!-- Cabeçalho do módulo (volta + título) -->
<div class="tool-nav">
  <button class="back-btn" onclick="goHome()"><i class="fa-solid fa-chevron-left"></i>Início</button>
  <img src="assets/logo-renova.jpg" style="height:32px;filter:drop-shadow(0 1px 4px rgba(0,0,0,.4));" />
  <span style="font-size:.85rem;font-weight:800;">{Nome Módulo}</span>
</div>

<!-- Cabeçalho com filtros/ações -->
<header style="background:linear-gradient(135deg,#0f172a,#1e3a5f);color:#fff;position:sticky;top:0;z-index:40;box-shadow:0 2px 12px rgba(0,0,0,.2);">
  <div class="header-inner" style="max-width:1400px;margin:0 auto;padding:.6rem 1rem;display:flex;justify-content:space-between;align-items:center;gap:10px;">
    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <div style="font-size:.76rem;color:#94a3b8;">
        <span id="record-count" style="color:#7dd3fc;font-weight:700;">0</span> registros
      </div>
    </div>
    <div class="header-right" style="display:flex;align-items:center;gap:6px;">
      <input type="text" data-search placeholder="Buscar..." style="padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:.85rem;width:200px;max-width:200px;" />
      <button class="btn-novo" onclick="MODULE_{MODULO}.new()" style="background:#10b981;color:#fff;border:none;border-radius:6px;padding:7px 13px;font-size:.85rem;font-weight:700;cursor:pointer;">+ Novo</button>
      <button class="refresh-btn" onclick="MODULE_{MODULO}.loadData()"><i class="fa-solid fa-rotate-right"></i></button>
    </div>
  </div>
</header>

<!-- Abas (se aplicável) -->
<nav style="background:#fff;border-bottom:1px solid var(--border);position:sticky;top:60px;z-index:30;">
  <div style="max-width:1400px;margin:0 auto;padding:0 1rem;display:flex;overflow-x:auto;">
    <button data-tab="tab-principal" class="nav-btn active"><i class="fa-solid fa-list"></i>Principal</button>
    <button data-tab="tab-detalhes" class="nav-btn"><i class="fa-solid fa-info-circle"></i>Detalhes</button>
  </div>
</nav>

<!-- Conteúdo principal -->
<main style="max-width:1400px;margin:0 auto;padding:1.2rem 1rem 5rem;">
  
  <!-- ABA 1 -->
  <div data-tab-pane="tab-principal" style="display:block;">
    <!-- Cards KPI (se aplicável) -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:1rem;margin-bottom:1.5rem;">
      <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:1rem;text-align:center;">
        <div style="font-size:.76rem;color:var(--muted);font-weight:700;text-transform:uppercase;">Total</div>
        <div style="font-size:1.8rem;font-weight:900;color:#0f172a;margin-top:.3rem;" id="kpi-total">—</div>
      </div>
      <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:1rem;text-align:center;">
        <div style="font-size:.76rem;color:var(--muted);font-weight:700;text-transform:uppercase;">Ativo</div>
        <div style="font-size:1.8rem;font-weight:900;color:#10b981;margin-top:.3rem;" id="kpi-ativo">—</div>
      </div>
    </div>

    <!-- Tabela responsiva -->
    <div style="background:#fff;border:1px solid var(--border);border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:.85rem;">
          <thead style="background:#f1f5f9;border-bottom:2px solid var(--border);">
            <tr>
              <th style="text-align:left;padding:1rem;font-weight:700;color:#0f172a;">Nome</th>
              <th style="text-align:left;padding:1rem;font-weight:700;color:#0f172a;">Status</th>
              <th style="text-align:right;padding:1rem;font-weight:700;color:#0f172a;">Valor</th>
              <th style="text-align:center;padding:1rem;font-weight:700;color:#0f172a;">Ações</th>
            </tr>
          </thead>
          <tbody id="table-body">
            <!-- Preenchido por JS -->
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ABA 2 -->
  <div data-tab-pane="tab-detalhes" style="display:none;">
    <!-- Conteúdo detalhes -->
  </div>

</main>

<!-- Modal de edição -->
<div id="modal-novo" class="modal" style="display:none;">
  <div class="modal-content">
    <div class="modal-header">
      <h2>Novo Registro</h2>
      <button class="modal-close" onclick="closeModal('modal-novo')"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body">
      <form id="form-novo">
        <input type="hidden" name="id" />
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:.85rem;font-weight:700;color:#0f172a;margin-bottom:.3rem;">Campo 1</label>
          <input type="text" name="campo1" placeholder="..." style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:.85rem;" />
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:.85rem;font-weight:700;color:#0f172a;margin-bottom:.3rem;">Campo 2</label>
          <input type="number" name="campo2" placeholder="0.00" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:.85rem;" />
        </div>
      </form>
    </div>
    <div class="modal-footer" style="display:flex;gap:.5rem;justify-content:flex-end;">
      <button onclick="closeModal('modal-novo')" style="background:#e2e8f0;color:#0f172a;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:700;">Cancelar</button>
      <button class="btn-salvar" onclick="MODULE_{MODULO}.save()" style="background:#0284c7;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:700;">Salvar</button>
    </div>
  </div>
</div>

<!-- Loading + Toast (compartilhados em core.js) -->
```

---

## 4. Padrão CSS (Mobile-First)

Arquivo: `modules/{modulo}/style.css`

```css
/* ─── VARIÁVEIS (herdam de base.css) ─── */
:root {
  --primary: #0f172a;
  --primary-light: #1e3a5f;
  --accent: #0284c7;
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;
  --muted: #64748b;
  --border: #e2e8f0;
  --bg: #f8fafc;
}

/* ─── MOBILE FIRST (default) ─── */
.module-container {
  display: block;
  padding: 1rem;
}

.data-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

button {
  min-height: 44px; /* Toque acessível */
  min-width: 44px;
  font-size: 1rem;
  padding: 0.5rem 1rem;
}

input, textarea, select {
  font-size: 16px; /* Evita zoom ao focar em iOS */
  padding: 0.75rem;
  min-height: 44px;
}

/* ─── TABLET (768px+) ─── */
@media (min-width: 768px) {
  .data-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .module-container {
    padding: 1.5rem;
  }
}

/* ─── DESKTOP (1024px+) ─── */
@media (min-width: 1024px) {
  .data-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  
  .module-container {
    padding: 2rem;
  }
}

/* ─── TABELAS RESPONSIVAS ─── */
table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: var(--bg);
  border-bottom: 2px solid var(--border);
}

th, td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

/* Em mobile, transformar tabela em cards */
@media (max-width: 767px) {
  table, thead, tbody, tr, th, td {
    display: block;
    width: 100%;
  }
  
  thead {
    display: none;
  }
  
  tr {
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 1rem;
    padding: 1rem;
  }
  
  td {
    padding-left: 50%;
    position: relative;
    border: none;
  }
  
  td:before {
    content: attr(data-label);
    position: absolute;
    left: 0;
    font-weight: 700;
    color: var(--muted);
  }
}

/* ─── FORMS ─── */
.form-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  font-weight: 700;
  color: var(--primary);
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

input, select, textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-family: inherit;
}

/* ─── MODAL ─── */
.modal {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  align-items: center;
  justify-content: center;
}

.modal.open {
  display: flex;
}

.modal-content {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  max-width: 500px;
  width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid var(--border);
}

.modal-body {
  padding: 1.5rem;
}

.modal-footer {
  display: flex;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border);
  justify-content: flex-end;
}

/* ─── LOADING / TOASTS ─── */
.toast {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  background: #fff;
  border-left: 4px solid var(--accent);
  padding: 1rem;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

---

## 5. Funções Compartilhadas (core.js)

Todas as funções abaixo já devem existir em `js/core.js`:

```javascript
// ─── LOGGER ───────────────────────────────────
function log(msg) { console.log(msg); }
function logError(msg, e) { console.error(msg, e); }

// ─── FORMATO ───────────────────────────────────
function fmtDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return '–';
  return d.toLocaleDateString('pt-BR');
}

function fmtMoney(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPercent(v) {
  return ((v || 0) * 100).toFixed(2) + '%';
}

function parseDate(raw) {
  if (!raw || raw === '') return null;
  const formats = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // DD/MM/YYYY
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
  ];
  for (let fmt of formats) {
    const m = raw.match(fmt);
    if (m) {
      const d = fmt === formats[0]
        ? new Date(m[3], m[2] - 1, m[1])
        : new Date(m[1], m[2] - 1, m[3]);
      return !isNaN(d) ? d : null;
    }
  }
  return null;
}

function parseMoneyBR(raw) {
  if (!raw) return 0;
  return parseFloat(
    raw.toString()
      .replace(/\./g, '')
      .replace(',', '.')
  ) || 0;
}

// ─── STRINGS ───────────────────────────────────
const norm = s => s
  ? s.toString().trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
  : "";

const clean = s => s ? s.toString().trim().toUpperCase() : "";

// ─── ARRAYS ────────────────────────────────────
function groupBy(list, key) {
  const m = {}, c = {};
  (list || []).forEach(item => {
    const k = item[key];
    m[k] = (m[k] || 0) + (item.valor || 0);
    c[k] = (c[k] || 0) + 1;
  });
  return Object.entries(m)
    .map(([name, val]) => ({ name, val, count: c[name] }))
    .sort((a, b) => b.val - a.val);
}

function debounce(fn, delay) {
  let id;
  return function(...args) {
    clearTimeout(id);
    id = setTimeout(() => fn.apply(this, args), delay);
  };
}

function throttle(fn, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ─── UI / MODAL ────────────────────────────────
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

function showLoading(msg) {
  document.getElementById('loading-msg').textContent = msg || 'Carregando...';
  document.getElementById('loading-screen').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading-screen').style.display = 'none';
}

function showSuccessMsg(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.borderLeftColor = '#10b981';
  toast.innerHTML = `<strong style="color:#10b981;">✓ Sucesso</strong><br>${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showErrorMsg(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.borderLeftColor = '#ef4444';
  toast.innerHTML = `<strong style="color:#ef4444;">✗ Erro</strong><br>${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ─── AUTH ──────────────────────────────────────
function rvPodeEditar() { return RV.papel === 'admin'; }
function rvPodeVer() { return !!RV.usuario; }
```

---

## 6. Checklist de Novo Módulo

Ao criar `modules/{novo}/`:

- [ ] Criar pasta: `modules/{novo}/`
- [ ] Criar arquivos:
  - [ ] `index.js` (copiar template de seção 2)
  - [ ] `template.html` (copiar template de seção 3)
  - [ ] `style.css` (copiar padrão de seção 4)
  - [ ] `README.md` (descrição + como usar)
- [ ] No `index.html`:
  - [ ] Adicionar `<div id="screen-{novo}"></div>`
  - [ ] Adicionar `<script src="modules/{novo}/index.js"></script>`
  - [ ] Adicionar ao `openModule()`: `if(m === '{novo}' && typeof init{Novo} === 'function') init{Novo}();`
- [ ] No `apps-script/`:
  - [ ] Criar `{novo}.gs` com funções backend
  - [ ] Publicar e pegar URL do /exec
  - [ ] Atualizar `CONFIG.API_ENDPOINT` em `modules/{novo}/index.js`
- [ ] No menu da home:
  - [ ] Adicionar card com ícone, nome, descrição
  - [ ] Definir badge (Ativo / Em breve)
- [ ] Testes:
  - [ ] [ ] Desktop (1920px): funciona?
  - [ ] [ ] Tablet (768px): layout responsivo?
  - [ ] [ ] Mobile (375px): sem quebra, botões acessíveis?
  - [ ] [ ] Console: zero erros?
  - [ ] [ ] Performance: load < 2s, interação < 300ms?
- [ ] Commit:
  ```
  feat: módulo {Nome} implementado
  
  - Estrutura modular criada
  - Backend {novo}.gs publicado
  - Frontend responsivo (mobile first)
  - Testes em 3 breakpoints
  
  Co-Authored-By: Claude Opus <noreply@anthropic.com>
  ```

---

## 7. Guia de Responsividade

**Breakpoints padrão:**
```css
/* Mobile: < 640px */
/* Tablet: 640px - 1023px */
/* Desktop: >= 1024px */
```

**Checklist por breakpoint:**

| Breakpoint | O quê testar | Critério |
|---|---|---|
| **375px** (iPhone SE) | Cards verticais, sem scroll horizontal, botões 44px+ | Sem quebra de layout |
| **768px** (iPad) | Grid 2 colunas, inputs grandes, tabelas com scroll | Confortável no paisagem |
| **1024px+** (Desktop) | Grid 3+ colunas, tooltips, modals centrados | Aproveitamento de espaço |

**Ferramentas:**
- Chrome DevTools: F12 → Toggle Device Toolbar (Ctrl+Shift+M)
- Testar em dispositivo real: real phone + real tablet

---

## 8. Padrão de Commits

Todos os commits devem seguir:

```
feat: {módulo} {descrição breve}

- Detalhe 1
- Detalhe 2
- Detalhe 3

Co-Authored-By: Claude Opus <noreply@anthropic.com>
```

**Exemplos:**
```
feat: modularizar código, preparar para novos módulos

- Refatorar 12.928 linhas de index.html
- Criar estrutura modules/{módulo}
- Implementar router lazy-load
- Zero console errors em todos os breakpoints

Co-Authored-By: Claude Opus <noreply@anthropic.com>
```

```
feat: módulo Conciliação Bancária implementado

- CRUD de bancos
- Reconciliação diária com Contas a Pagar/Receber
- Histórico de reconciliações
- Responsivo em mobile (375px+)
- Apps Script back-end publicado

Co-Authored-By: Claude Opus <noreply@anthropic.com>
```

---

## 9. Integração com Apps Script

**Padrão de função pública em `.gs`:**

```javascript
function doGet(e) {
  // GET /exec?action=listar
  const action = e.parameter.action || '';
  
  if (action === 'listar') return doListar(e);
  if (action === 'detalhes') return doDetalhes(e);
  if (action === 'sync') return doSync(e);
  
  return ContentService
    .createTextOutput(JSON.stringify({ erro: 'Ação inválida' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  // POST /exec com body JSON
  const payload = JSON.parse(e.postData.contents);
  const { action, data } = payload;
  
  if (action === 'salvar') return doSalvar(data);
  if (action === 'deletar') return doDeLetar(data);
  
  return ContentService
    .createTextOutput(JSON.stringify({ erro: 'Ação inválida' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doListar(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    const data = sheet.getDataRange().getValues();
    // transformar em JSON
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return ContentService
      .createTextOutput(JSON.stringify({ erro: e.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

**Frontend chamando:**

```javascript
// GET
const res = await fetch(API_ENDPOINT + '?action=listar');
const { data } = await res.json();

// POST
const res = await fetch(API_ENDPOINT, {
  method: 'POST',
  body: JSON.stringify({ action: 'salvar', data: { id: 1, nome: 'Test' } })
});
const { ok, erro } = await res.json();
```

---

## 10. Documentação Obrigatória

Cada módulo precisa de `README.md`:

```markdown
# Módulo: {Nome}

## Descrição
{O que faz, para quem, por quê}

## Dependências
- {Dados de qual módulo}
- {Qual Apps Script}
- {Qual Google Sheet}

## Acesso
- Quem pode usar: {admin / todos / específicos}
- Menu: Financeiro → {nome}
- URL: #{modulo}

## Como usar
1. Passo 1
2. Passo 2
3. Passo 3

## Como manter
- Backend: `apps-script/{modulo}.gs`
- Frontend: `modules/{modulo}/`
- Dados: {Google Sheet ID / DB}

## Troubleshooting
- **Problema A:** Solução A
- **Problema B:** Solução B

## Histórico
- v1.0 (19/09/2026): Lançamento
```

---

## 11. Ferramentas Recomendadas

**Para desenvolvimento:**
- VS Code (extensão: HTML/CSS/JS Intellisense)
- Chrome DevTools (responsividade, debugging)
- Postman (testar APIs antes de integrar)

**Para qualidade:**
- Skill `capricho`: Antes de considerar pronto
- `code-review`: Após implementação completa

---

## 12. FAQ de Padrão

**P: Por que módulos em pastas e não único HTML?**
R: Modular = reutilizável, testável, manutenível. Refactoring de 12k linhas fica impossível depois.

**P: Posso usar jQuery ou outra biblioteca?**
R: Não. Vanilla JS puro. Dependências: Tailwind (já temos), Chart.js, xlsx (já temos). Nada mais.

**P: Como testar em mobile?**
R: DevTools (Ctrl+Shift+M) + dispositivo real. Se não testar em real, quebra.

**P: Posso deixar TODO no código?**
R: Não. TODO = ainda não feito. Nada de "em breve" no código. Ou termina ou não inclui.

**P: Como lidar com dados sensíveis?**
R: NUNCA em `.js`. Dados sensíveis vêm via Apps Script (criptografado pela VPS).

---

**Status:** Pronto para Opus implementar  
**Última atualização:** 19/09/2026
