# Padrões do Portal Renova (pós-Fase 0)

Como o portal está organizado depois da modularização e o que todo módulo novo precisa seguir.
Complementa o `PADRAO-ARQUITETURA.md`. Onde os dois divergem, vale este arquivo, porque ele descreve o código que existe.

## 1. Como a página monta

```
index.html            casca: login, home, tela de loading e uma <div id="screen-X"></div> vazia por módulo
css/base.css          variáveis, reset, login/home/navegação: sempre carregado
js/core.js            CONFIG, helpers comuns (fetchDados, parseDate, fmtMoney, kbEsc, showLoading…)
js/auth.js            login, sessão (RV), papel (rvPodeEditar, rvAplicarPapel), logout
js/router.js          MODULOS, openModule, goHome, carregarModulo (lazy-load)
modules/<pasta>/      template.html · index.js · style.css (opcional) · README.md
ferramentas/          testar-portal.js (teste de fumaça)
```

**Primeira abertura de um módulo** (`openModule('x')`):
1. mostra a tela de loading;
2. baixa em paralelo: `template.html`, as bibliotecas do módulo (Chart.js / xlsx / PapaParse) e o `style.css` escopado;
3. troca a `<div id="screen-x">` vazia pelo template;
4. executa o `index.js`;
5. chama `rvAplicarPapel()`, mostra a tela e roda a função de entrada.

Se algo falhar na rede, o usuário recebe um aviso, continua na home e a próxima tentativa começa do zero. **Nas aberturas seguintes** não há download; só a função de entrada roda.

Resultado medido (servidor local, cache vazio): download inicial caiu de 2,6 MB para ~0,8 MB. A primeira abertura de um módulo leva entre 12 e 290 ms, mais a latência do GitHub Pages.

## 2. Criar um módulo novo: checklist

1. `modules/<pasta>/template.html`: HTML da tela. A raiz é `<div id="screen-<id>">…</div>`. Modais que precisam aparecer com a tela oculta ficam **fora** dessa div, no mesmo arquivo.
2. `modules/<pasta>/style.css`: **todo seletor começa com `#screen-<id>`** (ou com o prefixo do módulo, para os modais). Assim o CSS pode carregar sob demanda sem afetar outros módulos.
3. `modules/<pasta>/index.js`: prefixe nomes globais com a sigla do módulo (`cp`, `cr`, `rs`, `kb`…), como os módulos existentes fazem. A função de entrada roda a cada abertura; se só deve montar uma vez, use uma flag (ver `initManual`).
4. `modules/<pasta>/README.md`: o que faz, acesso, entrada, dados, bibliotecas.
5. `js/router.js`: registre em `MODULOS`: `{ pasta, libs, css, entrada, soAdmin? }`.
6. `index.html`: acrescente `<div id="screen-<id>"></div>` junto das outras.
7. `css/base.css`: acrescente `#screen-<id>` à regra que oculta as telas (`#screen-dashboard,#screen-prec,…{display:none;}`).
8. Home: card com `onclick="openModule('<id>')"`.
9. **Troque `VERSAO_PORTAL` em `js/router.js`** a cada publicação que mexer em `modules/`. Sem isso, um navegador com cache pode juntar template novo com JS antigo por até 10 min.
10. Rode `node ferramentas/testar-portal.js` antes do push. Ele precisa terminar em `OK`.

## 3. Regras que não são óbvias

- **Template não executa `<script>`**: HTML injetado não roda script. Toda lógica vai no `index.js`.
- **Nada de `DOMContentLoaded`/`load` dentro de módulo**: quando o módulo carrega, esses eventos já passaram há muito tempo. Código de preparação roda direto no fim do `index.js` (ver `dashPrepararTela`, `precPrepararTela`).
- **Chamada no topo do arquivo vai no fim dele**: `const`/`let` declarados mais abaixo ainda não existem quando o topo executa. Foi o único bug que o teste de equivalência pegou nesta fase.
- **Precisa de algo de outro módulo?** Use `await carregarModulo('<id>')` antes. Monta sem mostrar (ex.: a troca de senha pós-login usa o Manual).
- **Helper usado por dois módulos ou mais** vai para `js/core.js`.
- **CSS legado global**: `modules/dashboard/style.css` e `modules/precificacao/style.css` não têm escopo e são carregados sempre, no `<head>`, nesta ordem. A cascata entre eles (`.card`, `header`, `.modal`, `.overlay`, `body{padding-bottom:90px}`) faz parte do visual de hoje. Escopar esses dois é trabalho de redesign, com revisão visual.
- **Dado sensível nunca em arquivo do repositório** (o repo é público). Vem pelo Apps Script autenticado.
- **Desenvolvimento local**: o router usa `fetch`, então abrir o `index.html` direto (`file://`) não funciona. Rode um servidor na pasta, ex.: `npx serve .` ou `python -m http.server`.

## 4. O que a Fase 0 deliberadamente NÃO fez (e por quê)

| Item do plano | Situação | Motivo |
|---|---|---|
| IIFE `MODULE_X` + event delegation no lugar de `onclick` inline | Não feito nos 9 módulos existentes | São ~11 mil linhas e centenas de `onclick` que chamam funções globais. Reescrever tudo sem testes automatizados de comportamento é o maior risco de regressão do plano. Os módulos novos podem nascer no padrão novo; os antigos migram quando forem mexidos. |
| Deduplicar todo o CSS | Feito para `:root`, `*` e `body`, fundidos com os valores que já venciam | As outras regras "duplicadas" (`.card`, `.login-*`…) têm valores diferentes, e a ordem define o visual atual. Mudar isso é redesign. |
| `scss/` | Não criado | Não há etapa de build (GitHub Pages serve os arquivos como estão). As variáveis CSS em `:root` cumprem o papel. |
| Remover `console.log`/`TODO` | Feito | O único caso era o stub `saveToSheets()` da Precificação, que só logava no console. Foi removido. Os `console.warn`/`console.error` que ficaram são tratamento de erro real (falha de rede, Apps Script fora do ar). |
| Mobile completo | Parcial | Corrigidos: botões da barra superior cortados (ABC) e formulário de identificação/"Rentab. Alvo" espremidos (Precificação). Pendentes, porque pedem redesign: card "Classe C" da ABC cortado, rótulos dos gráficos de barra truncados, rodapé fixo da Precificação ocupando ~25% da tela no celular. |

## 5. Verificação da Fase 0

- **Equivalência:** a versão antiga e a nova foram abertas lado a lado no Edge headless, módulo por módulo. Foram comparados todos os nós do DOM de cada tela, 23 propriedades de estilo computado e a posição/tamanho de cada elemento. Resultado: **0 diferenças** nos 9 módulos e na home, no commit do refactor. Os ajustes de mobile vieram num commit separado e só valem abaixo de 640px.
- **Fluxos:** login com senha padrão (o Manual carrega em segundo plano e abre a troca de senha), usuário comum barrado no Resultado sem baixar nada, falha de rede no JS e no template seguida de nova tentativa, clique duplo (um download só).
- **Mobile:** 375 / 768 / 1024 px sem rolagem horizontal em nenhuma tela (`ferramentas/testar-portal.js`).
