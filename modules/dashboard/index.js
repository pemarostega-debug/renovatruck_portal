/**
 * Módulo: Dashboard Operacional
 * OSs em aberto e faturamento (dados.json), gráficos de finalizadas por dia/mês.
 * Carregado sob demanda por js/router.js na primeira vez em que a tela abre.
 */

// ── STATE ──
let db = [];
let charts = {};
let activeFilter = { d1: null, d2: null }; // { cliente, status }
let currentD1Data = [];
let currentD2Data = [];
let lastRenderedD1 = []; // conjunto exibido/filtrado mais recente da tabela D1 (para exportação)
let lastRenderedD2 = []; // idem para D2
let dailyFilterDate = null; // data selecionada no gráfico diário (string "DD/MM/YYYY")


async function fetchData(){
  showLoading("Buscando dados...");
  try {
    const payload = await fetchDados();
    db = processRows(payload.ordens||[]);
    // Mostra quando os dados foram extraídos do banco, não quando a página abriu
    const g = payload.gerado_em ? new Date(payload.gerado_em) : null;
    document.getElementById("last-update").textContent = g && !isNaN(g)
      ? g.toLocaleDateString("pt-BR")+" "+g.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})
      : "–";
    renderAll();
    hideLoading();
  } catch(e){
    hideLoading();
    alert("Erro ao carregar dados.\n\n"+e.message);
  }
}

// ── PROCESS ROWS ──
function processRows(rows){
  return rows.map(row => {
    let valor = parseFloat(row.valor_total)||0;

    const status     = clean(row.descricao_fase||"OUTROS");
    const statusNorm = norm(status);
    const cliente    = clean(row.razao_cliente||"CONSUMIDOR");
    const os         = row.numero_os||"–";
    const placa      = row.placa||"";

    const dataFase   = parseDate(row.data||"");
    const dataEnc    = parseDate(row.data_encerramento||"");
    const dataFat    = dataEnc || dataFase;

    const DASH2_KW = ["faturado","pagosnf","pago s"];
    const IGNORE_KW= ["cancelado","cortesia","concluido"];

    const isDash2  = DASH2_KW.some(k=>statusNorm.includes(norm(k)));
    const isIgnore = IGNORE_KW.some(k=>statusNorm.includes(norm(k)));
    const isDash1  = !isDash2 && !isIgnore;

    return {os,cliente,placa,status,statusNorm,valor,dataFase,dataFat,isDash1,isDash2};
  });
}

// ── COMPANY FILTER ──
const getDb = () => db;

// ── RENDER ALL ──
function renderAll(){
  renderDash1();
  populateClientSelect();
  if(document.getElementById("dash2").style.display!=="none") renderDash2();
}

// ── DASH 1 ──
function renderDash1(){
  const open = getDb().filter(d=>d.isDash1);
  currentD1Data = open;

  const match = kws => open.filter(d=>kws.some(k=>d.statusNorm.includes(norm(k))));

  const groups = {
    afaturar:    { data: match(["afaturar"]),                                   color:"#3b82f6" },
    aguardando:  { data: match(["aguardandopedido"]),                            color:"#f59e0b" },
    finalizado:  { data: match(["finalizado"]),                                  color:"#10b981" },
    execucao:    { data: match(["execucao"]),                                    color:"#6366f1" },
    agendamento: { data: match(["agendamento","agendado"]),                      color:"#8b5cf6" },
    orcamento:   { data: match(["orcamento","aguardandoaprovacao","aprovacao"]), color:"#64748b" },
  };

  Object.entries(groups).forEach(([id,{data,color}]) => {
    const total = data.reduce((a,b)=>a+b.valor,0);
    document.getElementById("kpi-"+id+"-val").textContent = fmtMoney(total);
    document.getElementById("kpi-"+id+"-qtd").textContent = data.length+" OSs";
    buildBar("c-"+id, groupBy(data,"cliente"), color, id, "d1", data);
  });

  renderTableD1(activeFilter.d1 ? applyD1Filter(open, activeFilter.d1) : open);

  // Carrega gráficos de OSs finalizadas (por dia e por mês)
  loadFinalizadosCharts();
}

