# Módulo: Manual da Empresa

Institucional, organograma editável (com fotos), descrições de cargo, processo operacional, regras de conduta e, para admin, usuários do portal.

- **Acesso:** todos veem; editar exige papel admin (`rvPodeEditar()`) · Home → Gestão Empresarial
- **Entrada:** `initManual()` (monta só na primeira vez)
- **Dados:** `apps-script/manual-empresa.gs` (`API_MANUAL`, o mesmo endpoint do login), com rascunho local em `localStorage` (`renova_manual_org_v1`)

## Particularidades
- A janela de troca de senha (`#mn-modal-senha`) mora aqui. Quando o login avisa que a senha ainda é a padrão, o `js/auth.js` chama `carregarModulo('manual')` para montar o módulo em segundo plano e depois abre a janela.
- O selo de usuário (`#rv-quem`, `#rv-papel`) é preenchido por `rvAplicarPapel()`, que o router chama sempre que um módulo termina de carregar.
- Os modais ficam fora de `#screen-manual` no template, para aparecerem mesmo com a tela do Manual oculta.

## Arquivos
- `template.html`, `index.js`, `style.css` (escopado, carrega sob demanda)
