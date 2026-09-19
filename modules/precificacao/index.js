/**
 * Módulo: Precificação
 * Calculadora de preço de serviço + peças, regime tributário e estudos salvos.
 * Carregado sob demanda por js/router.js na primeira vez em que a tela abre.
 */


// ══════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════
const SHEET_ID = '1oppOgyOa6u4zVGd4lXABQQ-FEt5bzeU6Qqlo98aqqpc';
const CFG_KEY  = 'rv_prec_cfg_v1';
const STD_CFG = {
  regime:'simples', simples:12,
  pis:.65, cofins:3, csll:2.88, irpj:4.8, iss:5, icms:18,
  salOfic:7000, salMeio:3500, diasMes:22, km:4,
  adm:5, fin:0, comissao:0,
  rentServDef:15, rentPecDef:40
};
let cfg = {...STD_CFG};
let regime = 'simples';
let pecaId = 0;

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
function precPrepararTela(){
  loadCfg();
  addPeca();
  calcAll();
  const mCfg = document.getElementById('modal-cfg');
  if(mCfg) mCfg.addEventListener('click', e => { if(e.target===e.currentTarget) closeCfg(); });
  const mSav = document.getElementById('modal-saved');
  if(mSav) mSav.addEventListener('click', e => { if(e.target===e.currentTarget) mSav.classList.remove('open'); });
}

// ══════════════════════════════════════════
// CONFIG MODAL
// ══════════════════════════════════════════
function openCfg(){
  populateCfgModal();
  document.getElementById('modal-cfg').classList.add('open');
}
function closeCfg(){ document.getElementById('modal-cfg').classList.remove('open'); }

function populateCfgModal(){
  setRegime(cfg.regime, false);
  sv('c-simples', cfg.simples); sv('c-pis', cfg.pis); sv('c-cofins', cfg.cofins);
  sv('c-csll', cfg.csll); sv('c-irpj', cfg.irpj); sv('c-iss', cfg.iss); sv('c-icms', cfg.icms);
  sv('c-sal-ofic', cfg.salOfic); sv('c-sal-meio', cfg.salMeio);
  sv('c-dias-mes', cfg.diasMes); sv('c-km', cfg.km);
  sv('c-adm', cfg.adm); sv('c-fin', cfg.fin); sv('c-comissao', cfg.comissao||0);
  sv('c-rent-serv', cfg.rentServDef); sv('c-rent-pec', cfg.rentPecDef);
}

function setRegime(r, doCalc=true){
  regime = r;
  cfg.regime = r;
  const rs=document.getElementById('reg-s');
  const rp=document.getElementById('reg-p');
  const bs=document.getElementById('bloco-simples');
  const bp=document.getElementById('bloco-presumido');
  const ir=document.getElementById('icms-row');
  const pill=document.getElementById('regime-pill');
  if(rs) rs.className='reg-btn'+(r==='simples'?' active-s':'');
  if(rp) rp.className='reg-btn'+(r==='presumido'?' active-p':'');
  if(bs) bs.style.display=r==='simples'?'block':'none';
  if(bp) bp.style.display=r==='presumido'?'block':'none';
  if(ir) ir.style.display=r==='presumido'?'flex':'none';
  if(pill){
    if(r==='simples'){pill.className='regime-badge simples';pill.textContent='Simples '+cfg.simples+'%';}
    else{pill.className='regime-badge presumido';pill.textContent='Lucro Presumido';}
  }
  if(doCalc) calcAll();
}

function saveCfg(){
  cfg.regime   = regime;
  cfg.simples  = gn('c-simples'); cfg.pis   = gn('c-pis');   cfg.cofins = gn('c-cofins');
  cfg.csll     = gn('c-csll');    cfg.irpj  = gn('c-irpj');  cfg.iss    = gn('c-iss');
  cfg.icms     = gn('c-icms');
  cfg.salOfic  = gn('c-sal-ofic');cfg.salMeio= gn('c-sal-meio');
  cfg.diasMes  = gn('c-dias-mes');cfg.km     = gn('c-km');
  cfg.adm      = gn('c-adm');     cfg.fin    = gn('c-fin');     cfg.comissao = gn('c-comissao');
  cfg.rentServDef = gn('c-rent-serv'); cfg.rentPecDef = gn('c-rent-pec');
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  closeCfg();
  // Update regime pill
  setRegime(regime, false);
  const rp=document.getElementById('regime-pill');
  if(rp) rp.textContent = regime==='simples'?'Simples '+cfg.simples+'%':'Lucro Presumido';
  calcAll();
  toast('Configurações salvas!');
}