function applyD1Filter(data, f){
  return data.filter(d => (!f.cliente || d.cliente===f.cliente) && f.kws.some(k=>d.statusNorm.includes(norm(k))));
}

const GROUP_LABELS = {
  afaturar:"A FATURAR", aguardando:"AGUARDANDO PEDIDO", finalizado:"FINALIZADO (EVIDÊNCIAS)",
  execucao:"EM EXECUÇÃO", agendamento:"AG. AGENDAMENTO TICKET", orcamento:"EM ORÇAMENTO / APROVAÇÃO"
};

// Clique no título do card: mostra todas as OSs da fase, sem restringir a um cliente
function filterByGroup(groupId){
  const kws = getKwsForGroup(groupId);
  const label = GROUP_LABELS[groupId]||groupId.toUpperCase();
  activeFilter.d1 = {cliente:null, kws, label};
  document.getElementById("filter-label-d1").textContent = label;
  document.getElementById("filter-tag-d1").classList.add("visible");
  renderTableD1(applyD1Filter(currentD1Data, activeFilter.d1));
}

// ── DASH 2 ──
function renderDash2(){
  const val = document.getElementById("monthFilter").value;
  if(!val) return;
  const [y,m] = val.split("-").map(Number);

  const billingAll = getDb().filter(d=>d.isDash2);
  const monthData  = billingAll.filter(d => {
    if(!d.dataFat) return false;
    return d.dataFat.getFullYear()===y && (d.dataFat.getMonth()+1)===m;
  });

  currentD2Data = monthData;
  document.getElementById("d2-total-value").textContent = fmtMoney(monthData.reduce((a,b)=>a+b.valor,0));
  document.getElementById("d2-total-qty").textContent   = monthData.length;

  buildBar("c-faturamento", groupBy(monthData,"cliente"), "#059669", null, "d2", monthData);
  buildHistory(billingAll);
  buildRosca(monthData);

  renderTableD2(activeFilter.d2 ? monthData.filter(d=>d.cliente===activeFilter.d2) : monthData);
}

// ── GRÁFICOS OSs FINALIZADAS (POR DIA e POR MÊS) ──
function parseMoneyBR(raw){
  if(!raw) return 0;
  const s = raw.toString().replace(/R\$\s*/,"").replace(/\./g,"").replace(",",".").trim();
  return parseFloat(s)||0;
}

let _finData = null; // cache dos dados já processados da planilha (evita refetch ao limpar filtros)

