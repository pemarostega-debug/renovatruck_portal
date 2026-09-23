/**
 * Módulo: Curva ABC
 * Clientes por faturamento (classes A/B/C) a partir do dados.json.
 * Carregado sob demanda por js/router.js na primeira vez em que a tela abre.
 */

function loadABC(){
  document.getElementById('abc-loading').style.display='flex';
  document.getElementById('abc-content').style.display='none';
  fetchDados().then(payload=>{
    const rows=payload.ordens||[];
    const BILL=['faturado','pago'];
    const all=[];
    rows.forEach(r=>{
      const fase=(r.descricao_fase||'').toLowerCase();
      if((r.cancelada||'').toLowerCase()==='sim') return;
      if(!BILL.some(k=>fase.includes(k))) return;
      const d=parseDate(r.data_encerramento||r.data||'');
      if(!d||d.getFullYear()!==new Date().getFullYear()) return;
      const val=parseFloat(r.valor_total)||0;
      if(val<=0) return;
      all.push({cli:(r.razao_cliente||'CONSUMIDOR').trim().toUpperCase(),val});
    });
    const totMap={};
    all.forEach(b=>{totMap[b.cli]=(totMap[b.cli]||0)+b.val;});
    const ranked=Object.entries(totMap).sort((a,b)=>b[1]-a[1]);
    const total=ranked.reduce((s,[,v])=>s+v,0);
    let acc=0;
    const abc=ranked.map(([cli,val])=>{acc+=val;const p=val/total*100,ap=acc/total*100;return{cli,val,pct:p,acc:ap,cls:ap<=80?'A':ap<=95?'B':'C'};});
    window._abcData={abc,total,osCount:all.length};
    renderABC(abc,total,all.length);
  }).catch(e=>{
    document.getElementById('abc-loading').innerHTML='<p style="color:var(--danger);font-weight:700;padding:2rem;">Erro ao carregar. Tente novamente.</p>';
    console.error(e);
  });
}

function renderABC(abc,total,osCount){
  const fmtM=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const aL=abc.filter(x=>x.cls==='A'),bL=abc.filter(x=>x.cls==='B'),cL=abc.filter(x=>x.cls==='C');
  document.getElementById('abc-total').textContent=fmtM(total);
  document.getElementById('abc-os').textContent=osCount;
  document.getElementById('abc-cli').textContent=abc.length;
  document.getElementById('abc-ticket').textContent=fmtM(total/osCount);
  document.getElementById('abc-a-cli').textContent=aL.length+' cliente'+(aL.length>1?'s':'');
  document.getElementById('abc-a-val').textContent=fmtM(aL.reduce((s,x)=>s+x.val,0))+' \u00B7 '+aL.reduce((s,x)=>s+x.pct,0).toFixed(1)+'%';
  document.getElementById('abc-b-cli').textContent=bL.length+' clientes';
  document.getElementById('abc-b-val').textContent=fmtM(bL.reduce((s,x)=>s+x.val,0))+' \u00B7 '+bL.reduce((s,x)=>s+x.pct,0).toFixed(1)+'%';
  document.getElementById('abc-c-cli').textContent=cL.length+' clientes';
  document.getElementById('abc-c-val').textContent=fmtM(cL.reduce((s,x)=>s+x.val,0))+' \u00B7 '+(100-aL.reduce((s,x)=>s+x.pct,0)-bL.reduce((s,x)=>s+x.pct,0)).toFixed(1)+'%';
  const top=abc.slice(0,20);
  const cc={A:'#0f172a',B:'#1d4ed8',C:'#94a3b8'};
  const wrap=document.getElementById('abc-bar-wrap');
  wrap.style.height=(top.length*38+60)+'px';
  if(window._abcChart) window._abcChart.destroy();
  window._abcChart=new Chart(document.getElementById('abc-bar-chart'),{
    type:'bar',
    data:{labels:top.map(x=>x.cli.length>32?x.cli.slice(0,30)+'\u2026':x.cli),datasets:[{data:top.map(x=>x.val),backgroundColor:top.map(x=>cc[x.cls]),borderRadius:4}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmtM(c.raw)+' ('+top[c.dataIndex].pct.toFixed(1)+'%)'}}},scales:{x:{display:false,grid:{display:false}},y:{ticks:{font:{size:10,weight:'600'},color:'#475569'},grid:{display:false}}}}
  });
  const tbody=document.getElementById('abc-table-body');
  const abcM=abc.filter(x=>x.val>=1000);
  const abcO=abc.filter(x=>x.val<1000);
  const oV=abcO.reduce((s,x)=>s+x.val,0);
  const rows=oV>0?[...abcM,{cli:'Outros \u2014 '+abcO.length+' clientes abaixo de R$ 1.000',val:oV,pct:oV/total*100,acc:100,cls:'C',emp:'\u2013',isOthers:true}]:abcM;
  tbody.innerHTML=rows.map((x,i)=>{
    const badge=x.cls==='A'?'background:#0f172a;color:#fff;':x.cls==='B'?'background:#1d4ed8;color:#fff;':'background:#f1f5f9;color:#475569;';
    const bw=Math.min(x.pct*1.2,80),bc=x.cls==='A'?'#0f172a':x.cls==='B'?'#3b82f6':'#94a3b8';
    return '<tr data-cli="'+x.cli.toLowerCase()+'"><td style="color:var(--muted);text-align:center;font-size:.78rem;">'+(x.isOthers?'&mdash;':i+1)+'</td><td style="font-weight:'+(x.isOthers?700:600)+';font-size:.78rem;color:'+(x.isOthers?'var(--muted)':'var(--text)')+';">'+x.cli+'</td><td style="text-align:right;font-weight:800;color:var(--primary);font-size:.78rem;">'+fmtM(x.val)+'</td><td><div style="display:flex;align-items:center;gap:5px;"><div style="width:'+bw+'px;height:5px;background:'+bc+';border-radius:3px;min-width:2px;"></div><span style="font-size:.68rem;font-weight:700;color:var(--muted);">'+x.pct.toFixed(1)+'%</span></div></td><td style="text-align:right;font-size:.74rem;color:var(--muted);">'+x.acc.toFixed(1)+'%</td><td style="text-align:center;"><span style="display:inline-block;'+badge+'padding:2px 9px;border-radius:20px;font-size:.68rem;font-weight:800;">'+x.cls+'</span></td></tr>';
  }).join('');
  document.getElementById('abc-loading').style.display='none';
  document.getElementById('abc-content').style.display='block';
  const btn=document.getElementById('btn-export-abc');
  if(btn){btn.disabled=false;btn.style.background='rgba(22,163,74,.4)';}
}

