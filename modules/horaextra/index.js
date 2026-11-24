/**
 * Módulo: Hora Extra PJ (somente admin)
 * Carregado sob demanda por js/router.js. Fala com o ColaboradoresPJ.gs (repositório portaria-renova):
 *   GET  rh_mes, rh_pessoas, rh_config
 *   POST rh_decidir, rh_registro, rh_socorro_desfazer
 * Os valores e o cálculo vêm SEMPRE do servidor; esta tela só mostra, pede aprovação e exporta o fechamento.
 * Nada de pessoa ou dinheiro real mora neste arquivo (o repositório é público).
 */

const HE = {
  API: (typeof CONFIG !== 'undefined' && CONFIG.PJ_API) || '',
  dados: null,        // última resposta de rh_mes
  aberta: null,       // código do colaborador com o detalhe aberto
  seq: 0,             // descarta resposta velha se o usuário trocou de mês no meio
  fora: null,         // resposta de rh_pessoas
  valoresRH: null,    // valores de hora que o RH usa hoje (rh_config)
};

const heApiLigada = () => /^https?:\/\//.test(HE.API || '');

/* ── Funções puras (testadas em ferramentas/testar-horaextra.js) ─────────── */

const heEsc = s => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const heDinheiro = v => Math.round(((v || 0) + 1e-9) * 100) / 100;
const heMoeda = v => 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const heHoras = min => { min = Math.max(0, Math.round(min || 0)); const h = Math.floor(min / 60), m = min % 60; return h ? h + 'h' + (m ? String(m).padStart(2, '0') : '') : m + ' min'; };
const heHorasNum = min => Math.round((min || 0) / 60 * 100) / 100;   // 90 → 1,5 (para a planilha)
const heDiaBR = d => String(d).slice(8, 10) + '/' + String(d).slice(5, 7);
const HE_DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const HE_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const heMesRotulo = k => HE_MESES[+k.slice(5, 7) - 1] + '/' + k.slice(0, 4);
const heMesSeguinte = k => { const a = +k.slice(0, 4), m = +k.slice(5, 7); return m === 12 ? (a + 1) + '-01' : a + '-' + String(m + 1).padStart(2, '0'); };
const heHM = min => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
const HE_FAIXA = { DIA: 'Dia', NOITE: 'Noite', DF: 'Dom/feriado' };
const HE_MOTIVO = { hibrido: 'Híbrido', prefixo: 'Pró-labore', excluido: 'Fora por decisão da gestão', inativo: 'Inativo' };

/** Soma o mês de todos os colaboradores. Hora extra só conta o que está aprovado (ou calculado, se o RH não exige aprovação). */
function heTotais(pessoas) {
  const t = { aprovMin: 0, aprovValor: 0, pendentes: 0, pendenteMin: 0, pendenteValor: 0, incompletos: 0, divergentes: 0,
              socorroQtd: 0, socorroValor: 0, absorvidoMin: 0, total: 0 };
  (pessoas || []).forEach(p => {
    const x = p.totais || {};
    t.aprovMin += (x.minSS || 0) + (x.minDF || 0);
    t.aprovValor += x.valor || 0;
    t.pendentes += x.pendentes || 0; t.pendenteMin += x.pendenteMin || 0; t.pendenteValor += x.pendenteValor || 0;
    t.incompletos += x.incompletos || 0; t.divergentes += x.divergentes || 0;
    t.socorroQtd += x.socorroQtd || 0; t.socorroValor += x.socorroValor || 0; t.absorvidoMin += x.socorroAbsorvidoMin || 0;
  });
  ['aprovValor', 'pendenteValor', 'socorroValor'].forEach(k => { t[k] = heDinheiro(t[k]); });
  t.total = heDinheiro(t.aprovValor + t.socorroValor);
  return t;
}

const heTemMovimento = p => !!(p.totais && (p.totais.diasComRegistro > 0 || p.totais.socorroQtd > 0));
const heTotalPessoa = p => heDinheiro(((p.totais || {}).valor || 0) + ((p.totais || {}).socorroValor || 0));