function monthKeyOf(dt){ return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0"); }
function monthLabel(key){
  const [y,m] = key.split("-").map(Number);
  return new Date(y, m-1, 1).toLocaleDateString("pt-BR",{month:"short",year:"2-digit"});
}

async function loadFinalizadosCharts(){
  const loadEl  = document.getElementById("daily-loading");
  const loadElM = document.getElementById("monthly-loading");
  if(loadEl)  loadEl.style.display  = "block";
  if(loadElM) loadElM.style.display = "block";
  try {
    // Busca dados da planilha de finalizações (DATA, OS, VALOR, PLACA, CLIENTE, STATUS)
    const finURL = csvURLExt(CONFIG.SHEET_FINALIZADAS_ID, CONFIG.SHEET_FINALIZADAS_ABA);
    const res = await fetch(finURL);
    if(!res.ok) throw new Error("HTTP "+res.status);
    const text = await res.text();
    const rows = await new Promise((ok,err) => Papa.parse(text,{header:true,skipEmptyLines:true,complete:r=>ok(r.data),error:e=>err(e)}));

    // Mapa OS → valor ATUAL no sistema (db). Usamos o valor vigente da OS,
    // não uma anotação manual, para refletir ajustes feitos após a finalização.
    const osValMap = {};
    db.forEach(d => {
      const osKey = d.os ? d.os.toString().trim() : null;
      if(osKey && osKey !== "–") osValMap[osKey] = (osValMap[osKey] || 0) + d.valor;
    });

    let maxDate = null;
    const validRows = [];
    rows.forEach(row => {
      const keys     = Object.keys(row);
      const dataKey  = keys.find(k => norm(k) === "data")    || keys[0];
      const osKey    = keys.find(k => norm(k) === "os")      || keys[1];
      const valorKey = keys.find(k => norm(k) === "valor");
      const placaKey = keys.find(k => norm(k) === "placa");
      const cliKey   = keys.find(k => norm(k) === "cliente");
      const statusKey= keys.find(k => norm(k) === "status");
      const dataRaw = row[dataKey] ? row[dataKey].toString().trim() : "";
      const osNum   = row[osKey]   ? row[osKey].toString().trim()   : "";
      if(!dataRaw || !osNum) return;
      const dt = parseDate(dataRaw);
      if(!dt) return;
      if(!maxDate || dt > maxDate) maxDate = dt;

      // Se a OS não for encontrada no banco (número não bate, ou foi removida),
      // cai para o valor anotado na planilha em vez de zerar silenciosamente.
      let valor = osValMap[osNum];
      if(valor === undefined){
        console.warn("OS "+osNum+" (finalizados) não encontrada no banco — usando valor da planilha como fallback.");
        valor = parseMoneyBR(valorKey ? row[valorKey] : "");
      }

      validRows.push({
        dt,
        os: osNum,
        valor,
        placa: placaKey ? (row[placaKey]||"") : "",
        cliente: cliKey ? clean(row[cliKey]||"") : "",
        status: statusKey ? clean(row[statusKey]||"FINALIZADO") : "FINALIZADO"
      });
    });

    if(!maxDate || validRows.length === 0){
      _finData = {byDate:{}, byDateRows:{}, byMonth:{}, byMonthRows:{}};
      if(loadEl)  loadEl.style.display  = "none";
      if(loadElM) loadElM.style.display = "none";
      buildDailyChart({}, {});
      buildMonthlyChart({}, {});
      return;
    }

    // Diário: janela dos últimos 30 dias a partir da data mais recente
    const cutoff = new Date(maxDate);
    cutoff.setDate(cutoff.getDate() - 29);

    const byDate = {}, byDateRows = {};       // por dia (últimos 30 dias)
    const byMonth = {}, byMonthRows = {};     // por mês (todo o histórico da planilha)

    validRows.forEach(r => {
      const mKey = monthKeyOf(r.dt);
      if(!byMonth[mKey]) { byMonth[mKey] = 0; byMonthRows[mKey] = []; }
      byMonth[mKey] += r.valor;
      byMonthRows[mKey].push(r);

      if(r.dt < cutoff) return;
      const label = r.dt.toLocaleDateString("pt-BR"); // DD/MM/AAAA
      if(!byDate[label]) { byDate[label] = 0; byDateRows[label] = []; }
      byDate[label] += r.valor;
      byDateRows[label].push(r);
    });

    _finData = {byDate, byDateRows, byMonth, byMonthRows};
    if(loadEl)  loadEl.style.display  = "none";
    if(loadElM) loadElM.style.display = "none";
    buildDailyChart(byDate, byDateRows);
    buildMonthlyChart(byMonth, byMonthRows);

  } catch(e) {
    console.warn("Erro ao carregar OSs finalizadas:", e.message);
    if(loadEl)  loadEl.style.display  = "none";
    if(loadElM) loadElM.style.display = "none";
  }
}

function buildDailyChart(byDate, byDateRows){
  // Ordena as datas cronologicamente
  const sortedDates = Object.keys(byDate).sort((a,b) => {
    const pa = a.split("/"), pb = b.split("/");
    const da = new Date(+pa[2],+pa[1]-1,+pa[0]);
    const db2= new Date(+pb[2],+pb[1]-1,+pb[0]);
    return da - db2;
  });

  const labels = sortedDates;
  const values = sortedDates.map(d => byDate[d]);

  if(charts["c-daily-os"]) charts["c-daily-os"].destroy();
  const el = document.getElementById("c-daily-os");
  if(!el) return;

  charts["c-daily-os"] = new Chart(el, {
    type: "bar",
    data: {
      labels,
      datasets:[{
        label: "Valor Faturado",
        data: values,
        backgroundColor: labels.map(l => l === dailyFilterDate ? "#1d4ed8" : "rgba(59,130,246,0.72)"),
        borderColor:     labels.map(l => l === dailyFilterDate ? "#1e40af" : "#3b82f6"),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      onClick(evt, elements){
        if(!elements.length) return;
        const idx = elements[0].index;
        const dateStr = labels[idx];
        const dayRows = byDateRows[dateStr] || [];
        applyDailyFilter(dateStr, dayRows, byDate, byDateRows);
      },
      plugins:{
        legend:{display:false},
        tooltip:{
          callbacks:{
            label: ctx => " " + fmtMoney(ctx.parsed.y),
            title: ctx => ctx[0]?.label || ""
          }
        }
      },
      scales:{
        x:{
          ticks:{ font:{size:10}, maxRotation:45, minRotation:30 },
          grid:{display:false}
        },
        y:{
          ticks:{ callback: v => "R$"+v.toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:0}), font:{size:10} },
          grid:{color:"#f1f5f9"}
        }
      }
    }
  });
}

function applyDailyFilter(dateStr, dayRows, byDate, byDateRows){
  dailyFilterDate = dateStr;

  // Detalhamento vem direto da planilha de finalizados (mesmas linhas do
  // gráfico) — não depende do status atual da OS no sistema, então OSs que
  // já viraram "Faturado" continuam aparecendo no dia em que foram finalizadas.
  const filtered = dayRows.map(r => ({
    os: r.os, cliente: r.cliente, placa: r.placa, status: r.status,
    dataFase: r.dt, dataFat: r.dt, valor: r.valor
  }));
  renderTableD1(filtered);

  // Atualiza tag de filtro
  const tag = document.getElementById("daily-filter-tag");
  const lbl = document.getElementById("daily-filter-label");
  if(tag && lbl){
    lbl.textContent = "Dia: " + dateStr + " — " + fmtMoney(byDate[dateStr] || 0);
    tag.style.display = "flex";
  }

  // Recolore as barras
  buildDailyChart(byDate, byDateRows);
}

function clearDailyFilter(){
  dailyFilterDate = null;
  const tag = document.getElementById("daily-filter-tag");
  if(tag) tag.style.display = "none";
  renderTableD1(activeFilter.d1 ? applyD1Filter(currentD1Data, activeFilter.d1) : currentD1Data);
  // Recolore o gráfico sem filtro ativo, usando o cache (sem refazer o fetch)
  if(_finData) buildDailyChart(_finData.byDate, _finData.byDateRows);
}

// ── GRÁFICO OSs FINALIZADAS POR MÊS ──
let monthlyFilterKey = null; // "YYYY-MM" do mês selecionado no gráfico mensal

function buildMonthlyChart(byMonth, byMonthRows){
  const sortedKeys = Object.keys(byMonth).sort(); // "YYYY-MM" ordena corretamente como string
  const labels = sortedKeys.map(monthLabel);
  const values = sortedKeys.map(k => byMonth[k]);

  if(charts["c-monthly-os"]) charts["c-monthly-os"].destroy();
  const el = document.getElementById("c-monthly-os");
  if(!el) return;

  charts["c-monthly-os"] = new Chart(el, {
    type: "bar",
    data: {
      labels,
      datasets:[{
        label: "Valor Faturado",
        data: values,
        backgroundColor: sortedKeys.map(k => k === monthlyFilterKey ? "#7c3aed" : "rgba(139,92,246,0.72)"),
        borderColor:     sortedKeys.map(k => k === monthlyFilterKey ? "#6d28d9" : "#8b5cf6"),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      onClick(evt, elements){
        if(!elements.length) return;
        const idx = elements[0].index;
        const key = sortedKeys[idx];
        const monthRows = byMonthRows[key] || [];
        applyMonthlyFilter(key, monthRows, byMonth, byMonthRows);
      },
      plugins:{
        legend:{display:false},
        tooltip:{
          callbacks:{
            label: ctx => " " + fmtMoney(ctx.parsed.y),
            title: ctx => ctx[0]?.label || ""
          }
        }
      },
      scales:{
        x:{
          ticks:{ font:{size:10} },
          grid:{display:false}
        },
        y:{
          ticks:{ callback: v => "R$"+v.toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:0}), font:{size:10} },
          grid:{color:"#f1f5f9"}
        }
      }
    }
  });
}

function applyMonthlyFilter(monthKey, monthRows, byMonth, byMonthRows){
  monthlyFilterKey = monthKey;

  // Detalhamento vem direto da planilha de finalizados — mesmo princípio do filtro diário
  const filtered = monthRows.map(r => ({
    os: r.os, cliente: r.cliente, placa: r.placa, status: r.status,
    dataFase: r.dt, dataFat: r.dt, valor: r.valor
  }));
  renderTableD1(filtered);

  const tag = document.getElementById("monthly-filter-tag");
  const lbl = document.getElementById("monthly-filter-label");
  if(tag && lbl){
    lbl.textContent = "Mês: " + monthLabel(monthKey) + " — " + fmtMoney(byMonth[monthKey] || 0);
    tag.style.display = "flex";
  }

  buildMonthlyChart(byMonth, byMonthRows);
}

function clearMonthlyFilter(){
  monthlyFilterKey = null;
  const tag = document.getElementById("monthly-filter-tag");
  if(tag) tag.style.display = "none";
  renderTableD1(activeFilter.d1 ? applyD1Filter(currentD1Data, activeFilter.d1) : currentD1Data);
  if(_finData) buildMonthlyChart(_finData.byMonth, _finData.byMonthRows);
}

// ── BUILD BAR com click ──
function buildBar(id, data, color, groupId, dashId, rawData){
  if(charts[id]) charts[id].destroy();
  const top = data.slice(0,15);
  const el = document.getElementById(id); if(!el) return;
  charts[id] = new Chart(el, {
    type:"bar",
    data:{
      labels: top.map(d=>d.name),
      datasets:[{data:top.map(d=>d.val), backgroundColor:color, borderRadius:5,
        hoverBackgroundColor: color+"cc",
      }]
    },
    options:{
      indexAxis:"y", responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>fmtMoney(c.raw)+" · "+top[c.dataIndex].count+" OS"+(top[c.dataIndex].count!==1?"s":"")}}},
      scales:{x:{display:false},y:{ticks:{font:{size:10,weight:"600"},color:"#475569"},grid:{display:false}}},
      onClick(evt, elements){
        if(!elements.length) return;
        const clienteName = top[elements[0].index].name;
        if(dashId==="d1" && groupId){
          const kws = getKwsForGroup(groupId);
          activeFilter.d1 = {cliente:clienteName, kws, label:clienteName+" · "+groupId.toUpperCase()};
          document.getElementById("filter-label-d1").textContent = clienteName;
          document.getElementById("filter-tag-d1").classList.add("visible");
          renderTableD1(applyD1Filter(currentD1Data, activeFilter.d1));
        } else if(dashId==="d2"){
          activeFilter.d2 = clienteName;
          document.getElementById("filter-label-d2").textContent = clienteName;
          document.getElementById("filter-tag-d2").classList.add("visible");
          renderTableD2(currentD2Data.filter(d=>d.cliente===clienteName));
        }
      },
      onHover(evt){ evt.native.target.style.cursor = "pointer"; }
    }
  });
}