function loadCfg(){
  const s = localStorage.getItem(CFG_KEY);
  if(s) cfg = {...STD_CFG, ...JSON.parse(s)};
  regime = cfg.regime||'simples';
  setRegime(regime, false);
  sv('rent-serv', cfg.rentServDef);
  sv('rent-pecas', cfg.rentPecDef);
}

function resetCfg(){
  if(!confirm('Restaurar configurações padrão?')) return;
  cfg = {...STD_CFG};
  populateCfgModal();
}

// ══════════════════════════════════════════
// PEÇAS TABLE
// ══════════════════════════════════════════
function addPeca(d={}){
  const id = ++pecaId;
  const tr = document.createElement('tr');
  tr.id = 'p-' + id;
  tr.innerHTML = `
    <td><input type="text" value="${d.desc||''}" placeholder="Descrição" oninput="calcAll()" /></td>
    <td><input type="number" value="${d.qtd||1}" min="0" step="1" style="width:52px;" oninput="calcAll()" class="pc-q" /></td>
    <td><input type="number" value="${d.val||''}" min="0" step="0.01" placeholder="0,00" oninput="calcAll()" class="pc-v" /></td>
    <td style="text-align:right;font-weight:800;color:var(--primary);font-size:.78rem;white-space:nowrap;" id="pt-${id}">R$ 0,00</td>
    <td><button class="del-btn" onclick="document.getElementById('p-${id}').remove();calcAll()"><i class="fa-solid fa-trash"></i></button></td>
  `;
  document.getElementById('pecas-body').appendChild(tr);
}

// ══════════════════════════════════════════
// CALC
// ══════════════════════════════════════════

function readCfgFromModal(){
  const g = id => { const e=document.getElementById(id); return e?parseFloat(e.value)||0:0; };
  cfg.simples  = g('c-simples'); cfg.pis=g('c-pis'); cfg.cofins=g('c-cofins');
  cfg.csll     = g('c-csll');    cfg.irpj=g('c-irpj'); cfg.iss=g('c-iss'); cfg.icms=g('c-icms');
  cfg.salOfic  = g('c-sal-ofic'); cfg.salMeio=g('c-sal-meio');
  cfg.diasMes  = g('c-dias-mes'); cfg.km=g('c-km');
  cfg.adm      = g('c-adm'); cfg.fin=g('c-fin'); cfg.comissao=g('c-comissao');
  cfg.rentServDef=g('c-rent-serv'); cfg.rentPecDef=g('c-rent-pec');
  calcAll();
}

