/* ============================================================
   app.js — Lógica principal do Catálogo de Ofertas
   Depende de: js/config.js (carregado antes no index.html)

   Fluxo:
   1. Verifica sessão no localStorage
   2. Se não autenticado → tela de senha (hash SHA-256 client-side)
   3. Se autenticado → busca dados via Google Sheets (gviz)
   4. Constrói hierarquia VSL > filhos
   5. Renderiza cards com accordion + filtros
   ============================================================ */


/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
let dadosBrutos  = [];  // Linhas da planilha processadas
let arvoreDados  = [];  // VSLs com seus filhos aninhados
let filtrosAtivos = { busca: '', nicho: '', trafego: '' };


/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (estaAutenticado()) {
    mostrarConteudo();
    carregarDados();
  } else {
    mostrarTelaSenha();
  }

  configurarFormSenha();
  configurarFiltros();
  configurarBotaoSair();
});


/* ============================================================
   AUTENTICAÇÃO
   Usa SHA-256 (Web Crypto API nativa) para comparar a senha
   sem enviar nada para um servidor.

   Migração futura para login individual:
   - Trocar hashSenha() + comparação por chamada a uma API de auth
   - O restante do fluxo (salvarSessao, mostrarConteudo) fica igual
   ============================================================ */

function estaAutenticado() {
  try {
    const sessao = JSON.parse(localStorage.getItem(CONFIG.AUTH_STORAGE_KEY));
    if (!sessao?.expiry) return false;
    if (Date.now() > sessao.expiry) {
      localStorage.removeItem(CONFIG.AUTH_STORAGE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function salvarSessao() {
  localStorage.setItem(CONFIG.AUTH_STORAGE_KEY, JSON.stringify({
    autenticado: true,
    expiry: Date.now() + CONFIG.AUTH_DURATION_MS,
  }));
}

function encerrarSessao() {
  localStorage.removeItem(CONFIG.AUTH_STORAGE_KEY);
  document.getElementById('offers-container').innerHTML = '';
  document.getElementById('results-count').classList.add('hidden');
  mostrarTelaSenha();
}

/** Gera o hash SHA-256 de uma string usando a Web Crypto API (nativa no browser) */
async function hashSenha(senha) {
  const encoded = new TextEncoder().encode(senha);
  const buffer  = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function mostrarTelaSenha() {
  document.getElementById('password-screen').classList.remove('hidden');
  document.getElementById('main-content').classList.add('hidden');
  setTimeout(() => document.getElementById('password-input')?.focus(), 80);
}

function mostrarConteudo() {
  document.getElementById('password-screen').classList.add('hidden');
  document.getElementById('main-content').classList.remove('hidden');
}

function configurarFormSenha() {
  const form  = document.getElementById('password-form');
  const input = document.getElementById('password-input');
  const erro  = document.getElementById('password-error');
  const btn   = document.getElementById('password-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const senha = input.value;
    if (!senha) return;

    btn.disabled    = true;
    btn.textContent = 'Verificando...';
    erro.classList.add('hidden');

    const hash = await hashSenha(senha);

    if (hash === CONFIG.PASSWORD_HASH) {
      salvarSessao();
      mostrarConteudo();
      carregarDados();
    } else {
      erro.classList.remove('hidden');
      input.value = '';
      input.focus();
      btn.disabled    = false;
      btn.textContent = 'Entrar';
    }
  });
}

function configurarBotaoSair() {
  document.getElementById('logout-btn')?.addEventListener('click', encerrarSessao);
}


/* ============================================================
   BUSCA DE DADOS — Google Sheets via gviz (sem API Key)
   Requer que a planilha esteja compartilhada como
   "Qualquer pessoa com o link pode visualizar".
   ============================================================ */

async function carregarDados() {
  mostrarSkeletons();

  // Monta a URL do endpoint gviz do Google Sheets
  const url = new URL(
    `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq`
  );
  url.searchParams.set('tqx', 'out:json');
  if (CONFIG.SHEET_GID) {
    url.searchParams.set('gid', CONFIG.SHEET_GID);
  }

  try {
    const res  = await fetch(url.toString());
    const texto = await res.text();

    dadosBrutos = parsearGviz(texto);
    arvoreDados = construirArvore(dadosBrutos);

    popularDropdownsFiltros(dadosBrutos);
    renderizarOfertas(arvoreDados);
    atualizarContagem(arvoreDados.length);

  } catch (err) {
    console.error('[Catálogo] Erro ao carregar dados:', err);
    mostrarErroCarregamento();
  }
}

/**
 * Interpreta a resposta JSONP do Google Sheets (gviz).
 * O Google retorna: /*O_o*\/\ngoogle.visualization.Query.setResponse({...});
 *
 * Colunas esperadas por índice (conforme a planilha):
 *   0: Nome da Oferta
 *   1: Nicho
 *   2: Valor Investido (7d)
 *   3: CPA
 *   4: Fonte de Tráfego
 *   5: Data de Atualização
 *   6: Link da Pasta
 *   7: Nível
 *   8: Oferta Pai
 */
function parsearGviz(texto) {
  // Remove o wrapper JSONP para extrair o JSON puro
  const match = texto.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)\s*;?\s*$/);
  if (!match) throw new Error('Resposta inesperada do Google Sheets');

  const data = JSON.parse(match[1]);

  if (data.status === 'error') {
    const msg = data.errors?.[0]?.detailed_message || 'Erro desconhecido na planilha';
    throw new Error(msg);
  }

  const { rows } = data.table;
  if (!rows || rows.length === 0) return [];

  return rows
    .map(row => {
      // Cada célula tem .v (valor raw) e .f (valor formatado)
      // Usamos .f quando disponível (preserva formatação da planilha),
      // fallback para .v
      const cel = (i) => {
        const c = row.c?.[i];
        if (!c) return '';
        // Para datas o gviz retorna um objeto Date — usa .f
        if (c.f !== null && c.f !== undefined) return String(c.f);
        if (c.v !== null && c.v !== undefined) return String(c.v);
        return '';
      };

      return {
        nome:            cel(0).trim(),
        nicho:           cel(1).trim(),
        valorInvestido:  cel(2).trim(),
        cpa:             cel(3).trim(),
        fonteTrafico:    cel(4).trim(),
        dataAtualizacao: cel(5).trim(),
        linkPasta:       cel(6).trim(),
        nivel:           cel(7).trim(),
        ofertaPai:       cel(8).trim(),
      };
    })
    .filter(row => row.nome && row.nivel); // Ignora linhas vazias
}


/* ============================================================
   HIERARQUIA: VSL → filhos
   ============================================================ */

function construirArvore(dados) {
  const vsls   = dados.filter(r => r.nivel === 'VSL');
  const filhos = dados.filter(r => r.nivel !== 'VSL');

  return vsls.map(vsl => ({
    ...vsl,
    filhos: filhos.filter(
      f => f.ofertaPai.toLowerCase() === vsl.nome.toLowerCase()
    ),
  }));
}


/* ============================================================
   FILTROS
   ============================================================ */

function popularDropdownsFiltros(dados) {
  const nichos   = [...new Set(dados.map(d => d.nicho).filter(Boolean))].sort();
  const trafegos = [...new Set(dados.map(d => d.fonteTrafico).filter(Boolean))].sort();

  const selectNicho   = document.getElementById('filter-nicho');
  const selectTrafego = document.getElementById('filter-trafego');

  // Limpa opções antigas (mantém a primeira "Todos...")
  while (selectNicho.options.length > 1)   selectNicho.remove(1);
  while (selectTrafego.options.length > 1) selectTrafego.remove(1);

  nichos.forEach(n => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = n;
    selectNicho.appendChild(opt);
  });

  trafegos.forEach(t => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = t;
    selectTrafego.appendChild(opt);
  });
}