function getKwsForGroup(g){
  const map={afaturar:["afaturar"],aguardando:["aguardandopedido"],finalizado:["finalizado"],execucao:["execucao"],agendamento:["agendamento","agendado"],orcamento:["orcamento","aguardandoaprovacao","aprovacao"]};
  return map[g]||[];
}

function clearFilter(dash){
  if(dash==="d1"){
    activeFilter.d1=null;
    document.getElementById("filter-tag-d1").classList.remove("visible");
    renderTableD1(currentD1Data);
  } else {
    activeFilter.d2=null;
    document.getElementById("filter-tag-d2").classList.remove("visible");
    renderTableD2(currentD2Data);
  }
}

// ── HISTORY ──
function buildHistory(fullData){
  if(charts["c-geral-12m"]) charts["c-geral-12m"].destroy();
  const labels=[],vals=[];
  const hoje=new Date();
  const counts=[];
  for(let i=11;i>=0;i--){
    const d=new Date(hoje.getFullYear(),hoje.getMonth()-i,1);
    labels.push(d.toLocaleDateString("pt-BR",{month:"short",year:"2-digit"}));
    const month=fullData.filter(r=>r.dataFat&&r.dataFat.getMonth()===d.getMonth()&&r.dataFat.getFullYear()===d.getFullYear());
    vals.push(month.reduce((a,b)=>a+b.valor,0));
    counts.push(month.length);
  }
  charts["c-geral-12m"]=new Chart(document.getElementById("c-geral-12m"),{
    type:"bar",
    data:{labels,datasets:[{data:vals,backgroundColor:"#1d4ed8",borderRadius:5}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmtMoney(c.raw)+" · "+counts[c.dataIndex]+" OS"+(counts[c.dataIndex]!==1?"s":"")}}},scales:{y:{ticks:{callback:v=>fmtMoney(v),font:{size:9}},grid:{color:"#f8fafc"}},x:{grid:{display:false},ticks:{font:{size:9}}}}}
  });
}

