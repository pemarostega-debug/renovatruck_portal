# Resultado Semanal — implantação e operação

Módulo da reunião de segunda com a diretoria. Só administradores enxergam.

```
Genesis (MySQL)                           Google (privado)                     Portal (GitHub Pages)
vw_os_produto_serviço ──extrair-resultado-semanal.js──► Apps Script ──► Planilha ──► index.html (só papel admin)
        (cron na VPS)          chave de serviço          resultado-semanal.gs          sessão do usuário
Planilha do gerente "Serviços Finalizados" ─────────────────────────────────────────► lista de OSs finalizadas
```

**Por que assim:** custo de peça, margem e folha não podem ir para o repositório,
que é público. O extrator grava numa planilha privada e o portal só lê de lá com a
sessão de um admin — o Apps Script confere o papel no backend do Manual. A chave de
serviço do cron só consegue *gravar* itens; não lê nada.

Enquanto o backend não estiver publicado, o módulo funciona do mesmo jeito com o
arquivo "OSs detalhe" arrastado para a tela.

---

## 1. Criar a planilha e publicar o backend

1. No Google Drive da empresa, crie uma planilha nova chamada **Resultado Semanal**.
   Não compartilhe com ninguém além de quem administra o sistema.
2. Na planilha: **Extensões → Apps Script**. Apague o `Código.gs` e cole
   `apps-script/resultado-semanal.gs` inteiro. Salve.
3. Selecione a função **`instalar`** e clique em **Executar**. Autorize quando pedir.
   Ela cria as abas `Itens`, `Parametros`, `Fechamentos` e `Log`.
4. **⚙ Configurações do projeto → Propriedades do script → Adicionar**:
   `CHAVE_SERVICO` = uma chave **hexadecimal** longa. Gere com:
   ```
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
   (hexadecimal: sem `&`, que quebra o shell, e sem `l`/`1`/`O`/`0` confundíveis).
5. **Implantar → Nova implantação → App da Web**
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa** (quem protege é o token, não o Google)
6. Copie a URL que termina em `/exec`.

> Teste rápido no navegador: `<url>/exec?action=ping` deve responder `{"success":true,"versao":1}`.
> Qualquer outra ação por GET é recusada de propósito.

## 2. Ligar o portal

No `index.html`, procure `COLE_AQUI_A_URL_DO_RESULTADO_SEMANAL` e troque pela URL do
passo 1.6. Commit + push — o GitHub Pages publica sozinho.

## 3. Extrator na VPS

Na VPS Locaweb (`/root/renovatruck_portal`), que alcança o MySQL do Genesis:

1. `git pull` e `npm install` (o extrator usa `dotenv` e `mysql2`).
2. Acrescente ao `.env`:
   ```
   RS_API_URL=https://script.google.com/macros/s/AKfy.../exec
   RS_SYNC_TOKEN=<a mesma CHAVE_SERVICO>
   ```
3. Teste sem enviar (grava `integracao/resultado-semanal-sync.json`, fora do git):
   ```
   node integracao/extrair-resultado-semanal.js
   ```
   Confira no log: quantas linhas/OSs, e se apareceu "colunas ausentes". As obrigatórias
   são `numero_os`, `codigo_produto` e `PrecoCusto`.
4. Envie: `node integracao/extrair-resultado-semanal.js --enviar`
5. `crontab -e` — todo dia cedo, e de novo na segunda antes da reunião:
   ```
   50 6 * * * cd /root/renovatruck_portal && /usr/bin/node integracao/extrair-resultado-semanal.js --enviar >> /root/cron-resultado-semanal.log 2>&1
   30 7 * * 1 cd /root/renovatruck_portal && /usr/bin/node integracao/extrair-resultado-semanal.js --enviar >> /root/cron-resultado-semanal.log 2>&1
   ```

Opções úteis:

| Opção | Para quê |
|---|---|
| `--desde AAAA-MM-DD` | janela maior (padrão: 1º dia de 8 meses atrás, pela data de geração da OS) |
| `--view <nome>` | se a view mudar de nome (o script já tenta achar `vw_os_produto_servi%` sozinho) |
| `--de-arquivo integracao/resultado-semanal-sync.json` | reenviar a última extração sem consultar o banco |

## 4. Primeiro uso no portal

1. Entre como admin → **Resultado Semanal**.
2. O cartão "Peças e serviços — banco do Genesis" deve mostrar as linhas e a hora da extração.
3. Informe a **folha mensal dos produtivos** no painel de parâmetros. A base passa a
   valer para todos os admins (fica na aba `Parametros`, não no código).
4. Na reunião: escolha a semana no seletor, escreva a aposta, clique **Salvar fechamento**
   e gere o **PDF**.

---

## Decisões que valem conhecer

- **Semana = segunda a domingo.** Os dias trabalhados para a mão de obra contam
  segunda a sábado e podem ser corrigidos na tela (feriado).
- **OS finalizada** vem da planilha do gerente. OS repetida conta uma vez; OS relançada
  numa semana depois de já ter aparecido antes não é contada de novo (a tela avisa).
- **Código com "DIV"** = peça sem custo de inventário. A análise sai com e sem DIV.
- **Evolução semanal** recalcula todas as semanas com os parâmetros base *atuais*, para
  serem comparáveis. O que foi apresentado na época fica no fechamento (e a tela oferece
  "ver com os parâmetros da época").
- **Cobertura** < 95% numa semana = OSs finalizadas sem linha na view (ou fora da
  janela do extrator). A margem dessa semana é parcial.
- **Tudo em texto na planilha.** Planilha pt-BR converte `2026-09-01` em data e
  `148.72` em número errado; o backend força formato texto antes de gravar. Não edite a
  aba `Itens` à mão.
- **Arquivo arrastado vale mais que o banco** nas OSs que ele trouxer — útil para
  conferir uma correção antes de o cron rodar de novo.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Sessão inválida" no extrator | `RS_SYNC_TOKEN` diferente da `CHAVE_SERVICO` (erro de digitação) |
| "restrito a administradores" no portal | usuário com perfil Consulta — ajuste em Manual → Configurações |
| "Extração com mais de um dia" | cron não rodou: `tail /root/cron-resultado-semanal.log` |
| Cobertura baixa numa semana antiga | rodar uma vez com `--desde` mais antigo |
| Portal parou de responder após colar código | um projeto Apps Script só aceita um `doGet/doPost` — este `.gs` precisa de projeto próprio |
