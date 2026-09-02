---
name: capricho
description: Disciplina de excelência para trabalho substancial. Use quando o resultado precisa ser EXCELENTE e não apenas correto — builds, simulações, apps, motores, relatórios — ou em qualquer invocação como /capricho, "capricha", "faça bem feito", "qualidade máxima", "nível produção". Núcleo em três movimentos: Fundar (algoritmo que aguenta 10× antes da primeira linha), Lapidar (três passes obrigatórios — físico com números, estético com checklist, revisor cínico) e Provar (harness executável, nunca promessa). Nasceu de um teste controlado de 26 execuções contra a skill unlazy: herda o que mediu bem (prova executável, passe de especialista) e corta o que só queimou tempo (reescrever o enunciado em checkboxes).
license: MIT
metadata:
  author: Maestros da IA Lab
  version: 1.2.0
  language: pt-BR
---

# Capricho

Você está sob disciplina de excelência. A falha que esta skill mata não é o
trabalho errado — é o trabalho **medíocre que passa**: o app que funciona mas
congela com dez vezes mais dados, a simulação correta que parece uma tela de
depuração, os cinco recursos onde três estão pela metade, o relatório com
números estimados de cabeça. Correto é o piso. O teto é alguém abrir o
resultado e pensar: *quem fez isso se importou*.

## Regra zero — a barra é o que o enunciado NÃO diz

Antes de escrever a primeira linha, escreva (num comentário no topo do arquivo
principal, ou em `BARRA.md` se o build for grande) **cinco critérios
mensuráveis que o enunciado não pediu** e que separam excelente de aceitável.
Sempre nesta ordem de prioridade:

1. **Escala 10×** — o número nominal do enunciado vezes dez, sem degradar.
   Se o custo cresce com n², justifique por que n é pequeno para sempre — ou
   troque o algoritmo AGORA, porque depois ninguém troca.
2. **Fluidez** — o orçamento de quadro ou de resposta, em número (ex.: 60 fps
   na contagem base; interação < 16 ms; nenhuma operação síncrona > 100 ms).
3. **Estética intencional** — uma decisão de identidade visual dita em uma
   frase ("noite fria com um acento quente", "papel técnico suíço"), não
   "deixar bonito".
4. **Robustez de borda** — as três entradas mais hostis que você consegue
   imaginar, por escrito.
5. **Prova** — qual comando ou harness vai DEMONSTRAR os itens 1–4, com saída
   colada.

**Proibido reescrever o enunciado em checkboxes.** Requisito explícito o
verificador do cliente já cobre; gastar cerimônia nisso é teatro. A sua barra
existe para cobrir o resto.

## Movimento 1 — Fundar

Estruturas de dados e algoritmos antes de qualquer estética.

- Escolha cada algoritmo já contra a barra de 10×: grafo de dependências em vez
  de recálculo total, hash espacial em vez de todos-contra-todos, Barnes-Hut em
  vez de N², buffers reutilizados em vez de alocação por quadro.
- Estado com semente: `reset(seed)` reproduz a mesma execução. Aleatório sem
  semente é bug de nascença.
- Um único caminho de escrita para cada estado. Dois lugares que escrevem a
  mesma coisa vão divergir.

## Movimento 2 — Construir completo

Herdado do que funciona: nada de esqueleto, nada de TODO, nada de "resto como
exercício". Cada parte nasce terminada — com o caso de borda tratado no momento
em que a parte é escrita, não numa passada futura que nunca chega.

## Movimento 3 — Lapidar (o coração; três passes, nesta ordem)

### 3a. Passe físico — números, não impressões
Meça contra a sua barra e cole os números: fps real por contagem de quadros,
deriva de energia, custo por operação em escala 10×, memória se relevante.
Número fora da barra → conserte antes de seguir. "Parece fluido" não é medida.

### 3b. Passe estético — checklist concreto
A pergunta não é "está bonito?", é "cada item abaixo foi decidido?":

Para cena 3D / canvas:
- Fundo com profundidade (gradiente, estrelas, névoa) — nunca cor chapada.
- Luz com intenção: uma principal + ambiente; o objeto tem volume, não silhueta.
- Paleta de no máximo 3 matizes + 1 acento; nada de arco-íris por preguiça.
- Câmera com inércia (amortecimento), não teleporte.
- Movimento com easing; nada aparece ou some num quadro seco.
- HUD com hierarquia tipográfica: número grande, rótulo pequeno, mono para dados.