function calcAll(){
  // ── CUSTOS MO ──
  const diasMes   = cfg.diasMes || 22;
  const dailyOfic = cfg.salOfic * (1 + 0.5044) / diasMes;
  const dailyMeio = cfg.salMeio * (1 + 0.5044) / diasMes;
  const el_ofic = document.getElementById('info-ofic');
  const el_meio = document.getElementById('info-meio');
  if(el_ofic) el_ofic.textContent = fmt(dailyOfic);
  if(el_meio) el_meio.textContent = fmt(dailyMeio);

  // ── SERVIÇOS ──
  const dias  = gn('s-dias');
  const ofic  = gn('s-ofic');
  const meio  = gn('s-meio');
  const km    = gn('s-km');
  const rentS = gn('rent-serv');
  const custoMO = dias * (ofic * dailyOfic + meio * dailyMeio);
  const custoKm = km * (cfg.km||4);
  const custoS  = custoMO + custoKm;

  // Impostos serviços
  let impSPct = 0;
  if(regime === 'simples'){
    impSPct = cfg.simples;
  } else {
    impSPct = (cfg.pis||0) + (cfg.cofins||0) + (cfg.csll||0) + (cfg.irpj||0) + (cfg.iss||0);
  }
  const admPct  = cfg.adm || 0;
  const comPct  = cfg.comissao || 0;
  const finPct  = cfg.fin || 0;
  const markupS = impSPct + admPct + comPct + finPct + rentS;
  const divisorS = 1 - markupS/100;
  const precoS   = divisorS > 0.01 ? custoS / divisorS : 0;

  // Valores absolutos serviço
  const impSVal  = precoS * impSPct / 100;
  const admSVal  = precoS * admPct  / 100;
  const comSVal  = precoS * comPct  / 100;
  const finSVal  = precoS * finPct  / 100;
  const rentSVal = precoS * rentS   / 100;

  const sv_id = id => document.getElementById(id);
  const setEl = (id, txt) => { const e=sv_id(id); if(e) e.textContent=txt; };
  const fmtPct = (val, pct) => fmt(val)+' ('+pct.toFixed(1)+'%)';

  setEl('r-custo-mo',   fmt(custoMO));
  setEl('r-custo-km',   fmt(custoKm));
  setEl('r-custo-serv', fmt(custoS));
  setEl('r-imp-serv-val',  fmtPct(impSVal, impSPct));
  setEl('r-adm-serv-val',  fmtPct(admSVal, admPct));
  setEl('r-com-serv-val',  fmtPct(comSVal, comPct));
  setEl('r-fin-serv-val',  fmtPct(finSVal, finPct));
  setEl('r-rent-serv-val', fmtPct(rentSVal, rentS));
  setEl('r-preco-serv', fmt(precoS));
  setEl('ft-serv', fmt(precoS));
  // Hide zero rows
  const rowComS = sv_id('r-row-com-serv');
  const rowFinS = sv_id('r-row-fin-serv');
  if(rowComS) rowComS.style.display = comPct>0?'flex':'none';
  if(rowFinS) rowFinS.style.display = finPct>0?'flex':'none';

  // ── PEÇAS ──
  let totalCompra = 0;
  document.querySelectorAll('#pecas-body tr').forEach(tr => {
    const q = parseFloat(tr.querySelector('.pc-q')?.value)||0;
    const v = parseFloat(tr.querySelector('.pc-v')?.value)||0;
    const sub = q * v;
    totalCompra += sub;
    const id = tr.id.replace('p-','');
    const el = document.getElementById('pt-'+id);
    if(el) el.textContent = fmt(sub);
  });

  const rentP  = gn('rent-pecas');
  let impPPct  = 0;
  if(regime === 'simples'){
    impPPct = cfg.simples;
  } else {
    impPPct = (cfg.pis||0) + (cfg.cofins||0) + (cfg.csll||0) + (cfg.irpj||0) + (cfg.icms||0);
  }
  const markupP  = impPPct + admPct + comPct + finPct + rentP;
  const divisorP = 1 - markupP/100;
  const precoP   = divisorP > 0.01 ? totalCompra / divisorP : 0;

  // Valores absolutos peças
  const impPVal  = precoP * impPPct / 100;
  const admPVal  = precoP * admPct  / 100;
  const comPVal  = precoP * comPct  / 100;
  const finPVal  = precoP * finPct  / 100;
  const rentPVal = precoP * rentP   / 100;

  setEl('r-compra',       fmt(totalCompra));
  setEl('r-imp-pec-val',  fmtPct(impPVal, impPPct));
  setEl('r-adm-pec-val',  fmtPct(admPVal, admPct));
  setEl('r-com-pec-val',  fmtPct(comPVal, comPct));
  setEl('r-fin-pec-val',  fmtPct(finPVal, finPct));
  setEl('r-rent-pec-val', fmtPct(rentPVal, rentP));
  setEl('r-preco-pecas',  fmt(precoP));
  setEl('ft-pecas',       fmt(precoP));

  // ICMS label update
  const icmsRow   = sv_id('icms-row');
  const icmsLabel = sv_id('r-icms-label');
  if(icmsRow)   icmsRow.style.display   = 'flex';
  if(icmsLabel) icmsLabel.textContent   = regime==='presumido' ? ' (c/ ICMS 18%)' : '';

  const rowComP = sv_id('r-row-com-pec');
  const rowFinP = sv_id('r-row-fin-pec');
  if(rowComP) rowComP.style.display = comPct>0?'flex':'none';
  if(rowFinP) rowFinP.style.display = finPct>0?'flex':'none';

  // ── TOTAL ──
  const total = precoS + precoP;
  setEl('ft-total', fmt(total));

  // ── VIABILIDADE ──
  const custoTotal = custoS + totalCompra;
  const lucroReal  = (precoS * rentS/100) + (precoP * rentP/100);
  const margemReal = total > 0 ? lucroReal/total*100 : 0;
  const pill = sv_id('viab-pill');
  if(pill && (custoTotal > 0 || totalCompra > 0)){
    if(margemReal >= 8){
      pill.className='viab-pill ok';
      pill.innerHTML='<i class="fa-solid fa-circle-check"></i> Viável';
    } else if(margemReal >= 3){
      pill.className='viab-pill warn';
      pill.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> Margem baixa';
    } else {
      pill.className='viab-pill bad';
      pill.innerHTML='<i class="fa-solid fa-circle-xmark"></i> Inviável';
    }
  } else if(pill) { pill.className='viab-pill'; }
}

