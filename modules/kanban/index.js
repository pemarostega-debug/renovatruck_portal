/**
 * Módulo: Kanban Operacional
 * Veículos no pátio (portaria) organizados em colunas, com OSs vinculadas.
 * Carregado sob demanda por js/router.js na primeira vez em que a tela abre.
 */

const KB = {
  // Cole aqui a MESMA URL /exec do Apps Script da portaria (após publicar).
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby4MrxryOIBsbJAZbb_WG4GsiK_YsRgqhWYII1XFvguoEZ1x23JOh7TMVWKgiaAKOwu/exec',
  COLUNAS: ['AGUARDANDO (ORÇAMENTO / VAGA)','AGUARDANDO PEÇA','EM EXECUÇÃO','FINALIZADOS','OUTROS'],
  LS_KEY: 'rv_kanban_estado',
  patio: [],      // registros "No Pátio" vindos da portaria
  estado: {},     // card_id -> { coluna, os:[], observacao, valorPeca, ordem }
  osMap: {},      // numero_os -> { valor, cliente, fase }
  osReady: false,
  demo: false,
  cardAtivo: null
};

// Dados de pré-visualização (usados só enquanto o Apps Script não estiver conectado)
const KB_DEMO_PATIO = [
  {ID:'RT-001',Tipo_Veiculo:'Conjunto',Placa_Cavalo:'ABC1D23',Placa_Carreta:'XYZ4E56',Motorista:'João Silva',Cliente_Destino:'Fadel Transportes',Status_Cavalo:'No Pátio',Status_Carreta:'No Pátio'},
  {ID:'RT-002',Tipo_Veiculo:'Cavalo',Placa_Cavalo:'BCD2E34',Placa_Carreta:'',Motorista:'Carlos Mendes',Cliente_Destino:'',Status_Cavalo:'No Pátio',Status_Carreta:'N/A'},
  {ID:'RT-003',Tipo_Veiculo:'Carreta',Placa_Cavalo:'',Placa_Carreta:'QRS7T89',Motorista:'',Cliente_Destino:'Vale Log',Status_Cavalo:'N/A',Status_Carreta:'No Pátio'},
  {ID:'RT-004',Tipo_Veiculo:'Utilitário',Placa_Cavalo:'JKL9M01',Placa_Carreta:'',Motorista:'Cliente visitante',Cliente_Destino:'',Status_Cavalo:'No Pátio',Status_Carreta:'N/A'}
];