function configurarFiltros() {
  const busca   = document.getElementById('search-input');
  const nicho   = document.getElementById('filter-nicho');
  const trafego = document.getElementById('filter-trafego');
  const limpar  = document.getElementById('clear-filters');

  busca.addEventListener('input',   e => { filtrosAtivos.busca   = e.target.value.toLowerCase().trim(); aplicarFiltros(); });
  nicho.addEventListener('change',  e => { filtrosAtivos.nicho   = e.target.value; aplicarFiltros(); });
  trafego.addEventListener('change',e => { filtrosAtivos.trafego = e.target.value; aplicarFiltros(); });

  limpar.addEventListener('click', () => {
    filtrosAtivos = { busca: '', nicho: '', trafego: '' };
    busca.value = nicho.value = trafego.value = '';
    aplicarFiltros();
  });
}

function aplicarFiltros() {
  const { busca, nicho, trafego } = filtrosAtivos;

  const resultado = arvoreDados.filter(vsl => {
    const matchBusca   = !busca   || vsl.nome.toLowerCase().includes(busca)   || vsl.filhos.some(f => f.nome.toLowerCase().includes(busca));
    const matchNicho   = !nicho   || vsl.nicho === nicho;
    const matchTrafego = !trafego || vsl.fonteTrafico === trafego || vsl.filhos.some(f => f.fonteTrafico === trafego);
    return matchBusca && matchNicho && matchTrafego;
  });

  renderizarOfertas(resultado);
  atualizarContagem(resultado.length);
}


/* ============================================================
   RENDERIZAÇÃO
   ============================================================ */

