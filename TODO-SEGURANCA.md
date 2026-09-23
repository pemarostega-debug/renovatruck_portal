# ✅ TODO — Configuração de Segurança

Siga este checklist para completar a segurança do projeto.

---

## 🚀 Configuração Local (Sua máquina)

### Passo 1: Instalar dependências
```bash
cd renovatruck_portal
npm install
```
- [ ] npm install executado com sucesso
- [ ] Arquivo `package-lock.json` atualizado

### Passo 2: Verificar arquivo `.env`
```bash
# O arquivo .env já foi criado e está em .gitignore
# Verifique se as credenciais reais estão lá:
cat .env | grep DB_
```
- [ ] `.env` existe na raiz do projeto
- [ ] Variáveis `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` preenchidas
- [ ] `.env` está em `.gitignore` (verificar com: `git status`)

### Passo 3: Testar conexão com banco
```bash
npm run test-db
```
Esperado:
```
✅ Conexão estabelecida com sucesso!
✅ Consulta executada. X registro(s) retornado(s):
```
- [ ] Conexão com banco bem-sucedida
- [ ] Dados retornados corretamente

### Passo 4: Testar exportação
```bash
npm run export
```
Esperado:
```
Conectado ao banco.
X registro(s) exportado(s) — Y KB.
```
- [ ] Exportação de dados bem-sucedida
- [ ] Arquivo `dados.json` criado

---

## 🖥️ Configuração na VPS

### Passo 1: Upload do `.env`
```bash
# Na VPS, copie o .env do seu PC
scp renovatruck_portal/.env usuario@vps:/home/usuario/renova/.env
```
- [ ] Arquivo `.env` enviado para VPS
- [ ] Permissões configuradas (chmod 600 .env)

### Passo 2: Testar scripts na VPS
```bash
# SSH para VPS
ssh usuario@vps
cd /home/usuario/renova/renovatruck_portal

# Testar exportação
npm run export

# Testar contas a pagar (sem enviar)
node integracao/extrair-contas-pagar.js --desde 2026-09-01
```
- [ ] Scripts rodam sem erro na VPS
- [ ] Conexão com banco funciona da VPS

### Passo 3: Configurar cron job
```bash
# Editar crontab
crontab -e

# Adicione as linhas abaixo (ajuste caminhos e horários):
SYNC_API_URL="https://script.google.com/macros/s/SEU_ID/exec"
SYNC_TOKEN="seu_token_servico"

# Exportar dados para GitHub Pages (diário, 6h da manhã)
0 6 * * * cd /home/usuario/renova/renovatruck_portal && npm run export >> /var/log/renova-export.log 2>&1

# Sincronizar contas a pagar (2x/semana, 8h e 16h)
0 8,16 * * 1,4 cd /home/usuario/renova/renovatruck_portal && node integracao/extrair-contas-pagar.js --enviar >> /var/log/renova-sync-cp.log 2>&1

# Sincronizar contas a receber (2x/semana, 9h e 17h)
0 9,17 * * 1,4 cd /home/usuario/renova/renovatruck_portal && node integracao/extrair-contas-receber.js --enviar >> /var/log/renova-sync-cr.log 2>&1
```
- [ ] Variáveis de ambiente `SYNC_*` configuradas no crontab
- [ ] Cron jobs adicionados
- [ ] Permissões de leitura do `.env` configuradas (600)

### Passo 4: Testar cron
```bash
# Esperar a próxima execução ou testar manualmente
cd /home/usuario/renova/renovatruck_portal
node integracao/extrair-contas-pagar.js --enviar

# Verificar logs
tail -f /var/log/renova-sync-cp.log
```
- [ ] Cron executa sem erros
- [ ] Logs mostram sucesso

---

## 🔒 Validação de Segurança

### Verificar que credenciais não foram commitadas
```bash
# Na sua máquina
git log --all --full-history -- "**/config.local.json" "**/teste-conexao.js"
git log --all --grep="password" --oneline
git log --all --oneline | grep -i "credencial\|secret\|password"
```
- [ ] Nenhum commit encontrado com credenciais
- [ ] Se houver, contatar DevOps para rotação de senhas

### Verificar que `.env` não está versionado
```bash
git ls-files | grep -E "\.env|config\.local\.json"
```
Resultado esperado: (vazio, sem matches)
- [ ] `.env` não está no repositório
- [ ] `config.local.json` não está no repositório

### Verificar `.gitignore`
```bash
cat .gitignore | grep -E "\.env|config\.local"
```
Resultado esperado:
```
.env
config.local.json
```
- [ ] `.env` está em `.gitignore`
- [ ] `config.local.json` está em `.gitignore`

---

## 📚 Documentação

- [x] **SETUP-ENV.md** — Como configurar `.env` (leia se tiver dúvidas)
- [x] **SECURITY-AUDIT.md** — Detalhes técnicos da migração
- [x] **.env.example** — Template comentado

---

## 🆘 Troubleshooting

### Erro: "Falta configurar as variáveis de ambiente"
```
Solução: Verifique se .env existe e execute npm install
```

### Erro: "ECONNREFUSED" ou "ETIMEDOUT"
```
Solução: Verifique DB_HOST e se você está na VPN/rede do escritório
```

### Erro: "ER_ACCESS_DENIED_ERROR"
```
Solução: Verifique DB_USER e DB_PASSWORD no .env
```

### Scripts não pegam `SYNC_TOKEN` da VPS
```
Solução: Adicione as variáveis no crontab ANTES do comando
```

---

## ⏰ Timeline Recomendada

| Data | Tarefa |
|------|--------|
| **Hoje** | Passo 1-4 (sua máquina) |
| **Próxima semana** | Passos 1-4 (VPS) + validar cron |
| **01/03/2027** | Revisão anual de segurança |
| **A cada 90 dias** | Rotação de senha do BD (opcional) |

---

## 👥 Contatos

- **Dúvidas de configuração:** Consulte SETUP-ENV.md
- **Problemas de segurança:** Abra uma issue no repositório interno
- **Acesso à VPS:** Administrador do servidor

---

**Última atualização:** 15/09/2026  
**Status:** 🟡 Pendente conclusão dos passos acima