function kbBRL(v){ return (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function kbNotice(msg,tipo){ const el=document.getElementById('kb-notice'); if(!msg){el.className='kb-notice';el.textContent='';return;} el.className='kb-notice '+(tipo||'info'); el.innerHTML=msg; }

// ── Carrega o mapa de OSs a partir do dados.json já usado no portal ──
async function kbCarregarOS(){
  try{
    const r = await fetch('https://raw.githubusercontent.com/pemarostega-debug/renovatruck_portal/main/dados.json?t='+Date.now());
    const p = await r.json();
    (p.ordens||[]).forEach(o=>{
      KB.osMap[String(o.numero_os)] = {
        valor: parseFloat(o.valor_total)||0,
        cliente: o.razao_cliente||'',
        fase: o.descricao_fase||''
      };
    });
    KB.osReady = true;
  }catch(e){ console.warn('Kanban: falha ao ler dados.json', e); }
}

// ── Ponto de entrada (chamado por openModule) ──
async function initKanban(){
  if(!KB.osReady) await kbCarregarOS();
  await kbCarregar();
}

// ── Busca pátio + estado do quadro ──
async function kbCarregar(){
  KB.demo = KB.APPS_SCRIPT_URL.includes('SEU_ID_AQUI');
  document.getElementById('kb-board').innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:30px;font-size:.85rem;">Carregando pátio…</div>';
  try{
    if(KB.demo){
      KB.patio = KB_DEMO_PATIO.map(x=>Object.assign({},x));
      KB.estado = kbLocalLoad();
      kbNotice('<b>Pré-visualização.</b> Conecte o Apps Script da portaria (cole a URL /exec em <code>KB.APPS_SCRIPT_URL</code>) para ver o pátio real. Suas mudanças aqui ficam salvas só neste navegador.','info');
    } else {
      const [patioRes, estRes] = await Promise.all([
        fetch(KB.APPS_SCRIPT_URL+'?action=patio').then(r=>r.json()),
        fetch(KB.APPS_SCRIPT_URL+'?action=kanban_get').then(r=>r.json())
      ]);
      KB.patio = (patioRes && patioRes.data) || [];
      KB.estado = {};
      ((estRes && estRes.data) || []).forEach(k=>{
        // Migração: coluna "AGUARDANDO" renomeada para "AGUARDANDO (ORÇAMENTO / VAGA)"
        const coluna = k.coluna==='AGUARDANDO' ? KB.COLUNAS[0] : k.coluna;
        KB.estado[String(k.card_id)] = {
          coluna: KB.COLUNAS.includes(coluna) ? coluna : KB.COLUNAS[0],
          os: String(k.os_atribuidas||'').split(',').map(s=>s.trim()).filter(Boolean),
          observacao: k.observacao || '',
          valorPeca: parseFloat(k.valor_peca)||0,
          ordem: Number(k.ordem)||0
        };
      });
      kbNotice('');
    }
  }catch(e){
    KB.patio = []; KB.estado = kbLocalLoad();
    kbNotice('Não consegui conectar no Apps Script da portaria: '+e.message,'erro');
  }
  // Garante um estado inicial para cada equipamento no pátio
  KB.patio.forEach((r,i)=>{
    const id=String(r.ID);
    if(!KB.estado[id]) KB.estado[id]={coluna:KB.COLUNAS[0],os:[],observacao:'',valorPeca:0,ordem:i};
  });
  kbRender();
}

// ── Render geral ──
function kbRender(){ kbRenderBI(); kbRenderBoard(); }

function kbTotalCard(id){
  const st=KB.estado[id]; if(!st) return 0;
  return st.os.reduce((s,n)=>s+((KB.osMap[n]&&KB.osMap[n].valor)||0),0);
}

function kbRenderBI(){
  const tipos={}; let valorTotal=0, totalOS=0, valorPecas=0;
  KB.patio.forEach(r=>{
    const t=r.Tipo_Veiculo||'Outro';
    tipos[t]=(tipos[t]||0)+1;
    const st=KB.estado[String(r.ID)];
    if(st){ valorTotal += kbTotalCard(String(r.ID)); totalOS += st.os.length; valorPecas += st.valorPeca||0; }
  });
  document.getElementById('kb-valor-total').textContent = kbBRL(valorTotal);
  document.getElementById('kb-valor-sub').textContent = totalOS+' OS(s) atribuída(s) a '+KB.patio.length+' equipamento(s)';
  document.getElementById('kb-total-eq').textContent = KB.patio.length;
  const ordem=['Conjunto','Cavalo','Carreta','Truck','Utilitário','Visitante'];
  const chaves=Object.keys(tipos).sort((a,b)=>{const ia=ordem.indexOf(a),ib=ordem.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});
  const chipsTipos = chaves.length
    ? chaves.map(t=>`<div class="kb-bi-chip"><span class="kb-bi-num">${tipos[t]}</span><span class="kb-bi-lbl">${t}</span></div>`).join('')
    : '<span style="font-size:.78rem;color:#94a3b8;">Nenhum equipamento no pátio.</span>';
  const chipPeca = `<div class="kb-bi-chip kb-bi-chip-peca"><span class="kb-bi-num">${kbBRL(valorPecas)}</span><span class="kb-bi-lbl">Peças (compra)</span></div>`;
  document.getElementById('kb-tipos').innerHTML = chipsTipos + chipPeca;
}

function kbRenderBoard(){
  const board=document.getElementById('kb-board');
  board.innerHTML = KB.COLUNAS.map(col=>{
    const cards=KB.patio
      .filter(r=>(KB.estado[String(r.ID)]||{}).coluna===col)
      .sort((a,b)=>((KB.estado[String(a.ID)]||{}).ordem||0)-((KB.estado[String(b.ID)]||{}).ordem||0));
    const colTotal = cards.reduce((s,r)=>s+kbTotalCard(String(r.ID)),0);
    const inner = cards.length
      ? cards.map(kbCardHTML).join('')
      : '<div class="kb-empty">Arraste cards para cá</div>';
    return `<div class="kb-col" data-col="${col}" ondragover="kbColOver(event)" ondragleave="kbColLeave(event)" ondrop="kbDrop(event,'${col}')">
      <div class="kb-col-h"><span><span class="dot"></span>${col}</span><span class="kb-col-count">${cards.length}</span></div>
      <div class="kb-col-total">${kbBRL(colTotal)}</div>
      <div class="kb-cards">${inner}</div>
    </div>`;
  }).join('');
}

function kbCardHTML(r){
  const id=String(r.ID);
  const st=KB.estado[id]||{os:[],observacao:'',valorPeca:0};
  const placas=[r.Placa_Cavalo,r.Placa_Carreta].filter(Boolean).join(' + ')||'—';
  const total=kbTotalCard(id);
  const chips=(st.os||[]).map(n=>`<span class="kb-os">OS ${n}</span>`).join('');
  return `<div class="kb-card" draggable="true" data-id="${id}" ondragstart="kbDragStart(event)" ondragend="kbDragEnd(event)">
    <div class="kb-card-top"><span class="kb-tipo">${r.Tipo_Veiculo||'—'}</span><span class="kb-placa">${placas}</span></div>
    ${r.Motorista?`<div class="kb-motorista"><i class="fa-solid fa-user"></i> ${r.Motorista}</div>`:''}
    ${r.Cliente_Destino?`<div class="kb-cliente"><i class="fa-solid fa-building"></i> ${r.Cliente_Destino}</div>`:''}
    <div class="kb-oss">${chips||'<span class="kb-noos">sem OS atribuída</span>'}</div>
    <div class="kb-fields">
      <textarea class="kb-obs" rows="2" placeholder="Observação..." onmousedown="event.stopPropagation()" onchange="kbSetObs('${id}',this.value)">${kbEsc(st.observacao)}</textarea>
      <div class="kb-peca">
        <label><i class="fa-solid fa-screwdriver-wrench"></i>Peça</label>
        <input type="number" class="kb-peca-input" step="0.01" min="0" placeholder="R$ 0,00 (compra)" value="${st.valorPeca?st.valorPeca:''}" onmousedown="event.stopPropagation()" onchange="kbSetValorPeca('${id}',this.value)">
      </div>
    </div>
    <div class="kb-card-foot">
      <button class="kb-btn-os" onclick="kbAbrirOS('${id}')"><i class="fa-solid fa-file-invoice"></i> OSs</button>
      <span class="kb-total">${kbBRL(total)}</span>
    </div>
  </div>`;
}

// ── Observação livre e valor de compra de peça (editados direto no card) ──
function kbSetObs(id,val){
  if(!KB.estado[id]) return;
  KB.estado[id].observacao = val;
  kbSalvar();
}
function kbSetValorPeca(id,val){
  if(!KB.estado[id]) return;
  KB.estado[id].valorPeca = parseFloat(val)||0;
  kbRenderBI();
  kbSalvar();
}

// ── Drag & drop ──
let kbDragId=null;
function kbDragStart(e){
  if(e.target.closest('textarea,input,button,select')){ e.preventDefault(); return; }
  kbDragId=e.currentTarget.dataset.id; e.currentTarget.classList.add('dragging'); if(e.dataTransfer){e.dataTransfer.effectAllowed='move';}
}
function kbDragEnd(e){ e.currentTarget.classList.remove('dragging'); document.querySelectorAll('#kb-board .kb-col').forEach(c=>c.classList.remove('over')); }
function kbColOver(e){ e.preventDefault(); e.currentTarget.classList.add('over'); if(e.dataTransfer){e.dataTransfer.dropEffect='move';} }
function kbColLeave(e){ e.currentTarget.classList.remove('over'); }
function kbDrop(e,coluna){
  e.preventDefault();
  e.currentTarget.classList.remove('over');
  if(!kbDragId || !KB.estado[kbDragId]) return;
  const maxOrdem=KB.patio.reduce((m,r)=>{const s=KB.estado[String(r.ID)];return (s&&s.coluna===coluna)?Math.max(m,s.ordem||0):m;},0);
  KB.estado[kbDragId].coluna=coluna;
  KB.estado[kbDragId].ordem=maxOrdem+1;
  kbDragId=null;
  kbRender();
  kbSalvar();
}

// ── Modal de OSs ──
function kbAbrirOS(id){
  KB.cardAtivo=id;
  const r=KB.patio.find(x=>String(x.ID)===id)||{};
  const placas=[r.Placa_Cavalo,r.Placa_Carreta].filter(Boolean).join(' + ')||r.Tipo_Veiculo||id;
  document.getElementById('kb-modal-titulo').textContent='OSs — '+placas;
  document.getElementById('kb-modal-sub').textContent=(r.Tipo_Veiculo||'')+(r.Cliente_Destino?' · '+r.Cliente_Destino:'');
  document.getElementById('kb-os-input').value='';
  kbRenderModal();
  document.getElementById('kb-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('kb-os-input').focus(),50);
}
function kbFecharOS(e){
  if(e && e.target && e.target.id!=='kb-overlay' && e.type==='click') return;
  document.getElementById('kb-overlay').classList.remove('open');
  KB.cardAtivo=null;
}
function kbRenderModal(){
  const id=KB.cardAtivo; const st=KB.estado[id]||{os:[]};
  const list=document.getElementById('kb-oslist');
  if(!st.os.length){
    list.innerHTML='<div class="kb-empty-os">Nenhuma OS atribuída ainda.</div>';
  } else {
    list.innerHTML=st.os.map(n=>{
      const info=KB.osMap[n];
      if(info){
        return `<div class="kb-osrow"><span class="n">OS ${n}</span><span class="c" title="${info.cliente}">${info.cliente||'—'} · ${info.fase||''}</span><span class="v">${kbBRL(info.valor)}</span><button class="del" onclick="kbRemoveOS('${n}')" title="Remover">✕</button></div>`;
      }
      return `<div class="kb-osrow miss"><span class="n">OS ${n}</span><span class="c">não encontrada no dados.json</span><span class="v">R$ 0,00</span><button class="del" onclick="kbRemoveOS('${n}')" title="Remover">✕</button></div>`;
    }).join('');
  }
  document.getElementById('kb-modal-total').textContent=kbBRL(kbTotalCard(id));
}
function kbAddOS(){
  const inp=document.getElementById('kb-os-input');
  const raw=(inp.value||'').trim();
  if(!raw) return;
  const id=KB.cardAtivo; if(!id||!KB.estado[id]) return;
  // aceita vários números separados por vírgula/espaço
  raw.split(/[,\s]+/).map(s=>s.trim()).filter(Boolean).forEach(n=>{
    if(!KB.estado[id].os.includes(n)) KB.estado[id].os.push(n);
  });
  inp.value='';
  kbRenderModal(); kbRender(); kbSalvar();
  inp.focus();
}
function kbRemoveOS(n){
  const id=KB.cardAtivo; if(!id||!KB.estado[id]) return;
  KB.estado[id].os=KB.estado[id].os.filter(x=>x!==String(n));
  kbRenderModal(); kbRender(); kbSalvar();
}

// ── Persistência ──
function kbLocalLoad(){ try{ return JSON.parse(localStorage.getItem(KB.LS_KEY)||'{}'); }catch(e){ return {}; } }
function kbLocalSave(){ try{ localStorage.setItem(KB.LS_KEY, JSON.stringify(KB.estado)); }catch(e){} }
function kbSalvar(){
  kbLocalSave();
  if(KB.demo) return;
  const cards=Object.keys(KB.estado).map(id=>({
    card_id:id,
    coluna:KB.estado[id].coluna,
    os_atribuidas:(KB.estado[id].os||[]).join(','),
    observacao:KB.estado[id].observacao||'',
    valor_peca:KB.estado[id].valorPeca||0,
    ordem:KB.estado[id].ordem||0
  }));
  fetch(KB.APPS_SCRIPT_URL,{method:'POST',mode:'cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'kanban_set',cards})})
    .then(r=>r.json())
    .then(res=>{ if(!res||!res.success) kbNotice('Falha ao salvar no servidor: '+((res&&res.error)||'desconhecido')+' (guardado localmente)','erro'); })
    .catch(e=>kbNotice('Sem conexão ao salvar (guardado localmente): '+e.message,'erro'));
}
