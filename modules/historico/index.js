/**
 * Módulo: Histórico de Entrada/Saída
 * Consulta de movimentação da portaria por período e placa.
 * Carregado sob demanda por js/router.js na primeira vez em que a tela abre.
 */

const HIST = {
  APPS_SCRIPT_URL: (typeof KB!=='undefined' && KB.APPS_SCRIPT_URL) || 'https://script.google.com/macros/s/AKfycby4MrxryOIBsbJAZbb_WG4GsiK_YsRgqhWYII1XFvguoEZ1x23JOh7TMVWKgiaAKOwu/exec',
  iniciado: false
};

function hiFormatarPlaca(input){
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
}

function hiNotice(msg,tipo){
  const el = document.getElementById('hi-notice');
  if(!msg){ el.className='hi-notice'; el.textContent=''; return; }
  el.className = 'hi-notice '+(tipo||'info');
  el.innerHTML = msg;
}

function hiFmtData(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  if(isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

function hiStatusBadges(r){
  const partes = [];
  if(r.Status_Cavalo && r.Status_Cavalo!=='N/A'){
    const cls = r.Status_Cavalo==='No Pátio' ? 'hi-status-patio' : 'hi-status-saiu';
    partes.push('<span class="hi-status '+cls+'">Cavalo: '+kbEsc(r.Status_Cavalo)+'</span>');
  }
  if(r.Status_Carreta && r.Status_Carreta!=='N/A'){
    const cls = r.Status_Carreta==='No Pátio' ? 'hi-status-patio' : 'hi-status-saiu';
    partes.push('<span class="hi-status '+cls+'">Carreta: '+kbEsc(r.Status_Carreta)+'</span>');
  }
  return partes.length ? partes.join(' ') : '<span class="hi-status hi-status-na">—</span>';
}

// ── Ponto de entrada (chamado por openModule) ──
function initHistorico(){
  if(!HIST.iniciado){
    HIST.iniciado = true;
    const hoje = new Date();
    const seteDias = new Date(hoje.getTime() - 6*24*60*60*1000);
    document.getElementById('hi-data-inicio').value = seteDias.toISOString().slice(0,10);
    document.getElementById('hi-data-fim').value = hoje.toISOString().slice(0,10);
  }
  hiBuscar();
}

function hiLimpar(){
  document.getElementById('hi-placa').value = '';
  const hoje = new Date();
  const seteDias = new Date(hoje.getTime() - 6*24*60*60*1000);
  document.getElementById('hi-data-inicio').value = seteDias.toISOString().slice(0,10);
  document.getElementById('hi-data-fim').value = hoje.toISOString().slice(0,10);
  hiBuscar();
}

async function hiBuscar(){
  const dataInicio = document.getElementById('hi-data-inicio').value;
  const dataFim    = document.getElementById('hi-data-fim').value;
  const placa      = document.getElementById('hi-placa').value.trim();
  const tbody = document.getElementById('hi-tbody');
  const isDemo = HIST.APPS_SCRIPT_URL.includes('SEU_ID_AQUI');

  tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Buscando...</td></tr>';
  document.getElementById('hi-count').textContent = '';
  hiNotice('');

  if(isDemo){
    hiNotice('<b>Apps Script não conectado.</b> Configure a URL em <code>HIST.APPS_SCRIPT_URL</code> para consultar o histórico real.','erro');
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Sem conexão com a planilha.</td></tr>';
    return;
  }

  try{
    const params = new URLSearchParams({ action:'historico_range' });
    if(dataInicio) params.set('dataInicio', dataInicio);
    if(dataFim)    params.set('dataFim', dataFim);
    if(placa)      params.set('placa', placa);

    const res = await fetch(HIST.APPS_SCRIPT_URL+'?'+params.toString());
    const dados = await res.json();

    if(!dados.success){
      if(String(dados.error||'').includes('Ação desconhecida')){
        hiNotice('<b>Backend desatualizado.</b> Cole o <code>Codigo.gs</code> mais recente no Apps Script da planilha e crie uma <b>Nova versão</b> do deployment para habilitar a busca por período/placa.','erro');
      } else {
        hiNotice('Erro ao buscar histórico: '+kbEsc(dados.error||''),'erro');
      }
      tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Não foi possível carregar os registros.</td></tr>';
      return;
    }

    hiRenderizar(dados.data || []);
  }catch(e){
    console.warn('Histórico: falha ao buscar', e);
    hiNotice('Falha de conexão ao buscar o histórico.','erro');
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Falha de conexão.</td></tr>';
  }
}

function hiRenderizar(registros){
  const tbody = document.getElementById('hi-tbody');
  document.getElementById('hi-count').textContent = registros.length + (registros.length===1 ? ' registro encontrado' : ' registros encontrados');

  if(!registros.length){
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Nenhum registro encontrado para o filtro informado.</td></tr>';
    return;
  }

  tbody.innerHTML = registros.map(r => (
    '<tr>'+
      '<td>'+kbEsc(r.ID)+'</td>'+
      '<td>'+kbEsc(r.Tipo_Veiculo)+'</td>'+
      '<td class="hi-placa-cel">'+kbEsc(r.Placa_Cavalo||'—')+'</td>'+
      '<td class="hi-placa-cel">'+kbEsc(r.Placa_Carreta||'—')+'</td>'+
      '<td>'+kbEsc(r.Motorista||'—')+'</td>'+
      '<td>'+kbEsc(r.Cliente_Destino||'—')+'</td>'+
      '<td>'+hiFmtData(r.Data_Entrada)+'</td>'+
      '<td>'+hiFmtData(r.Data_Saida_Cavalo)+'</td>'+
      '<td>'+hiFmtData(r.Data_Saida_Carreta)+'</td>'+
      '<td>'+hiStatusBadges(r)+'</td>'+
    '</tr>'
  )).join('');
}

// ══════════════════════════════════════════════════════════════