function buildRosca(data){
  if(charts["c-rosca"]) charts["c-rosca"].destroy();
  const g=groupBy(data,"cliente");
  const top5=g.slice(0,5), others=g.slice(5).reduce((a,b)=>a+b.val,0);
  const colors=["#ef4444","#3b82f6","#eab308","#a855f7","#22c55e","#94a3b8"];
  const labels=[...top5.map(i=>i.name)]; const vals=[...top5.map(i=>i.val)];
  if(others>0){labels.push("OUTROS");vals.push(others);}
  charts["c-rosca"]=new Chart(document.getElementById("c-rosca"),{
    type:"doughnut",
    data:{labels,datasets:[{data:vals,backgroundColor:colors,borderWidth:2,borderColor:"#fff"}]},
    options:{
      maintainAspectRatio:false,
      plugins:{legend:{
        position: window.innerWidth < 640 ? "bottom" : "right",
        labels:{font:{size:9},boxWidth:10,padding:6}
      }}
    }
  });
}

function populateClientSelect(){
  const billing=getDb().filter(d=>d.isDash2);
  const rank={};
  billing.forEach(d=>rank[d.cliente]=(rank[d.cliente]||0)+d.valor);
  const sorted=Object.keys(rank).sort((a,b)=>rank[b]-rank[a]);
  const sel=document.getElementById("clientSelect");
  sel.innerHTML='<option>Selecione um cliente...</option>'+sorted.map(c=>`<option value="${c}">${c}</option>`).join("");
}