function renderizarOfertas(arvore) {
  const container = document.getElementById('offers-container');
  container.innerHTML = '';

  if (arvore.length === 0) {
    container.innerHTML = `
      <div class="empty-state" role="status">
        <p>Nenhuma oferta encontrada</p>
        <span>Tente ajustar ou limpar os filtros.</span>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  arvore.forEach(vsl => frag.appendChild(criarCardVSL(vsl)));
  container.appendChild(frag);
}

function criarCardVSL(vsl) {
  const card = document.createElement('div');
  card.className = 'vsl-card';

  card.innerHTML = `
    <div class="vsl-header" role="button" aria-expanded="false" tabindex="0">
      <div class="vsl-header-left">
        <span class="nivel-badge nivel-vsl">VSL</span>
        <div class="vsl-title-group">
          <span class="offer-name">${esc(vsl.nome)}</span>
          ${vsl.nicho ? `<span class="nicho-badge">${esc(vsl.nicho)}</span>` : ''}
        </div>
      </div>
      <div class="vsl-header-right">
        <div class="header-stats">
          <div class="h-stat">
            <span class="h-stat-label">Investido 7d</span>
            <span class="h-stat-value">${fmtValor(vsl.valorInvestido)}</span>
          </div>
          <div class="h-stat">
            <span class="h-stat-label">CPA</span>
            <span class="h-stat-value">${fmtValor(vsl.cpa)}</span>
          </div>
        </div>
        <span class="children-count">${vsl.filhos.length} ativo${vsl.filhos.length !== 1 ? 's' : ''}</span>
        <svg class="accordion-arrow" xmlns="http://www.w3.org/2000/svg" fill="none"
             viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </div>
    </div>

    <div class="vsl-body hidden">
      <div class="vsl-own-details">
        ${htmlDetalhes(vsl)}
      </div>
      <div class="vsl-children">
        <p class="children-title">Ativos vinculados</p>
        ${vsl.filhos.length
          ? vsl.filhos.map(f => htmlSubCard(f)).join('')
          : '<p class="no-children">Nenhum ativo cadastrado para esta oferta.</p>'
        }
      </div>
    </div>`;

  const header = card.querySelector('.vsl-header');
  const body   = card.querySelector('.vsl-body');

  const toggle = () => {
    const aberto = card.classList.toggle('open');
    header.setAttribute('aria-expanded', String(aberto));
    body.classList.toggle('hidden', !aberto);
  };

  header.addEventListener('click', toggle);
  header.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

  return card;
}

function htmlSubCard(filho) {
  const nivelClass = `nivel-${filho.nivel.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  return `
    <div class="sub-card">
      <div class="sub-card-header">
        <span class="nivel-badge ${nivelClass}">${esc(filho.nivel)}</span>
        <span class="offer-name">${esc(filho.nome)}</span>
        ${filho.nicho ? `<span class="nicho-badge">${esc(filho.nicho)}</span>` : ''}
      </div>
      ${htmlDetalhes(filho)}
    </div>`;
}

function htmlDetalhes(oferta) {
  const btnPasta = oferta.linkPasta
    ? `<a href="${safeUrl(oferta.linkPasta)}" target="_blank" rel="noopener noreferrer" class="btn-pasta">
         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">
           <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>
         </svg>
         Acessar Pasta
       </a>`
    : '';

  return `
    <div class="card-details">
      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">Valor Investido (7d)</span>
          <span class="detail-value">${fmtValor(oferta.valorInvestido)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">CPA</span>
          <span class="detail-value">${fmtValor(oferta.cpa)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Fonte de Tráfego</span>
          <span class="detail-value">${esc(oferta.fonteTrafico) || '—'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Atualizado em</span>
          <span class="detail-value">${esc(oferta.dataAtualizacao) || '—'}</span>
        </div>
      </div>
      ${btnPasta}
    </div>`;
}


/* ============================================================
   ESTADOS DE UI
   ============================================================ */

function mostrarSkeletons() {
  document.getElementById('offers-container').innerHTML = Array(5).fill(`
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton-header">
        <div class="skeleton sk-badge"></div>
        <div class="skeleton sk-title"></div>
      </div>
      <div class="skeleton sk-text"></div>
      <div class="skeleton sk-text sk-short"></div>
      <div class="skeleton sk-text sk-xshort" style="margin-top:14px"></div>
    </div>`).join('');
}

function mostrarErroCarregamento() {
  document.getElementById('offers-container').innerHTML = `
    <div class="error-state" role="alert">
      <p>Não foi possível carregar os dados</p>
      <span>Verifique sua conexão ou se a planilha está compartilhada corretamente.</span><br>
      <button class="btn-retry" onclick="carregarDados()">Tentar novamente</button>
    </div>`;
}

function atualizarContagem(total) {
  const el = document.getElementById('results-count');
  el.textContent = `${total} oferta${total !== 1 ? 's' : ''} encontrada${total !== 1 ? 's' : ''}`;
  el.classList.remove('hidden');
}


/* ============================================================
   UTILITÁRIOS
   ============================================================ */

/** Escapa HTML para evitar XSS */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Permite apenas URLs http/https */
function safeUrl(url) {
  try {
    const p = new URL(url);
    return (p.protocol === 'http:' || p.protocol === 'https:') ? url : '#';
  } catch { return '#'; }
}

/** Retorna o valor formatado ou '—' se vazio */
function fmtValor(v) {
  return (v && v.trim()) ? esc(v) : '—';
}