function filterABCTable(v){
  document.querySelectorAll('#abc-table-body tr').forEach(r=>{r.style.display=r.dataset.cli.includes(v.toLowerCase())?'':'none';});
}

function exportABCPDF(){
  const d=window._abcData;if(!d)return;
  const {abc,total,osCount}=d;
  const now=new Date();
  const hoje=now.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
  const fmtM=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const logoEl=document.querySelector('#screen-home .home-header img');
  const logoSrc=logoEl?logoEl.src:'';
  const aL=abc.filter(x=>x.cls==='A'),bL=abc.filter(x=>x.cls==='B'),cL=abc.filter(x=>x.cls==='C');
  const aP=aL.reduce((s,x)=>s+x.pct,0),bP=bL.reduce((s,x)=>s+x.pct,0);
  const abcM=abc.filter(x=>x.val>=1000),abcO=abc.filter(x=>x.val<1000);
  const oV=abcO.reduce((s,x)=>s+x.val,0);
  const rows=[...abcM,oV>0?{cli:'Outros \u2014 '+abcO.length+' clientes abaixo de R$ 1.000',val:oV,pct:oV/total*100,acc:100,cls:'C',isOthers:true}:null].filter(Boolean);
  const clsB=c=>c==='A'?'background:#1e3a5f;color:#fff;':c==='B'?'background:#1d4ed8;color:#fff;':'background:#e2e8f0;color:#475569;';
  const tableRows=rows.map((x,i)=>{
    const bw=Math.min(x.pct*0.7,56),bc=x.cls==='A'?'#1e3a5f':x.cls==='B'?'#3b82f6':'#94a3b8';
    return '<tr style="background:'+(i%2===0?'#fff':'#f8fafc')+'">'
      +'<td style="padding:5px 7px;font-size:.7rem;color:#94a3b8;text-align:center;">'+(x.isOthers?'&mdash;':i+1)+'</td>'
      +'<td style="padding:5px 8px;font-size:.72rem;font-weight:'+(x.isOthers?700:600)+';color:'+(x.isOthers?'#64748b':'#1e293b')+';">'+x.cli+'</td>'
      +'<td style="padding:5px 11px;font-size:.72rem;font-weight:800;text-align:right;color:#1e3a5f;">'+fmtM(x.val)+'</td>'
      +'<td style="padding:5px 8px;"><div style="display:flex;align-items:center;gap:4px;"><div style="width:'+bw+'px;height:4px;background:'+bc+';border-radius:3px;min-width:2px;flex-shrink:0;"></div><span style="font-size:.65rem;font-weight:700;color:#475569;">'+x.pct.toFixed(1)+'%</span></div></td>'
      +'<td style="padding:5px 7px;font-size:.66rem;color:#64748b;text-align:right;">'+x.acc.toFixed(1)+'%</td>'
      +'<td style="padding:3px 6px;text-align:center;"><span style="display:inline-block;'+clsB(x.cls)+'padding:2px 8px;border-radius:20px;font-size:.64rem;font-weight:800;">'+x.cls+'</span></td>'
      +'</tr>';
  }).join('');
  const htmlParts=[
    '<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8">',
    '<title>Curva ABC - Grupo Renova 2026</title>',
    '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700;900&display=swap" rel="stylesheet">',
    '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:"DM Sans",sans-serif;background:#e2e8f0;padding:1.5rem;}',
    '.page{background:#fff;width:210mm;min-height:297mm;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,.15);display:flex;flex-direction:column;}',
    '.hdr{background:linear-gradient(135deg,#0a0f1e,#1e3a5f);padding:1rem 1.8rem;display:flex;justify-content:space-between;align-items:center;}',
    '.hdr img{height:68px;}.hdr-r{text-align:right;}.hdr-r .co{font-size:.9rem;font-weight:900;color:#fff;}',
    '.hdr-r .sub{font-size:.63rem;color:#94a3b8;margin-top:2px;}.hdr-r .dt{font-size:.7rem;color:#7dd3fc;font-weight:700;margin-top:5px;}',
    '.faixa{background:#1d4ed8;padding:.4rem 1.8rem;display:flex;justify-content:space-between;align-items:center;}',
    '.faixa .ft{font-size:.7rem;font-weight:800;color:#fff;letter-spacing:.05em;text-transform:uppercase;}',
    '.faixa .fc{background:rgba(255,255,255,.15);color:#fff;font-size:.6rem;font-weight:800;padding:2px 9px;border-radius:20px;}',
    '.body{padding:.8rem 1.8rem;flex:1;}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:.55rem;margin-bottom:.8rem;}',
    '.kpi{background:#f8fafc;border-radius:7px;padding:.55rem .7rem;text-align:center;border:1px solid #e2e8f0;}',
    '.kpi .kl{font-size:.56rem;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;}',
    '.kpi .kv{font-size:.84rem;font-weight:900;color:#0f172a;margin-top:2px;}',
    '.cls{display:grid;grid-template-columns:repeat(3,1fr);gap:.55rem;margin-bottom:.8rem;}',
    '.cla{background:#0f172a;border-radius:8px;padding:.65rem .85rem;}.clb{background:#1d4ed8;border-radius:8px;padding:.65rem .85rem;}',
    '.clc{background:#f1f5f9;border-radius:8px;padding:.65rem .85rem;border:1px solid #e2e8f0;}',
    '.cl{font-size:.56rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px;}',
    '.cla .cl,.clb .cl{color:rgba(255,255,255,.5);}.cla .cv,.clb .cv{color:#fff;font-size:.9rem;font-weight:900;}.cla .cs,.clb .cs{color:rgba(255,255,255,.55);font-size:.65rem;}',
    '.clc .cl{color:#94a3b8;}.clc .cv{color:#1e293b;font-size:.9rem;font-weight:900;}.clc .cs{color:#64748b;font-size:.65rem;}',
    '.sec{font-size:.62rem;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin-bottom:.4rem;display:flex;align-items:center;gap:6px;}',
    '.sec::after{content:"";flex:1;height:1px;background:#e2e8f0;}',
    'table{width:100%;border-collapse:collapse;}thead tr{background:#0f172a;}',
    'thead th{padding:5px 7px;font-size:.58rem;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;text-align:left;}',
    '.tf td{padding:6px 8px;font-size:.72rem;font-weight:900;background:#0f172a;color:#fff;border-top:2px solid #1d4ed8;}',
    '.obs{background:#eff6ff;border-left:3px solid #1d4ed8;border-radius:0 7px 7px 0;padding:.55rem .85rem;margin-top:.65rem;}',
    '.obs-h{font-size:.6rem;font-weight:800;color:#1d4ed8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem;}',
    '.obs-li{font-size:.66rem;color:#334155;line-height:1.5;margin-bottom:.12rem;padding-left:.8rem;position:relative;}',
    '.obs-li::before{content:">>";color:#1d4ed8;font-weight:800;position:absolute;left:0;}',
    '.rodape{padding:.55rem 1.8rem;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;}',
    '.rl{font-size:.56rem;color:#94a3b8;line-height:1.5;}.rr{text-align:right;font-size:.56rem;color:#94a3b8;}',
    '.pill{background:#fee2e2;color:#ef4444;font-size:.56rem;font-weight:800;padding:2px 7px;border-radius:20px;}',
    '.pbtn-wrap{max-width:210mm;margin:0 auto 1rem;display:flex;justify-content:flex-end;}',
    '.pbtn{background:#1e3a5f;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-weight:700;font-size:.8rem;cursor:pointer;}',
    '@media print{body{background:#fff;padding:0;}.page{box-shadow:none;margin:0;width:100%;}.pbtn-wrap{display:none !important;}}</style></head><body>',
    '<div class="pbtn-wrap"><button class="pbtn" onclick="window.print()">Salvar como PDF</button></div>',
    '<div class="page">',
    '<div class="hdr"><img src="'+logoSrc+'" alt="Renova" />',
    '<div class="hdr-r"><div class="co">GRUPO RENOVA</div>',
    '<div class="sub">Renova Manutenoes Ltda - CNPJ 58.190.365/0001-06</div>',
    '<div class="sub">Jacarei - SP - Manutencao de Caminhoes e Implementos</div>',
    '<div class="dt">'+hoje+'</div></div></div>',
    '<div class="faixa"><span class="ft">Curva ABC - Carteira de Clientes - Jan-Mai 2026 - Consolidado Grupo</span><span class="fc">Confidencial</span></div>',
    '<div class="body">',
    '<div class="kpis">',
    '<div class="kpi"><div class="kl">Faturamento Total</div><div class="kv">'+fmtM(total)+'</div></div>',
    '<div class="kpi"><div class="kl">OSs Faturadas</div><div class="kv">'+osCount+'</div></div>',
    '<div class="kpi"><div class="kl">Clientes Ativos</div><div class="kv">'+abc.length+'</div></div>',
    '<div class="kpi"><div class="kl">Ticket Medio</div><div class="kv">'+fmtM(total/osCount)+'</div></div>',
    '</div>',
    '<div class="cls">',
    '<div class="cla"><div class="cl">Classe A - Estrategicos</div><div class="cv">'+aL.length+' cliente'+(aL.length>1?'s':'')+'</div><div class="cs">'+fmtM(aL.reduce((s,x)=>s+x.val,0))+' - '+aP.toFixed(1)+'%</div></div>',
    '<div class="clb"><div class="cl">Classe B - Importantes</div><div class="cv">'+bL.length+' clientes</div><div class="cs">'+fmtM(bL.reduce((s,x)=>s+x.val,0))+' - '+bP.toFixed(1)+'%</div></div>',
    '<div class="clc"><div class="cl">Classe C - Complementares</div><div class="cv">'+cL.length+' clientes</div><div class="cs">'+fmtM(cL.reduce((s,x)=>s+x.val,0))+' - '+(100-aP-bP).toFixed(1)+'%</div></div>',
    '</div>',
    '<div class="sec">Ranking Completo de Clientes</div>',
    '<table><thead><tr>',
    '<th style="width:4%;text-align:center;">#</th>',
    '<th style="width:43%;">Cliente</th>',
    '<th style="width:17%;text-align:right;">Faturamento</th>',
    '<th style="width:18%;">Participacao</th>',
    '<th style="width:10%;text-align:right;">Acumulado</th>',
    '<th style="width:8%;text-align:center;">Classe</th>',
    '</tr></thead><tbody>'+tableRows+'</tbody>',
    '<tfoot><tr class="tf">',
    '<td colspan="2">TOTAL - '+abc.length+' clientes - Renova + Vale Truck</td>',
    '<td style="text-align:right;">'+fmtM(total)+'</td><td colspan="3"></td>',
    '</tr></tfoot></table>',
    '<div class="obs"><div class="obs-h">Observacoes</div>',
    '<div class="obs-li">Os '+aL.length+' clientes Classe A representam '+aP.toFixed(1)+'% do faturamento - contratos recorrentes com grandes frotas.</div>',
    '<div class="obs-li">Os '+(aL.length+bL.length)+' clientes Classe A+B respondem por '+(aP+bP).toFixed(1)+'% do faturamento total do grupo.</div>',
    '<div class="obs-li">Periodo: janeiro a maio de 2026 - '+osCount+' OSs faturadas - Fonte: sistema Genesis (RBA Sistemas).</div>',
    '</div></div>',
    '<div class="rodape">',
    '<div class="rl">Grupo Renova - Renova Manutenoes Ltda - CNPJ 58.190.365/0001-06<br>Documento gerado em '+hoje+' - Sistema de Gestao - Pedro Neto Business Consultant</div>',
    '<div class="rr"><span class="pill">Confidencial</span><br><span style="margin-top:3px;display:block;">Uso restrito</span></div>',
    '</div></div></body></html>'
  ];
  const blob=new Blob([htmlParts.join('')],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  window.open(url,'_blank');
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
