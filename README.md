# Catálogo de Ofertas para Afiliados

Site para consulta de ofertas e ativos de marketing, com dados sincronizados automaticamente via Google Sheets.

---

## Índice

1. [Estrutura da Planilha](#1-estrutura-da-planilha)
2. [Configurando o Google Sheets](#2-configurando-o-google-sheets)
3. [Obtendo a API Key do Google](#3-obtendo-a-api-key-do-google)
4. [Deploy no Vercel (passo a passo)](#4-deploy-no-vercel-passo-a-passo)
5. [Variáveis de ambiente](#5-variáveis-de-ambiente)
6. [Como trocar a senha de acesso](#6-como-trocar-a-senha-de-acesso)
7. [Como rodar localmente](#7-como-rodar-localmente)
8. [Estrutura de arquivos](#8-estrutura-de-arquivos)

---

## 1. Estrutura da Planilha

A planilha deve ter **exatamente 9 colunas**, nesta ordem:

| Coluna | Nome do cabeçalho       | Exemplo                          | Obrigatório |
|--------|-------------------------|----------------------------------|-------------|
| A      | Nome da Oferta          | VSL Emagrecimento Pro            | Sim         |
| B      | Nicho                   | Saúde                            | Sim         |
| C      | Valor Investido (7d)    | R$ 4.200                         | Não         |
| D      | CPA                     | R$ 42,00                         | Não         |
| E      | Fonte de Tráfego        | Facebook                         | Não         |
| F      | Data de Atualização     | 20/03/2025                       | Não         |
| G      | Link da Pasta           | https://drive.google.com/...     | Não         |
| H      | Nível                   | VSL *(ver valores abaixo)*       | Sim         |
| I      | Oferta Pai              | VSL Emagrecimento Pro            | Só p/ filhos|

### Valores válidos para "Nível" (coluna H):

- `VSL` — Oferta principal. Aparece como card principal no site.
- `Microlead/Lead` — Ativo complementar vinculado a uma VSL.
- `Ads` — Anúncio vinculado a uma VSL.

### Como funciona a hierarquia:

- Cada **VSL** é um card expansível.
- **Microleads, Leads e Ads** ficam "dentro" de uma VSL, vinculados pelo campo **Oferta Pai**.
- O campo **Oferta Pai** (coluna I) deve conter o **nome exato** da VSL à qual pertence (comparação ignora maiúsculas/minúsculas).

### Exemplo de preenchimento:

| Nome da Oferta        | Nicho  | Valor 7d  | CPA     | Fonte    | Data       | Link                  | Nível          | Oferta Pai            |
|-----------------------|--------|-----------|---------|----------|------------|-----------------------|----------------|-----------------------|
| VSL Emagrece Já       | Saúde  | R$ 8.000  | R$ 38   | Facebook | 20/03/2025 | https://drive.g.../1  | VSL            |                       |
| Microlead Queima Fat  | Saúde  | R$ 1.200  | R$ 15   | Facebook | 20/03/2025 | https://drive.g.../2  | Microlead/Lead | VSL Emagrece Já       |
| Lead Saúde Total      | Saúde  | R$ 800    | R$ 22   | Google   | 19/03/2025 | https://drive.g.../3  | Microlead/Lead | VSL Emagrece Já       |
| Ad Carrossel 1        | Saúde  | R$ 2.000  | R$ 40   | Facebook | 18/03/2025 | https://drive.g.../4  | Ads            | VSL Emagrece Já       |

> **Importante:** A primeira linha deve ser o cabeçalho (os nomes das colunas). Os dados começam na linha 2.

---

## 2. Configurando o Google Sheets

### Passo 1 — Crie ou abra sua planilha

Acesse [sheets.google.com](https://sheets.google.com) e crie uma planilha nova ou use uma existente.

### Passo 2 — Monte as colunas

Crie os cabeçalhos na linha 1, **exatamente** como na tabela acima (a ordem das colunas é obrigatória; os nomes são apenas para referência humana).

### Passo 3 — Torne a planilha pública (leitura)

1. Clique em **Compartilhar** (canto superior direito)
2. Em "Acesso geral", selecione **"Qualquer pessoa com o link"**
3. Defina a permissão como **"Leitor"**
4. Clique em **Concluído**

### Passo 4 — Copie o ID da planilha

Na URL da planilha:
```
https://docs.google.com/spreadsheets/d/[ESTE-É-O-SEU-SHEET-ID]/edit
```
Copie o trecho entre `/d/` e `/edit`. Você vai precisar dele na configuração.

---

## 3. Obtendo a API Key do Google

A API Key permite que o servidor leia a planilha. **Não é necessária autenticação de usuário.**

### Passo a passo:

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um projeto novo (ou use um existente)
3. No menu lateral, vá em **"APIs e serviços" → "Biblioteca"**
4. Pesquise por **"Google Sheets API"** e clique em **"Ativar"**
5. Vá em **"APIs e serviços" → "Credenciais"**
6. Clique em **"+ Criar credenciais" → "Chave de API"**
7. Copie a chave gerada

**Recomendado:** Restrinja a chave para maior segurança:
- Clique na chave recém-criada
- Em "Restrições de API", selecione **"Restringir chave"**
- Escolha **"Google Sheets API"**
- Salve

---

## 4. Deploy no Vercel (passo a passo)

### Pré-requisitos

- Conta gratuita no [Vercel](https://vercel.com)
- Conta no [GitHub](https://github.com) (ou GitLab/Bitbucket)

### Passo 1 — Suba o projeto no GitHub

1. Crie um repositório novo no GitHub (pode ser privado)
2. Faça upload de todos os arquivos deste projeto para o repositório

   Se tiver Git instalado, pela linha de comando:
   ```bash
   git init
   git add .
   git commit -m "Primeiro commit"
   git remote add origin https://github.com/seu-usuario/seu-repositorio.git
   git push -u origin main
   ```

### Passo 2 — Importe no Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login
2. Clique em **"Add New… → Project"**
3. Conecte sua conta do GitHub se ainda não conectou
4. Selecione o repositório do catálogo
5. Clique em **"Import"**

### Passo 3 — Configure as variáveis de ambiente

Antes de clicar em "Deploy", adicione as variáveis:

1. Na tela de configuração do projeto, encontre a seção **"Environment Variables"**
2. Adicione cada variável abaixo:

| Nome              | Valor                                     |
|-------------------|-------------------------------------------|
| `SITE_PASSWORD`   | A senha de acesso ao catálogo             |
| `SHEET_ID`        | O ID da sua planilha (copiado no passo 4) |
| `GOOGLE_API_KEY`  | A API Key gerada no Google Cloud          |
| `SHEET_NAME`      | Nome da aba (`Sheet1` se não mudou)       |

### Passo 4 — Deploy

1. Clique em **"Deploy"**
2. Aguarde o build (geralmente menos de 1 minuto)
3. Ao concluir, você receberá uma URL do tipo `https://seu-projeto.vercel.app`

### Atualizar após mudanças no código

Sempre que você fizer um `git push` no repositório, o Vercel irá automaticamente fazer um novo deploy.

---

## 5. Variáveis de ambiente

| Variável          | Descrição                                                    | Obrigatório |
|-------------------|--------------------------------------------------------------|-------------|
| `SITE_PASSWORD`   | Senha de acesso ao catálogo                                  | Sim         |
| `SHEET_ID`        | ID da planilha do Google Sheets                              | Sim         |
| `GOOGLE_API_KEY`  | Chave da API do Google (com Google Sheets API ativada)       | Sim         |
| `SHEET_NAME`      | Nome da aba da planilha (padrão: `Sheet1`)                   | Não         |

Para **rodar localmente**, crie um arquivo `.env.local` na raiz do projeto com essas variáveis (veja o arquivo `.env.example`).

---

## 6. Como trocar a senha de acesso

1. Acesse o painel do Vercel: [vercel.com/dashboard](https://vercel.com/dashboard)
2. Clique no seu projeto
3. Vá em **"Settings" → "Environment Variables"**
4. Localize `SITE_PASSWORD` e clique em **"Edit"**
5. Digite a nova senha e salve
6. Faça um novo deploy: vá em **"Deployments"** e clique em **"Redeploy"** no último deploy

Os afiliados que já estiverem logados serão desconectados automaticamente após 24h. Se quiser desconectar todos imediatamente, você pode trocar a chave `catalogo_auth_v1` no código (arquivo `js/app.js`, linha com `authKey`).

---

## 7. Como rodar localmente

Requisito: Node.js instalado ([nodejs.org](https://nodejs.org))

```bash
# 1. Instale o Vercel CLI
npm install -g vercel

# 2. Entre na pasta do projeto
cd caminho/para/catalogo-afiliados

# 3. Crie o arquivo de variáveis locais
cp .env.example .env.local
# Edite .env.local com seus valores reais

# 4. Rode o servidor de desenvolvimento
vercel dev
```

Acesse `http://localhost:3000` no navegador.

---

## 8. Estrutura de arquivos

```
catalogo-afiliados/
├── index.html          → Estrutura HTML da página (tela de senha + catálogo)
├── css/
│   └── style.css       → Todos os estilos (paleta, layout, responsivo, skeletons)
├── js/
│   └── app.js          → Lógica: auth, fetch de dados, filtros, renderização
├── api/
│   ├── verify-password.js  → Serverless: valida a senha de acesso
│   └── sheets.js           → Serverless: proxy para a API do Google Sheets
├── vercel.json         → Configuração de roteamento do Vercel
├── .env.example        → Modelo das variáveis de ambiente
├── .gitignore          → Arquivos ignorados pelo Git
└── README.md           → Esta documentação
```

### Fluxo dos dados

```
Usuário → index.html → js/app.js
                         │
                         ├── POST /api/verify-password → valida senha (env: SITE_PASSWORD)
                         │
                         └── GET  /api/sheets           → busca dados
                                    │
                                    └── Google Sheets API (env: SHEET_ID + GOOGLE_API_KEY)
```

---

## Futuras evoluções previstas

- **Login individual por afiliado**: substituir a senha única por autenticação com email. O fluxo no `app.js` permanece o mesmo — só o endpoint `/api/verify-password` muda.
- **Filtro por afiliado**: exibir apenas as ofertas que cada afiliado tem acesso.
- **Dashboard de métricas**: gráficos de CPA e investimento ao longo do tempo.
