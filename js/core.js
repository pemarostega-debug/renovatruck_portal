/**
 * Núcleo do portal: configuração e helpers usados por mais de um módulo.
 * Carregado sempre, antes de auth.js e router.js.
 */

// ── CONFIG ──
const CONFIG = {
  PASSWORD: 'renova2026',
  SHEET_ID: '1oppOgyOa6u4zVGd4lXABQQ-FEt5bzeU6Qqlo98aqqpc',
  SHEET_RENOVA: 'RENOVA',
  SHEET_VALE:   'VALE',
  // Planilha de OSs Finalizadas (fonte das datas de finalização)
  SHEET_FINALIZADAS_ID: '13yPY1Jxz7ocnD9RA3siVyAfj6k64WzzKDZjFbdABzeA',
  SHEET_FINALIZADAS_ABA: 'Serviços Finalizados',
  // /exec do apps-script/resultado-semanal.gs — é por aqui que chegam as linhas
  // da vw_os_produto_serviço (peças e serviços de cada OS). Guia de publicação
  // em integracao/LEIA-ME-resultado-semanal.md.
  RESULTADO_SEMANAL_API: 'https://script.google.com/macros/s/AKfycbzOshhgNVKEh_8dDrx0bfA-kcrkpvV3LpCPmWCwm11-v9IAQzeLkyy5-GdyRy3FfpPo_w/exec',
};
const csvURL = s => `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(s)}`;
const csvURLExt = (id, s) => `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(s)}`;


// ── HELPERS ──
const norm    = s => s ? s.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"") : "";
const clean   = s => s ? s.toString().trim().toUpperCase() : "";
const fmtDate = d => d instanceof Date && !isNaN(d) ? d.toLocaleDateString("pt-BR") : "–";
const fmtMoney= v => (v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

// Escapa texto para montar HTML. Nasceu no Kanban (kbEsc); Histórico e Manual também usam.
function kbEsc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── FETCH ──

/**
 * Chamadas ao Apps Script com nova tentativa automática.
 *
 * O /exec responde 302 para o googleusercontent, e em partida a frio, pico de
 * uso ou página de erro do Google o corpo volta em HTML — o r.json() estoura e
 * a tela acusava "sem conexão" com a rede perfeita. Tentar de novo resolve na
 * maioria das vezes: é exatamente o que a equipe vinha fazendo na mão,
 * clicando três, quatro, cinco vezes. O relógio existe porque requisição
 * pendurada não volta sozinha, e esperar para sempre é pior do que tentar de
 * novo.
 *
 * Só para LEITURA e para o login. Repetir uma gravação é perigoso: a primeira
 * tentativa pode ter gravado e só a resposta ter se perdido, e aí a segunda
 * duplica o lançamento — em borderô isso é vender o mesmo recebível duas vezes.
 */
async function rvTentar(url, opcoes, tentativas){
  const vezes = tentativas || 3;
  let ultimo;
  for(let i = 0; i < vezes; i++){
    if(i) await new Promise(r => setTimeout(r, 400 * Math.pow(3, i - 1)));
    const cancelar = new AbortController();
    const relogio = setTimeout(() => cancelar.abort(), 20000);
    try{
      const r = await fetch(url, Object.assign({}, opcoes, { signal: cancelar.signal }));
      return await r.json();
    }catch(e){
      ultimo = e;
    }finally{
      clearTimeout(relogio);
    }
  }
  throw ultimo;
}

const rvBuscar = (url, tentativas) => rvTentar(url, {}, tentativas);

const rvPostar = (url, corpo, tentativas) => rvTentar(url, {
  method:'POST', mode:'cors',
  headers:{'Content-Type':'text/plain;charset=utf-8'},
  body: JSON.stringify(corpo)
}, tentativas);

// Busca o JSON gerado pela exportação periódica (exportar-dados.js).
// O parâmetro t evita cache do CDN/navegador.
async function fetchDados(){
  const res = await fetch('https://raw.githubusercontent.com/pemarostega-debug/renovatruck_portal/main/dados.json?t='+Date.now());
  if(!res.ok) throw new Error("HTTP "+res.status);
  return res.json();
}

// ── PARSE DATE (robusto) ──
function parseDate(raw){
  if(!raw || raw==="") return null;
  const s = raw.toString().trim();
  // ISO: 2026-05-14 ou 2026-05-14T10:00
  if(/^\d{4}-\d{2}-\d{2}/.test(s)){
    const d = new Date(s); if(!isNaN(d)) return d;
  }
  // BR: 14/05/2026 ou 14/05/2026 10:00:00
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m){ const d=new Date(+m[3],+m[2]-1,+m[1]); if(!isNaN(d)) return d; }
  // Excel serial
  const n = parseFloat(s);
  if(!isNaN(n) && n > 40000){
    const d = new Date(Math.round((n-25569)*86400*1000)); if(!isNaN(d)) return d;
  }
  return null;
}

// ── LOADING (tela de espera do portal) ──
function showLoading(msg){ document.getElementById("loading-msg").textContent=msg||"Carregando..."; document.getElementById("loading-screen").style.display="flex"; }
function hideLoading(){ document.getElementById("loading-screen").style.display="none"; }