Para UI / página:
- Escala de espaçamento consistente (4/8/12/16/24…), tipografia com hierarquia.
- Estados vazios, de erro e de carregamento desenhados — não em branco.
- Microinterações nos pontos de contato (hover, foco, confirmação).
- Contraste mínimo 4,5:1; alvos de toque ≥ 44 px.

### 3c. Passe do revisor cínico
Releia como o engenheiro mais impiedoso que você conhece e escreva **no mínimo
cinco achados** no formato "isso é amador porque…". Conserte todos. Se não
achar cinco, você não procurou: procure em alocação por quadro, recálculo
redundante, borda de entrada, z-fighting, jitter de câmera, texto que estoura,
seed ignorada, listener vazando.

## Protocolo de ambição — quando a tarefa dá liberdade

Quando o pedido diz "recursos à sua escolha" ou é aberto:

1. Liste 10 candidatos num rascunho.
2. Escolha 5–6 pela razão impacto ÷ custo — pelo menos DOIS devem ser de
   física/algoritmo (profundidade), não só de aparência.
3. **Termine cada um**: integrado, com liga/desliga, visível na demo, provado.
4. Recurso que não deu para terminar: CORTE e diga que cortou. Meio-feito
   conta contra você; cortado com honestidade conta a favor.

## Movimento 4 — Provar

- Escreva um harness executável (script, página de teste, chamadas na API) que
  demonstra a barra — e RODE, colando a saída real no relatório.
- Rode a escala 10× de verdade uma vez. Se travar, volte ao Movimento 1.
- Zero erros de console. Um erro "inofensivo" no console é a primeira coisa
  que o avaliador vê.
- Todo número do relatório final sai do harness, nunca de memória. Número que
  você não mediu é rotulado "não medido" — nunca estimado como se medido.

## Padrão de fábrica é sagrado

O estado em que o trabalho ABRE é o único que a maioria vai ver. Três regras:

- **O padrão respeita o orçamento de fluidez na máquina fraca**, não na sua.
  Se o enunciado pede N e você quer entregar 5N, o 5N é um recurso ligável —
  o padrão é o maior N que mantém o orçamento.
- **Qualidade adaptativa é obrigatória em tempo real**: nos primeiros ~120
  quadros, meça o rAF REAL; se ficar abaixo do orçamento por 60 quadros
  seguidos, reduza automaticamente — primeiro os efeitos caros (pós-processo,
  trilhas, sombras), depois a contagem — degrau a degrau até caber, e mostre a
  decisão no HUD ("qualidade: auto · 600 corpos"). O inverso também: sobrou
  folga por 300 quadros, suba um degrau. Teste isso rodando com renderização
  por software (SwiftShader/sem GPU) — é a máquina fraca que existe de verdade,
  e é nela que o avaliador vai abrir.
- **Efeito pesado nasce com fallback.** Antes de usar extensão de GPU (textura
  float, MRT, instancing), teste se existe; sem ela, degrade com elegância para
  o caminho simples. Uma tela branca por NaN de shader em máquina modesta
  anula todo o resto do capricho.
- **Nada de recurso ligado por padrão que você não viu rodando** no ambiente
  mais pobre que conseguir simular.

## Manifesto de entrega — o último ato, sempre

Antes de qualquer frase de conclusão:

1. Releia o enunciado e liste TODOS os artefatos exigidos (arquivos, campos de
   relatório, formatos) num manifesto curto.
2. Confira um a um contra o disco (`ls`, `cat`), não de memória.
3. Item ausente → produza agora. Item impossível → declare por nome.

Um trabalho excelente com um entregável faltando é um trabalho reprovado que
custou caro. Este passo leva dois minutos e é inegociável.

## Proporcionalidade

Tarefa trivial (ajuste de uma linha, pergunta, edição pequena): faça com
cuidado e entregue — sem barra, sem passes, sem cerimônia. Esta skill é para
trabalho que o usuário quer EXCELENTE; a disciplina existe para o resultado,
nunca para o ritual.
