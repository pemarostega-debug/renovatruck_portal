# 🔒 Configuração de Variáveis de Ambiente

Este guia explica como configurar as credenciais do projeto usando o arquivo `.env`.

## ⚠️ Segurança

- **NUNCA** commitar o arquivo `.env` no Git (está em `.gitignore`)
- O arquivo `.env` contém credenciais sensíveis
- Usar `.env.example` como template
- Manter `.env` apenas em máquinas locais e no cron da VPS

## 📋 Passo a Passo

### 1️⃣ Criar o arquivo `.env`

```bash
# Copiar o template
cp .env.example .env

# Editar com as credenciais reais
nano .env
```

### 2️⃣ Variáveis obrigatórias

```env
# Banco de Dados MySQL (Genesis)
DB_HOST=<IP_DO_SERVIDOR>
DB_PORT=<PORTA>
DB_USER=root
DB_PASSWORD=sua_senha_aqui
DB_DATABASE=sas0003
```

### 3️⃣ IDs das Planilhas do Google Sheets

Cada planilha tem um ID único que pode ser encontrado na URL:

```
https://docs.google.com/spreadsheets/d/{ID}/edit
                                        ↑
                                      Copie isto
```

**Planilhas do Portal:**
- `GS_CONTAS_PAGAR_ID` — Contas a Pagar (Apps Script)
- `GS_CONTAS_RECEBER_ID` — Contas a Receber (Apps Script)
- `GS_MANUAL_EMPRESA_ID` — Manual da Empresa / Organograma
- `GS_ORDENS_SERVICO_ID` — Ordens de Serviço
- `GS_ORDENS_FINALIZADAS_ID` — Ordens Finalizadas

### 4️⃣ Apps Script URLs

As URLs `/exec` vêm da implantação do Apps Script:

```
Extensões → Apps Script → Implantar → Gerenciar implantações
  → Copie a URL /exec completa
```

```env
APPS_SCRIPT_CONTAS_PAGAR_URL=https://script.google.com/macros/s/AKfycbw.../exec
APPS_SCRIPT_CONTAS_RECEBER_URL=https://script.google.com/macros/s/AKfycbw.../exec
APPS_SCRIPT_MANUAL_EMPRESA_URL=https://script.google.com/macros/s/AKfycbw.../exec
```

### 5️⃣ Integração com VPS (Cron)

Para o cron job na VPS usar automaticamente:

```env
SYNC_API_URL=https://script.google.com/macros/s/AKfycbw.../exec
SYNC_TOKEN=seu_token_servico_aqui
```

O token de serviço é obtido da conta de serviço do Apps Script (diferente da sessão do navegador).

## 🚀 Usando os Scripts

### Banco de Dados

```bash
# Testar conexão
npm run test-db

# Exportar dados de OS
npm run export
```

### Integração com Genesis

```bash
# Contas a Pagar (com token da sessão)
node integracao/extrair-contas-pagar.js --enviar --api <url> --token <RV.token>

# Ou com token de serviço (no cron)
SYNC_API_URL=... SYNC_TOKEN=... node integracao/extrair-contas-pagar.js --enviar

# Contas a Receber
node integracao/extrair-contas-receber.js --enviar --api <url> --token <RV.token>

# Migração da planilha antiga
node integracao/migrar-planilha.js "caminho/arquivo.xlsx" --enviar --token <RV.token>
```

## 📁 Estrutura de Arquivos

```
renovatruck_portal/
├── .env                    ← NUNCA commitar (credenciais reais)
├── .env.example            ← Template (commitar no Git)
├── .gitignore              ← Já ignora .env
├── package.json            ← Inclui dotenv
├── teste-conexao.js        ← Lê de .env
├── exportar-dados.js       ← Lê de .env
└── integracao/
    ├── extrair-contas-pagar.js      ← Lê de ../.env
    ├── extrair-contas-receber.js    ← Lê de ../.env
    └── migrar-planilha.js           ← Lê de ../.env
```

## ✅ Checklist de Segurança

- [ ] Arquivo `.env` criado
- [ ] Credenciais do banco preenchidas
- [ ] IDs das planilhas verificados (URL do Google Sheets)
- [ ] Apps Script URLs obtidas e preenchidas
- [ ] Token de serviço configurado na VPS
- [ ] `.env` está em `.gitignore`
- [ ] Arquivo `.env` não foi commitado no Git
- [ ] Cron da VPS configurado com `SYNC_*` no comando

## 🐛 Troubleshooting

### "Falta configurar as variáveis de ambiente"

```
→ Verifique se .env existe na raiz do projeto
→ npm install dotenv
```

### "Falha ao conectar" (timeout)

```
→ Verifique DB_HOST e DB_PORT estão corretos
→ Confirme que está na rede do escritório / VPN
→ Ping <IP_DO_SERVIDOR>:<PORTA>
```

### Apps Script retorna erro 404

```
→ Verifique que APPS_SCRIPT_*_URL está correta
→ Confirme que a implantação está "Publicada"
→ Teste a URL no navegador (deve pedir autenticação)
```

---

**Última atualização:** 15/09/2026  
**Responsável:** Configuração automatizada com dotenv
