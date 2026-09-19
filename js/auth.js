/**
 * Login, sessão e papel do usuário (RV). Carregado sempre.
 */

const PASSWORD='renova2026';

// ── Sessão do usuário ──
// O login é validado no Apps Script (a lista de senhas fica numa planilha
// privada, nunca no navegador). Se o Apps Script estiver fora do ar, a senha
// antiga ainda entra, mas só como consulta — assim uma falha de rede não
// impede a equipe de ler o manual, e também não libera edição sem validação.
let RV = { token:null, usuario:null, nome:null, papel:'comum', degradado:false };
const API_MANUAL = 'https://script.google.com/macros/s/AKfycbxmdLCRPZwf6u7l8BnbtqbomFRcjplzJOKCeNWSTRNCKq8M9NtO2uWO7DjEP-xN7WBkkg/exec';

function rvPodeEditar(){ return RV.papel === 'admin'; }

function rvSalvarSessao(){
  try{ sessionStorage.setItem('rv_sessao', JSON.stringify(RV)); }catch(e){}
}
function rvRestaurarSessao(){
  try{
    const raw = sessionStorage.getItem('rv_sessao');
    if(raw){ RV = JSON.parse(raw); return true; }
  }catch(e){}
  return false;
}

function rvEntrar(){
  document.getElementById('screen-login').style.display='none';
  document.getElementById('screen-home').style.display='block';
  document.getElementById('pwd-err').style.display='none';
  rvAplicarPapel();
  rvSaudacao();
}

// Bom dia até o meio-dia, boa tarde até as 18h, boa noite dali em diante.
// Recalculada toda vez que a home aparece: quem deixa o portal aberto a manhã
// inteira não fica com "Bom dia" na tela às três da tarde.
function rvSaudacao(){
  const el = document.getElementById('home-saudacao');
  if(!el) return;
  const h = new Date().getHours();
  el.textContent = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + ' 👋';
}

function rvAplicarPapel(){
  document.body.classList.toggle('rv-admin', rvPodeEditar());
  const el = document.getElementById('rv-quem');
  if(el){
    el.textContent = RV.nome || 'Visitante';
    el.title = (RV.usuario||'') + ' · ' + (rvPodeEditar() ? 'Administrador' : 'Consulta');
  }
  const selo = document.getElementById('rv-papel');
  if(selo){
    selo.textContent = rvPodeEditar() ? 'Administrador' : 'Consulta';
    selo.className = 'rv-papel ' + (rvPodeEditar() ? 'admin' : 'comum');
  }
}

async function doLogin(){
  const usuario = (document.getElementById('usr').value||'').trim();
  const senha   = document.getElementById('pwd').value;
  const erro    = document.getElementById('pwd-err');
  const botao   = document.getElementById('btn-login');
  const falhar  = msg => { erro.textContent = msg; erro.style.display='block';
                           document.getElementById('pwd').value=''; document.getElementById('pwd').focus(); };

  if(!usuario){ falhar('Informe o usuário.'); return; }
  botao.disabled = true; botao.textContent = 'Entrando…';
  try{
    const r = await fetch(API_MANUAL, {
      method:'POST', mode:'cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({action:'login', usuario, senha})
    });
    const d = await r.json();
    if(!d.success){ falhar(d.error || 'Usuário ou senha inválidos.'); return; }
    RV = { token:d.token, usuario:d.usuario, nome:d.nome, papel:d.papel, degradado:false };
    rvSalvarSessao(); rvEntrar();
    // A janela de troca de senha mora no Manual, que só é baixado sob demanda.
    if(d.senhaPadrao) setTimeout(()=>{
      carregarModulo('manual').then(()=>abrirTrocarSenha(true))
        .catch(()=>alert('Sua senha ainda é a padrão. Troque em Manual da Empresa → Configurações.'));
    }, 600);
  }catch(e){
    console.warn('Login: Apps Script indisponível, tentando modo consulta', e);
    if(senha === PASSWORD){
      RV = { token:null, usuario:usuario, nome:usuario, papel:'comum', degradado:true };
      rvSalvarSessao(); rvEntrar();
      setTimeout(()=>alert('Não consegui validar seu acesso no servidor agora.\n\nVocê entrou em modo consulta: dá para ver tudo, mas não para editar. Tente novamente mais tarde para voltar ao acesso completo.'), 400);
    } else {
      falhar('Sem conexão com o servidor de acesso. Tente novamente.');
    }
  }finally{
    botao.disabled = false; botao.textContent = 'Acessar';
  }
}

function doLogout(){
  if(RV.token){
    fetch(API_MANUAL, {method:'POST', mode:'cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({action:'logout', token:RV.token})}).catch(()=>{});
  }
  sessionStorage.removeItem('rv_sessao');
  sessionStorage.removeItem('rv_auth');
  location.reload();
}

window.addEventListener('load',()=>{ if(rvRestaurarSessao()) rvEntrar(); });