/** Linhas do fechamento do mês (uma por colaborador com movimento). */
function heLinhasFechamento(pessoas) {
  return (pessoas || []).filter(heTemMovimento).map(p => {
    const x = p.totais;
    return { codigo: p.codigo, nome: p.nome, dias: x.diasComRegistro, horasExtra: heHorasNum(x.minSS + x.minDF), valorExtra: heDinheiro(x.valor),
             socorros: x.socorroQtd, valorSocorro: heDinheiro(x.socorroValor), total: heTotalPessoa(p),
             pendenteValor: heDinheiro(x.pendenteValor), pendentes: x.pendentes, incompletos: x.incompletos };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Itens de aprovação para todos os dias pendentes (e completos) de um colaborador. */
function heItensPendentes(p) {
  return (p.dias || []).filter(d => d.efetivo && d.efetivo.estado === 'PENDENTE' && !d.incompleto && !d.emAndamento && d.extraMin > 0)
    .map(d => ({ codigo: p.codigo, dia: d.dia, acao: 'APROVAR' }));
}

/** O que mostrar na coluna "Situação" de um dia: { cls, txt }. */
function heSituacaoDia(d) {
  if (d.incompleto) return { cls: 'inc', txt: 'Registro incompleto' };
  if (d.emAndamento) return { cls: 'rec', txt: 'Em andamento' };
  if (d.semJornada) return { cls: 'rec', txt: 'Sem horário' };
  const dec = d.decisao;
  if (dec && dec.status === 'APROVADO') return { cls: 'ok', txt: 'Aprovado ' + heHoras(dec.minSS + dec.minDF) + (dec.diverge ? ' · mudou depois' : '') };
  if (dec && dec.status === 'RECUSADO') return { cls: 'rec', txt: 'Recusado' };
  if (d.extraMin > 0) return { cls: d.efetivo.estado === 'CALCULADO' ? 'ok' : 'pend', txt: d.efetivo.estado === 'CALCULADO' ? 'Calculado' : 'Pendente' };
  return { cls: '', txt: '—' };
}

/* ── Rede ───────────────────────────────────────────────────────────────── */

async function heChamar(metodo, action, corpo) {
  if (!heApiLigada()) throw new Error('O módulo ainda não foi ligado ao backend.');
  let r;
  if (metodo === 'GET') {
    r = await fetch(HE.API + '?' + new URLSearchParams(Object.assign({ action, token: RV.token, t: Date.now() }, corpo || {})));
  } else {
    r = await fetch(HE.API, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                              body: JSON.stringify(Object.assign({ action, token: RV.token }, corpo || {})) });
  }
  const d = await r.json();
  if (!d.success) {
    const e = new Error(d.codigo === 'SESSAO' ? 'Sessão do portal expirada. Saia e entre de novo.' : (d.error || 'Falha no servidor.'));
    e.cod = d.codigo; throw e;
  }
  return d.data;
}

/* ── Tela ───────────────────────────────────────────────────────────────── */

function initHoraExtra() {
  const el = document.getElementById('he-mes');
  if (!el.value) { const h = new Date(); el.value = h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0'); }
  document.getElementById('he-desligado').style.display = heApiLigada() ? 'none' : 'block';
  if (!heApiLigada()) { document.getElementById('he-tabela').innerHTML = '<tbody><tr><td class="he-vazio">Sem dados: módulo não ligado.</td></tr></tbody>'; return; }
  heCarregar(false);
}

function heMudarMes() { HE.aberta = null; heCarregar(false); }

function heMostrarErro(msg) {
  const e = document.getElementById('he-erro');
  e.style.display = msg ? 'block' : 'none';
  e.textContent = msg || '';
}

async function heCarregar(forcar) {
  const mes = document.getElementById('he-mes').value;
  if (!/^\d{4}-\d{2}$/.test(mes)) return;
  const meu = ++HE.seq;
  heMostrarErro('');
  document.getElementById('he-tabela').innerHTML = '<tbody><tr><td class="he-vazio">Carregando…</td></tr></tbody>';
  try {
    const [d, fora, cfg] = await Promise.all([
      heChamar('GET', 'rh_mes', { mes }),
      (HE.fora && !forcar) ? Promise.resolve(HE.fora) : heChamar('GET', 'rh_pessoas').catch(() => null),
      (HE.valoresRH && !forcar) ? Promise.resolve({ valoresRH: HE.valoresRH }) : heChamar('GET', 'rh_config').catch(() => null)
    ]);
    if (meu !== HE.seq) return;   // o usuário já trocou de mês
    HE.dados = d; HE.fora = fora; HE.valoresRH = cfg ? cfg.valoresRH : null;
    heRender();
  } catch (e) {
    if (meu !== HE.seq) return;
    document.getElementById('he-tabela').innerHTML = '<tbody><tr><td class="he-vazio">Não foi possível carregar.</td></tr></tbody>';
    heMostrarErro(e.message);
  }
}

function heRender() {
  const d = HE.dados; if (!d) return;
  document.getElementById('he-gerado').textContent = 'Lido às ' + String(d.agora).slice(11, 16);
  document.getElementById('he-pagamento').textContent = 'Pagamento no dia 10 de ' + heMesRotulo(heMesSeguinte(d.mes)) + ', junto com a nota fiscal.';
  heRenderAvisos(); heRenderCartoes(); heRenderTabela(); heRenderRegras(); heRenderFora();
}

function heRenderAvisos() {
  const d = HE.dados, av = [], t = heTotais(d.pessoas), R = d.regras || {}, v = HE.valoresRH;
  if (t.incompletos) av.push(`<b>${t.incompletos} dia(s) com registro incompleto</b> (entrada sem saída ou o contrário). Eles não geram pagamento até alguém corrigir os registros no detalhe do colaborador.`);
  if (t.divergentes) av.push(`<b>${t.divergentes} aprovação(ões) ficaram diferentes do cálculo atual</b> (um registro mudou depois de aprovar). Reabra e confira.`);
  if (v && v.segSab !== null && v.segSab !== undefined && (v.segSab !== R.valorSS || v.domFeriado !== R.valorDF)) {
    av.push(`Os valores de hora daqui (${heMoeda(R.valorSS)} e ${heMoeda(R.valorDF)}) estão diferentes dos da planilha do RH (${heMoeda(v.segSab)} e ${heMoeda(v.domFeriado)}).`);
  }
  document.getElementById('he-avisos').innerHTML = av.map(x => `<div class="he-aviso">${x}</div>`).join('');
}

function heRenderCartoes() {
  const d = HE.dados, t = heTotais(d.pessoas);
  const k = (cls, rot, val, sub) => `<div class="he-kpi ${cls}"><small>${rot}</small><b>${val}</b><span>${sub}</span></div>`;
  document.getElementById('he-cartoes').innerHTML =
    k('destaque', 'Total a pagar no mês', heMoeda(t.total), 'hora extra aprovada + socorros') +
    k('', 'Hora extra aprovada', heMoeda(t.aprovValor), heHoras(t.aprovMin)) +
    k('', 'Socorros', heMoeda(t.socorroValor), t.socorroQtd + (t.socorroQtd === 1 ? ' atendimento' : ' atendimentos')) +
    k(t.pendentes ? 'alerta' : '', 'Aguardando aprovação', heMoeda(t.pendenteValor), t.pendentes + (t.pendentes === 1 ? ' dia' : ' dias') + ' · ' + heHoras(t.pendenteMin) + ' (não entra no total)');
}

function heRenderTabela() {
  const d = HE.dados; if (!d) return;
  const soMov = document.getElementById('he-so-movimento').checked;
  const lista = d.pessoas.filter(p => !soMov || heTemMovimento(p)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const tb = document.getElementById('he-tabela');
  if (!lista.length) { tb.innerHTML = '<tbody><tr><td class="he-vazio">Ninguém com movimento neste mês.</td></tr></tbody>'; heRenderDetalhe(); return; }
  tb.innerHTML = '<thead><tr><th>Colaborador</th><th>Dias</th><th>Hora extra</th><th>Valor</th><th>Pendente</th><th>Socorros</th><th>Total a pagar</th></tr></thead><tbody>' +
    lista.map(p => {
      const x = p.totais;
      const chips = (x.pendentes ? `<span class="he-chip pend">${x.pendentes} a aprovar</span>` : '') + (x.incompletos ? `<span class="he-chip inc">${x.incompletos} incompleto(s)</span>` : '') +
                    (!p.naPortaria ? '<span class="he-chip rec">fora da portaria</span>' : '');
      return `<tr class="he-linha ${HE.aberta === p.codigo ? 'he-sel' : ''}" data-c="${heEsc(p.codigo)}" onclick="heAbrir(this.dataset.c)">
        <td class="he-nome">${heEsc(p.curto || p.nome)}${chips}<small>${heEsc(p.cargo || '')}</small></td>
        <td>${x.diasComRegistro}</td><td>${heHoras(x.minSS + x.minDF)}</td><td>${heMoeda(x.valor)}</td>
        <td>${x.pendentes ? heMoeda(x.pendenteValor) : '—'}</td>
        <td>${x.socorroQtd ? x.socorroQtd + ' · ' + heMoeda(x.socorroValor) : '—'}</td>
        <td><b>${heMoeda(heTotalPessoa(p))}</b></td></tr>`;
    }).join('') + '</tbody>';
  heRenderDetalhe();
}

function heAbrir(codigo) {
  HE.aberta = HE.aberta === codigo ? null : codigo;
  heRenderTabela();
  if (HE.aberta) document.getElementById('he-detalhe-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function heRegistroHtml(r, tipo, dia) {
  if (!r) return '';
  const sufixo = r.d && r.d !== dia ? ' (+1)' : '';
  const dica = r.obs ? ` title="${heEsc(r.obs)}"` : '';
  return `<span class="he-reg"${dica}>${tipo} ${heEsc(r.h)}${sufixo}${r.rh ? ' <i class="fa-solid fa-user-pen" title="lançado pelo RH"></i>' : ''}
    <button title="Corrigir horário" data-id="${heEsc(r.id)}" data-h="${heEsc((r.d || dia) + ' ' + r.h)}" onclick="heCorrigirRegistro(this.dataset.id, this.dataset.h)"><i class="fa-solid fa-pen"></i></button>
    <button title="Cancelar registro" data-id="${heEsc(r.id)}" onclick="heCancelarRegistro(this.dataset.id)"><i class="fa-solid fa-xmark"></i></button></span>`;
}

function heRenderDetalhe() {
  const card = document.getElementById('he-detalhe-card');
  const p = HE.dados && HE.aberta ? HE.dados.pessoas.find(x => x.codigo === HE.aberta) : null;
  if (!p) { card.style.display = 'none'; card.innerHTML = ''; return; }
  card.style.display = 'block';
  const dias = (p.dias || []).filter(d => !d.semRegistro), semReg = (p.dias || []).length - dias.length;
  const pend = heItensPendentes(p);
  const linhas = dias.map(d => {
    const sit = heSituacaoDia(d), ef = d.efetivo || {};
    const regs = (d.sessoes || []).map(s => heRegistroHtml(s.e, 'E', d.dia) + heRegistroHtml(s.s, 'S', d.dia)).join('') || '—';
    const decidido = d.decisao && d.decisao.status !== 'PENDENTE';
    const valor = ef.estado === 'APROVADO' || ef.estado === 'CALCULADO' ? heMoeda(ef.valor) : (d.extraMin > 0 && !decidido ? `<span class="he-nota">${heMoeda(d.valor)} (a aprovar)</span>` : '—');
    let acoes = '';
    const podeDecidir = d.extraMin > 0 && !d.incompleto && !d.emAndamento && !d.semJornada;
    if (podeDecidir && !decidido) {
      acoes += `<button class="he-btn mini ok" data-c="${heEsc(p.codigo)}" data-d="${d.dia}" onclick="heDecidirDia(this.dataset.c, this.dataset.d, 'APROVAR')">Aprovar</button>`;
      acoes += `<button class="he-btn mini" data-c="${heEsc(p.codigo)}" data-d="${d.dia}" data-m="${d.extraMin}" onclick="heAjustarDia(this.dataset.c, this.dataset.d, +this.dataset.m)">Ajustar</button>`;
      acoes += `<button class="he-btn mini ruim" data-c="${heEsc(p.codigo)}" data-d="${d.dia}" onclick="heDecidirDia(this.dataset.c, this.dataset.d, 'RECUSAR')">Recusar</button>`;
    }
    if (decidido) acoes += `<button class="he-btn mini" data-c="${heEsc(p.codigo)}" data-d="${d.dia}" onclick="heDecidirDia(this.dataset.c, this.dataset.d, 'REABRIR')">Reabrir</button>`;
    acoes += `<button class="he-btn mini" title="Lançar entrada ou saída que faltou" data-c="${heEsc(p.codigo)}" data-d="${d.dia}" onclick="heLancarRegistro(this.dataset.c, this.dataset.d)">+ registro</button>`;
    return `<tr>
      <td class="he-dia-info">${heDiaBR(d.dia)} ${HE_DOW[d.dow]}${d.feriado ? ' · ' + heEsc(d.feriado) : ''}<small>${d.jornada ? heEsc(d.jornada[0] + '–' + d.jornada[1]) : (d.diaLivre ? 'dia sem expediente' : '')}</small></td>
      <td class="he-regs">${regs}</td>
      <td>${heHoras(d.trabalhadoMin)}</td>
      <td>${d.extraMin ? heHoras(d.extraMin) : '—'}${d.socorroAbsorvidoMin ? `<small class="he-nota" style="display:block">socorro cobriu ${heHoras(d.socorroAbsorvidoMin)}</small>` : ''}</td>
      <td><span class="he-chip ${sit.cls}">${heEsc(sit.txt)}</span></td>
      <td>${valor}</td><td class="he-acoes">${acoes}</td></tr>`;
  }).join('');

  const socs = (p.socorros || []).map(s => `<li><b>${heDiaBR(s.dia)}</b> ${heEsc(s.inicio.slice(11))} → ${heEsc(s.fim.slice(11))}
      <span class="he-chip soc">${heEsc(HE_FAIXA[s.faixa] || s.faixa)}</span> <b>${heMoeda(s.valor)}</b>
      <span class="he-nota">lançado por ${heEsc(s.por || '')}${s.obs ? ' · ' + heEsc(s.obs) : ''}</span>
      <button class="he-btn mini ruim" data-id="${heEsc(s.id)}" onclick="heCancelarSocorro(this.dataset.id)">Cancelar</button></li>`).join('');

  card.innerHTML = `<h3>${heEsc(p.nome)} <span class="he-nota">${heEsc(p.cargo || '')} · horário: ${heEsc(p.jornadaResumo || 'não reconhecido')}</span>
      ${pend.length ? `<button class="he-btn ok" onclick="heAprovarTodos()">Aprovar os ${pend.length} dia(s) pendentes</button>` : ''}</h3>
    ${dias.length ? `<div class="he-rolagem"><table><thead><tr><th>Dia</th><th>Registros</th><th>Trabalhado</th><th>Extra</th><th>Situação</th><th>Valor</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
                  : '<p class="he-nota">Nenhum registro de ponto neste mês.</p>'}
    ${semReg ? `<p class="he-nota">${semReg} dia(s) de expediente sem nenhum registro (só informativo: nada é descontado).</p>` : ''}
    <h3 style="margin-top:14px;">Socorros do mês</h3>
    ${socs ? `<ul class="he-lista">${socs}</ul>` : '<p class="he-nota">Nenhum socorro lançado neste mês.</p>'}`;
}

function heRenderRegras() {
  const R = (HE.dados && HE.dados.regras) || {};
  const sim = v => v ? 'sim' : 'não';
  const it = (a, b) => `<li><span>${a}</span><b>${b}</b></li>`;
  document.getElementById('he-regras').innerHTML = '<ul class="he-lista">' +
    it('Hora extra segunda a sábado', heMoeda(R.valorSS) + ' por hora') +
    it('Hora extra domingo e feriado', heMoeda(R.valorDF) + ' por hora') +
    it('Tolerância', (R.toleranciaMin || 0) + ' minutos') +
    it('Socorro segunda a sábado, termina até ' + heHM(R.socorroNoiteApos || 0), heMoeda(R.socorroDia) + ' por atendimento') +
    it('Socorro segunda a sábado, termina depois disso', heMoeda(R.socorroNoite) + ' por atendimento') +
    it('Socorro em domingo e feriado', heMoeda(R.socorroDF) + ' por atendimento') +
    it('Socorro substitui a hora extra durante o atendimento', 'sim') +
    it('Hora extra precisa de aprovação', sim(R.exigeAprovacao)) + '</ul>';
}

function heRenderFora() {
  const el = document.getElementById('he-fora'), f = HE.fora;
  if (!f || !f.pessoas) { el.innerHTML = '<p class="he-nota">Lista indisponível.</p>'; return; }
  const fora = f.pessoas.filter(p => !p.naPortaria && p.motivo !== 'inativo');
  const inativos = f.pessoas.filter(p => p.motivo === 'inativo').length;
  el.innerHTML = (fora.length ? '<ul class="he-lista">' + fora.map(p => `<li><b>${heEsc(p.curto || p.nome)}</b><span class="he-nota">${heEsc(HE_MOTIVO[p.motivo] || p.motivo)}</span></li>`).join('') + '</ul>'
                              : '<p class="he-nota">Ninguém ativo fora da portaria.</p>') +
    `<p class="he-nota">${inativos} desligado(s)/inativo(s) não aparecem aqui. Para incluir ou excluir alguém à mão, use a aba <b>Pessoas</b> da planilha da portaria.</p>`;
}

/* ── Ações ──────────────────────────────────────────────────────────────── */

async function heAplicar(fn) {
  try { await fn(); await heCarregar(false); }
  catch (e) { alert(e.message); }
}

async function heDecidir(itens) {
  const r = await heChamar('POST', 'rh_decidir', { itens });
  const erros = (r.itens || []).filter(i => !i.ok).map(i => i.chave.split('|')[1] + ': ' + i.erro);
  if (erros.length) alert('Alguns itens não foram gravados:\n\n' + erros.join('\n'));
}

function heDecidirDia(codigo, dia, acao) {
  if (acao === 'RECUSAR' && !confirm('Recusar a hora extra de ' + heDiaBR(dia) + '? Ela não entra no pagamento.')) return;
  heAplicar(() => heDecidir([{ codigo, dia, acao }]));
}

function heAjustarDia(codigo, dia, calculado) {
  const v = prompt('Quantos minutos de hora extra aprovar em ' + heDiaBR(dia) + '?\n(calculado: ' + calculado + ' min = ' + heHoras(calculado) + ')', String(calculado));
  if (v === null) return;
  const m = Math.round(Number(String(v).replace(',', '.')));
  if (!isFinite(m) || m < 0) return alert('Digite um número de minutos.');
  let obs = '';
  if (m !== calculado) { obs = prompt('Explique o ajuste (fica guardado):', ''); if (!obs || !obs.trim()) return alert('O ajuste precisa de uma explicação.'); }
  heAplicar(() => heDecidir([{ codigo, dia, acao: 'APROVAR', minutos: m, obs }]));
}

function heAprovarTodos() {
  const p = HE.dados.pessoas.find(x => x.codigo === HE.aberta); if (!p) return;
  const itens = heItensPendentes(p);
  if (!itens.length || !confirm('Aprovar a hora extra calculada de ' + itens.length + ' dia(s) de ' + (p.curto || p.nome) + '?')) return;
  heAplicar(() => heDecidir(itens));
}

function heMotivo(txt) {
  const m = prompt(txt, '');
  if (m === null) return null;
  if (m.trim().length < 3) { alert('Escreva o motivo (pelo menos 3 letras): ele fica guardado.'); return null; }
  return m.trim();
}

function heCorrigirRegistro(id, atual) {
  const dh = prompt('Novo horário (AAAA-MM-DD HH:MM):', atual); if (!dh) return;
  const motivo = heMotivo('Motivo da correção:'); if (!motivo) return;
  heAplicar(() => heChamar('POST', 'rh_registro', { acao: 'corrigir', id, dataHora: dh.trim(), motivo }));
}

function heCancelarRegistro(id) {
  const motivo = heMotivo('Motivo do cancelamento do registro:'); if (!motivo) return;
  heAplicar(() => heChamar('POST', 'rh_registro', { acao: 'cancelar', id, motivo }));
}

function heLancarRegistro(codigo, dia) {
  const t = (prompt('Lançar ENTRADA ou SAÍDA? (digite E ou S)', 'S') || '').trim().toUpperCase();
  if (!t) return;
  if (t !== 'E' && t !== 'S') return alert('Digite E (entrada) ou S (saída).');
  const h = (prompt('Horário (HH:MM) em ' + heDiaBR(dia) + ':', '') || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(h)) return alert('Horário no formato HH:MM.');
  const motivo = heMotivo('Motivo do lançamento (ex.: esqueceu de registrar a saída):'); if (!motivo) return;
  heAplicar(() => heChamar('POST', 'rh_registro', { acao: 'add', codigo, tipo: t === 'E' ? 'ENTRADA' : 'SAIDA', dataHora: dia + ' ' + h.padStart(5, '0'), motivo }));
}

function heCancelarSocorro(id) {
  const motivo = heMotivo('Motivo do cancelamento do socorro:'); if (!motivo) return;
  heAplicar(() => heChamar('POST', 'rh_socorro_desfazer', { id, motivo }));
}

/* ── Fechamento (XLSX gerado no navegador) ──────────────────────────────── */

function heExportar() {
  const d = HE.dados;
  if (!d) return alert('Carregue um mês primeiro.');
  if (typeof XLSX === 'undefined') return alert('A biblioteca de planilha ainda não carregou. Tente de novo.');
  const linhas = heLinhasFechamento(d.pessoas), t = heTotais(d.pessoas);
  if (t.pendentes && !confirm(t.pendentes + ' dia(s) de hora extra ainda estão sem aprovação e NÃO entram nesta planilha.\n\nGerar mesmo assim?')) return;
  const cab = ['Código RH', 'Colaborador', 'Dias com registro', 'Horas extras aprovadas (h)', 'Valor hora extra (R$)', 'Socorros (qtd)', 'Valor socorros (R$)', 'Total a pagar (R$)', 'Pendente de aprovação (R$)', 'Dias incompletos'];
  const dados = [['Hora extra e socorro PJ — ' + heMesRotulo(d.mes) + ' — pagamento em 10/' + heMesSeguinte(d.mes).slice(5, 7) + '/' + heMesSeguinte(d.mes).slice(0, 4)], [], cab]
    .concat(linhas.map(l => [l.codigo, l.nome, l.dias, l.horasExtra, l.valorExtra, l.socorros, l.valorSocorro, l.total, l.pendenteValor, l.incompletos]))
    .concat([[], ['TOTAL', '', '', heHorasNum(t.aprovMin), t.aprovValor, t.socorroQtd, t.socorroValor, t.total, t.pendenteValor, t.incompletos]]);
  const ws = XLSX.utils.aoa_to_sheet(dados);
  ws['!cols'] = [{ wch: 11 }, { wch: 36 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fechamento');
  XLSX.writeFile(wb, 'hora-extra-pj-' + d.mes + '.xlsx');
}