function updateEvolution(){
  const cliente=document.getElementById("clientSelect").value;
  const placeholder=document.getElementById("evolution-placeholder");
  const wrap=document.getElementById("evolution-chart-wrap");
  if(!cliente||cliente.includes("Selecione")){
    placeholder.style.display="block"; wrap.style.display="none"; return;
  }
  placeholder.style.display="none"; wrap.style.display="block";
  const data=getDb().filter(d=>d.isDash2&&d.cliente===cliente);
  const labels=[],vals=[];
  const hoje=new Date();
  for(let i=11;i>=0;i--){
    const d=new Date(hoje.getFullYear(),hoje.getMonth()-i,1);
    labels.push(d.toLocaleDateString("pt-BR",{month:"short",year:"2-digit"}));
    vals.push(data.filter(r=>r.dataFat&&r.dataFat.getMonth()===d.getMonth()&&r.dataFat.getFullYear()===d.getFullYear()).reduce((a,b)=>a+b.valor,0));
  }
  if(charts["c-evolucao"]) charts["c-evolucao"].destroy();
  charts["c-evolucao"]=new Chart(document.getElementById("c-evolucao"),{
    type:"line",
    data:{labels,datasets:[{data:vals,borderColor:"#1d4ed8",backgroundColor:"rgba(29,78,216,.08)",fill:true,tension:.4,pointBackgroundColor:"#1d4ed8",pointRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmtMoney(c.raw)}}},scales:{y:{ticks:{callback:v=>fmtMoney(v),font:{size:9}},grid:{color:"#f1f5f9"}},x:{grid:{display:false},ticks:{font:{size:9}}}}}
  });
}

