# Capricho

**Disciplina de excelência para trabalho substancial.** O Capricho não faz o
Claude acertar — ele faz o Claude *caprichar*. É a diferença entre o resultado
que funciona e o resultado que faz alguém pensar "quem fez isso se importou".

## O que ele resolve

O problema não é o trabalho errado. É o trabalho **medíocre que passa**: o app
que funciona mas trava com dez vezes mais dados, a simulação correta que parece
uma tela de depuração, os cinco recursos onde três estão pela metade, o
relatório com números chutados de cabeça.

## Como instalar

1. Descompacte o arquivo `Capricho.zip`.
2. Copie a pasta `Capricho` para dentro de `.claude/skills/` do seu projeto —
   ou para `~/.claude/skills/` se quiser a skill disponível em todos os
   projetos.
3. Abra o Claude Code na pasta do projeto. Pronto.

## Como usar

Peça o trabalho normalmente e adicione qualquer um destes gatilhos:

- `/capricho`
- "capricha nisso"
- "faz bem feito"
- "qualidade máxima"
- "nível produção"

A skill também entra sozinha quando o pedido é claramente um trabalho
substancial (um app, uma simulação, um motor, um relatório) e o resultado
precisa ser excelente.

## O que acontece por dentro

1. **Regra zero** — antes da primeira linha, o Claude escreve cinco critérios
   mensuráveis que o seu pedido *não* falou e que separam excelente de
   aceitável (escala 10×, fluidez em número, estética intencional, robustez de
   borda, prova).
2. **Fundar** — escolhe estrutura de dados e algoritmo já contra a barra de
   10×, com estado reproduzível por semente.
3. **Construir completo** — nada de esqueleto, nada de TODO, nada de "o resto
   fica como exercício".
4. **Lapidar** — três passes obrigatórios: físico (números medidos, não
   impressões), estético (checklist concreto) e o passe do revisor cínico
   (mínimo cinco achados do tipo "isso é amador porque…", todos corrigidos).
5. **Provar** — um harness executável que roda de verdade e cola a saída real.
   Número que não foi medido é rotulado "não medido", nunca estimado.
6. **Manifesto de entrega** — confere no disco, um a um, todos os artefatos
   pedidos antes de dizer que terminou.

## Proporcionalidade

Tarefa pequena continua pequena. Ajuste de uma linha, pergunta rápida, edição
curta: o Claude faz com cuidado e entrega — sem barra, sem passes, sem
cerimônia. A disciplina existe para o resultado, nunca para o ritual.

## Origem

Nasceu de um teste controlado de 26 execuções contra a skill `unlazy`: herda o
que mediu bem (prova executável, passe de especialista) e corta o que só
queimou tempo (reescrever o enunciado em checkboxes).

---

Feito pelo **Maestros da IA Lab** · Licença MIT · versão 1.2.0