// ══════════════════════════════════════════
// SAVE / LOAD STUDIES
// ══════════════════════════════════════════
function getFormState(){
  const pecas = [];
  document.querySelectorAll('#pecas-body tr').forEach(tr => {
    const id = tr.id.replace('p-','');
    const desc = tr.querySelector('input[type=text]')?.value||'';
    const q    = tr.querySelector('.pc-q')?.value||1;
    const v    = tr.querySelector('.pc-v')?.value||0;
    pecas.push({desc,q,v});
  });
  return {
    os: gv('f-os'), placa: gv('f-placa'), equip: gv('f-equip'), cliente: gv('f-cliente-prec'),
    descServ: gv('desc-serv'),
    dias: gv('s-dias'), ofic: gv('s-ofic'), meio: gv('s-meio'), km: gv('s-km'),
    rentS: gv('rent-serv'), rentP: gv('rent-pecas'),
    pecas, regime: cfg.regime,
    precoServ: document.getElementById('r-preco-serv').textContent,
    precoPecas: document.getElementById('r-preco-pecas').textContent,
    total: document.getElementById('ft-total').textContent,
    savedAt: new Date().toISOString(),
  };
}

function saveStudy(){
  const os = gv('f-os').trim();
  const cli = gv('f-cliente-prec').trim();
  if(!os && !cli){ alert('Preencha ao menos o Nº da OS ou o Cliente antes de salvar.'); return; }

  // Estudos ficam só neste navegador (localStorage); não há envio para planilha.
  const state = getFormState();
  const key = 'rv_estudo_' + Date.now();
  localStorage.setItem(key, JSON.stringify(state));

  toast('Estudo salvo!');
}

function openSaved(){
  const keys = Object.keys(localStorage).filter(k=>k.startsWith('rv_estudo_')).sort().reverse();
  const list = document.getElementById('saved-list');
  if(!keys.length){
    list.innerHTML='<p style="color:var(--muted);font-size:.82rem;">Nenhum estudo salvo.</p>';
  } else {
    list.innerHTML = keys.map(k => {
      const s = JSON.parse(localStorage.getItem(k)||'{}');
      return `<div style="padding:.65rem .8rem;border-radius:8px;border:1px solid var(--border);margin-bottom:.4rem;cursor:pointer;transition:all .2s;" 
        onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'"
        onclick="loadStudy('${k}')">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:800;font-size:.84rem;">${s.os?'OS '+s.os+' · ':''} ${s.cliente||'Sem cliente'}</div>
            <div style="font-size:.7rem;color:var(--muted);margin-top:2px;">
              ${s.total||''} · ${s.savedAt?new Date(s.savedAt).toLocaleDateString('pt-BR'):''}
            </div>
          </div>
          <button onclick="event.stopPropagation();if(confirm('Excluir?')){localStorage.removeItem('${k}');openSaved();}" 
            style="background:#fee2e2;color:#ef4444;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:.72rem;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>`;
    }).join('');
  }
  document.getElementById('modal-saved').classList.add('open');
}

function loadStudy(k){
  document.getElementById('modal-saved').classList.remove('open');
  const s = JSON.parse(localStorage.getItem(k)||'{}');
  sv('f-os',s.os||s['h-os']||''); sv('f-placa',s.placa||''); sv('f-equip',s.equip||''); sv('f-cliente-prec',s.cliente||'');
  sv('desc-serv', s.descServ);
  sv('s-dias', s.dias); sv('s-ofic', s.ofic); sv('s-meio', s.meio); sv('s-km', s.km);
  sv('rent-serv', s.rentS); sv('rent-pecas', s.rentP);
  document.getElementById('pecas-body').innerHTML = '';
  pecaId = 0;
  (s.pecas||[]).forEach(p => addPeca(p));
  if(s.regime) setRegime(s.regime, false);
  calcAll();
}

function newForm(){
  if(!confirm('Limpar e iniciar novo orçamento?')) return;
  sv('f-os',''); sv('f-placa',''); sv('f-equip',''); sv('f-cliente-prec',''); sv('desc-serv','');
  sv('s-dias',1); sv('s-ofic',1); sv('s-meio',0); sv('s-km',0);
  sv('rent-serv', cfg.rentServDef); sv('rent-pecas', cfg.rentPecDef);
  document.getElementById('pecas-body').innerHTML='';
  pecaId=0; addPeca(); calcAll();
}

function syncPrint(){}

// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════
const fmt = v => (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const gn  = id => parseFloat(document.getElementById(id)?.value?.replace(',','.'))||0;
const gv  = id => document.getElementById(id)?.value||'';
const sv  = (id,v) => { if(document.getElementById(id)) document.getElementById(id).value=v; };

function toast(msg){
  const t=document.createElement('div');
  t.className='toast';
  t.innerHTML='<i class="fa-solid fa-circle-check" style="color:#22c55e;"></i>'+msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}



// Fica no fim do arquivo: precPrepararTela usa gv/sv, declarados acima como const.
precPrepararTela();
