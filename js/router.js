/**
 * Roteador do portal: abre e fecha as telas e baixa cada módulo sob demanda.
 *
 * Na primeira vez em que um módulo abre, o router baixa em paralelo:
 *   - as bibliotecas externas que ele usa (Chart.js, xlsx, PapaParse);
 *   - modules/<pasta>/style.css (só módulos com CSS escopado em #screen-…);
 *   - modules/<pasta>/template.html, que substitui o <div id="screen-…"> vazio;
 * e depois roda modules/<pasta>/index.js. Nas próximas vezes a tela já está
 * no DOM e só a função de entrada do módulo roda, como antes da modularização.
 *
 * Módulo novo: criar a pasta em modules/, registrar em MODULOS e pôr o
 * <div id="screen-…"></div> vazio no index.html (ver docs/PADROES.md).
 */

// Troque a cada publicação que mexer em arquivos de modules/: o GitHub Pages
// deixa o navegador guardar cópia por 10 min, e sem isso alguém poderia pegar
// o template novo com o JavaScript antigo.
const VERSAO_PORTAL = '2026-09-23';

const LIBS = {
  chart: 'https://cdn.jsdelivr.net/npm/chart.js',
  xlsx:  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  papa:  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
};

// css:false = o CSS do módulo é global (sem escopo) e já vem no <head>, porque a
// ordem da cascata entre Dashboard e Precificação faz parte do visual atual.
const MODULOS = {
  dashboard:     { pasta:'dashboard',     libs:['chart','xlsx','papa'], css:false, entrada:'fetchData' },
  prec:          { pasta:'precificacao',  libs:[],                      css:false, entrada:null },
  abc:           { pasta:'abc',           libs:['chart'],               css:false, entrada:'loadABC' },
  kanban:        { pasta:'kanban',        libs:[],                      css:true,  entrada:'initKanban' },
  historico:     { pasta:'historico',     libs:[],                      css:true,  entrada:'initHistorico' },
  manual:        { pasta:'manual',        libs:[],                      css:true,  entrada:'initManual' },
  contaspagar:   { pasta:'contaspagar',   libs:['chart'],               css:true,  entrada:'initContasPagar' },
  contasreceber: { pasta:'contasreceber', libs:['chart','xlsx'],        css:true,  entrada:'initContasReceber' },
  resultado:     { pasta:'resultado',     libs:['chart','xlsx','papa'], css:true,  entrada:'initResultado', soAdmin:true },
};

const rtPromessas = {};   // módulo -> Promise do carregamento (clique duplo não baixa duas vezes)
const rtProntos   = {};   // módulo -> true quando template + JS já estão na página
const rtLibs      = {};   // biblioteca -> Promise
const rtCssPromessas = {}; // href -> Promise (nova tentativa não duplica o <link>)

function rtUrl(pasta, arquivo){ return 'modules/'+pasta+'/'+arquivo+'?v='+VERSAO_PORTAL; }

function rtScript(src){
  return new Promise((ok, falha)=>{
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = ()=>{ s.remove(); falha(new Error('Não consegui baixar '+src)); };
    document.body.appendChild(s);
  });
}

function rtCss(href){
  if(rtCssPromessas[href]) return rtCssPromessas[href];
  rtCssPromessas[href] = new Promise((ok, falha)=>{
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    l.onload = ok;
    l.onerror = ()=>{ l.remove(); delete rtCssPromessas[href]; falha(new Error('Não consegui baixar '+href)); };
    document.head.appendChild(l);
  });
  return rtCssPromessas[href];
}

function rtLib(nome){
  if(!rtLibs[nome]) rtLibs[nome] = rtScript(LIBS[nome]).catch(e=>{ delete rtLibs[nome]; throw e; });
  return rtLibs[nome];
}

async function rtBaixarTemplate(pasta){
  const r = await fetch(rtUrl(pasta, 'template.html'));
  if(!r.ok) throw new Error('HTTP '+r.status+' ao baixar a tela do módulo');
  return r.text();
}

// Baixa e monta o módulo sem mostrá-lo. Também serve para quem precisa de algo
// de outro módulo antes de ele ser aberto (ex.: troca de senha logo após o login).
function carregarModulo(m){
  if(rtPromessas[m]) return rtPromessas[m];
  const cfg = MODULOS[m];
  rtPromessas[m] = (async()=>{
    const [html] = await Promise.all([
      rtBaixarTemplate(cfg.pasta),
      ...cfg.libs.map(rtLib),
      cfg.css ? rtCss(rtUrl(cfg.pasta, 'style.css')) : null,
    ]);
    const vazio = document.getElementById('screen-'+m);
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const nos = [...tpl.content.childNodes];
    vazio.replaceWith(tpl.content);
    try{
      await rtScript(rtUrl(cfg.pasta, 'index.js'));
    }catch(e){
      // Desfaz a montagem para a próxima tentativa começar do zero (sem ids duplicados).
      const novoVazio = document.createElement('div');
      novoVazio.id = 'screen-'+m;
      nos[0].before(novoVazio);
      nos.forEach(n=>n.remove());
      throw e;
    }
    rtProntos[m] = true;
    // Telas recém-chegadas podem ter o selo de usuário/papel (ex.: Manual).
    rvAplicarPapel();
  })().catch(e=>{ delete rtPromessas[m]; throw e; });
  return rtPromessas[m];
}

async function openModule(m){
  const cfg = MODULOS[m];
  if(!cfg) return;
  if(cfg.soAdmin && !rvPodeEditar()){ alert('O Resultado Semanal é restrito a administradores.'); return; }
  if(!rtProntos[m]){
    showLoading('Abrindo módulo...');
    try{
      await carregarModulo(m);
    }catch(e){
      hideLoading();
      alert('Não foi possível abrir o módulo. Verifique a conexão e tente de novo.\n\n'+e.message);
      return;
    }
    hideLoading();
  }
  document.getElementById('screen-home').style.display='none';
  document.getElementById('screen-'+m).style.display='block';
  window.scrollTo(0,0);
  const entrada = cfg.entrada && window[cfg.entrada];
  if(typeof entrada === 'function') entrada();
}

function goHome(){
  Object.keys(MODULOS).forEach(m=>{ document.getElementById('screen-'+m).style.display='none'; });
  document.getElementById('screen-home').style.display='block';
  window.scrollTo(0,0);
  if(typeof rvSaudacao==='function') rvSaudacao();
}