// ── TABLES ──
function renderTableD1(data){
  lastRenderedD1 = data;
  const tbody=document.getElementById("table-body-d1");
  if(!data.length){tbody.innerHTML='<tr><td colspan="6" class="empty-state">Nenhuma OS encontrada.</td></tr>';return;}
  tbody.innerHTML=data.slice(0,500).map(d=>`<tr>
    <td style="font-weight:700;">${d.os}</td>
    <td style="font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${d.cliente}">${d.cliente}</td>
    <td class="hide-mobile" style="color:var(--muted);font-size:.75rem;">${d.placa}</td>
    <td><span class="status-badge">${d.status}</span></td>
    <td class="hide-mobile" style="color:var(--muted);font-size:.75rem;">${fmtDate(d.dataFase)}</td>
    <td style="text-align:right;font-weight:800;color:var(--primary);">${fmtMoney(d.valor)}</td>
  </tr>`).join("");
}

function renderTableD2(data){
  lastRenderedD2 = data;
  const tbody=document.getElementById("table-body-d2");
  if(!data.length){tbody.innerHTML='<tr><td colspan="6" class="empty-state">Nenhuma OS encontrada.</td></tr>';return;}
  tbody.innerHTML=data.slice(0,500).map(d=>`<tr>
    <td style="font-weight:700;">${d.os}</td>
    <td style="font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${d.cliente}">${d.cliente}</td>
    <td class="hide-mobile" style="color:var(--muted);font-size:.75rem;">${d.placa}</td>
    <td class="hide-mobile"><span class="status-badge">${d.status}</span></td>
    <td style="color:var(--muted);font-size:.75rem;">${fmtDate(d.dataFat)}</td>
    <td style="text-align:right;font-weight:800;color:var(--primary);">${fmtMoney(d.valor)}</td>
  </tr>`).join("");
}

// ── EXPORTAR EXCEL ──
function exportXLSX(data, filename, dateField){
  if(!data || !data.length){ alert("Não há dados para exportar."); return; }
  const rows = data.map(d => ({
    "OS": d.os,
    "Cliente": d.cliente,
    "Placa": d.placa||"",
    "Status": d.status,
    "Data": fmtDate(d[dateField]),
    "Valor": d.valor
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{wch:10},{wch:38},{wch:14},{wch:22},{wch:12},{wch:14}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.writeFile(wb, filename+"_"+new Date().toISOString().slice(0,10)+".xlsx");
}
function exportD1XLSX(){ exportXLSX(lastRenderedD1, "ordens_em_aberto", "dataFase"); }
function exportD2XLSX(){ exportXLSX(lastRenderedD2, "faturamento", "dataFat"); }

// ── UTILS ──
function groupBy(list,key){ const m={},c={}; list.forEach(i=>{m[i[key]]=(m[i[key]]||0)+i.valor;c[i[key]]=(c[i[key]]||0)+1;}); return Object.entries(m).map(([name,val])=>({name,val,count:c[name]})).sort((a,b)=>b.val-a.val); }
function switchTab(id){
  document.getElementById("dash1").style.display=id==="dash1"?"":"none";
  document.getElementById("dash2").style.display=id==="dash2"?"":"none";
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
  document.getElementById("btn-"+id).classList.add("active");
  if(id==="dash2") renderDash2();
}

// ── SEARCH ──
// Prepara filtros e buscas da tela (antes rodava no DOMContentLoaded; agora roda quando o módulo carrega).
function dashPrepararTela(){
  document.getElementById("monthFilter").value=new Date().toISOString().slice(0,7);
  ["searchBox1","searchBox2"].forEach((id,idx)=>{
    const tbodyId=idx===0?"table-body-d1":"table-body-d2";
    document.getElementById(id).addEventListener("keyup",e=>{
      const val=e.target.value.toLowerCase();
      document.querySelectorAll("#"+tbodyId+" tr").forEach(r=>{r.style.display=r.textContent.toLowerCase().includes(val)?"":"none";});
    });
  });
}

dashPrepararTela();
