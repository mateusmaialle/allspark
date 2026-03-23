/* ============================================================
   app.js — Catálogo de Ofertas XMX
   Depende de: js/config.js (carregado antes no index.html)

   Estrutura atual da planilha (colunas A–F):
     A: Oferta (nome)
     B: Nicho
     C: Valor Gasto (7d)
     D: CPA
     E: Fonte
     F: Link VSL
   ============================================================ */


/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
let dadosBrutos  = [];
let filtrosAtivos = { busca: '', nicho: '', fonte: '' };


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
   Usa SHA-256 nativo do browser (Web Crypto API).
   Para migrar para login individual: substituir a comparação
   de hash por uma chamada a uma API de auth — o fluxo
   (salvarSessao → mostrarConteudo → carregarDados) permanece igual.
   ============================================================ */

function estaAutenticado() {
  try {
    const s = JSON.parse(localStorage.getItem(CONFIG.AUTH_STORAGE_KEY));
    if (!s?.expiry) return false;
    if (Date.now() > s.expiry) { localStorage.removeItem(CONFIG.AUTH_STORAGE_KEY); return false; }
    return true;
  } catch { return false; }
}

function salvarSessao() {
  localStorage.setItem(CONFIG.AUTH_STORAGE_KEY, JSON.stringify({
    ok: true,
    expiry: Date.now() + CONFIG.AUTH_DURATION_MS,
  }));
}

function encerrarSessao() {
  localStorage.removeItem(CONFIG.AUTH_STORAGE_KEY);
  document.getElementById('offers-container').innerHTML = '';
  document.getElementById('results-count').classList.add('hidden');
  mostrarTelaSenha();
}

async function hashSenha(senha) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(senha));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
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

    btn.disabled = true;
    btn.textContent = 'Verificando...';
    erro.classList.add('hidden');

    if (await hashSenha(senha) === CONFIG.PASSWORD_HASH) {
      salvarSessao();
      mostrarConteudo();
      carregarDados();
    } else {
      erro.classList.remove('hidden');
      input.value = '';
      input.focus();
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });
}

function configurarBotaoSair() {
  document.getElementById('logout-btn')?.addEventListener('click', encerrarSessao);
}


/* ============================================================
   BUSCA DE DADOS — Google Sheets via endpoint gviz público
   Não requer API Key. A planilha precisa estar compartilhada
   como "Qualquer pessoa com o link pode visualizar".
   ============================================================ */

async function carregarDados() {
  mostrarSkeletons();

  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&gid=${CONFIG.SHEET_GID}`;

  try {
    const res   = await fetch(url);
    const texto = await res.text();

    dadosBrutos = parsearGviz(texto);
    popularDropdownsFiltros(dadosBrutos);
    renderizarOfertas(dadosBrutos);
    atualizarContagem(dadosBrutos.length);

  } catch (err) {
    console.error('[Catálogo] Erro:', err);
    mostrarErroCarregamento();
  }
}

/**
 * Interpreta a resposta JSONP do endpoint gviz do Google Sheets.
 *
 * Mapeamento de colunas (conforme a planilha atual):
 *   0 → nome       (Oferta)
 *   1 → nicho      (Nicho)
 *   2 → valorGasto (Valor Gasto 7d)
 *   3 → cpa        (CPA)
 *   4 → fonte      (Fonte)
 *   5 → linkVsl    (Link VSL)
 */
function parsearGviz(texto) {
  const match = texto.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)\s*;?\s*$/);
  if (!match) throw new Error('Formato inesperado do Google Sheets');

  const data = JSON.parse(match[1]);
  if (data.status === 'error') throw new Error(data.errors?.[0]?.detailed_message || 'Erro na planilha');

  const { rows } = data.table;
  if (!rows?.length) return [];

  // Extrai valor de uma célula: prefere .f (formatado), depois .v (raw)
  const cel = (row, i) => {
    const c = row.c?.[i];
    if (!c) return '';
    if (c.f != null) return String(c.f);
    if (c.v != null) return String(c.v);
    return '';
  };

  return rows
    .map(row => ({
      nome:       cel(row, 0).trim(),
      nicho:      cel(row, 1).trim(),
      valorGasto: cel(row, 2).trim(),
      cpa:        cel(row, 3).trim(),
      fonte:      cel(row, 4).trim(),
      linkVsl:    cel(row, 5).trim(),
    }))
    .filter(r => r.nome); // Remove linhas vazias
}


/* ============================================================
   FILTROS
   ============================================================ */

function popularDropdownsFiltros(dados) {
  const nichos  = [...new Set(dados.map(d => d.nicho).filter(Boolean))].sort();
  const fontes  = [...new Set(dados.map(d => d.fonte).filter(Boolean))].sort();

  const selNicho = document.getElementById('filter-nicho');
  const selFonte = document.getElementById('filter-trafego');

  while (selNicho.options.length > 1) selNicho.remove(1);
  while (selFonte.options.length > 1) selFonte.remove(1);

  nichos.forEach(n => { const o = document.createElement('option'); o.value = o.textContent = n; selNicho.appendChild(o); });
  fontes.forEach(f => { const o = document.createElement('option'); o.value = o.textContent = f; selFonte.appendChild(o); });
}

function configurarFiltros() {
  const busca  = document.getElementById('search-input');
  const nicho  = document.getElementById('filter-nicho');
  const fonte  = document.getElementById('filter-trafego');
  const limpar = document.getElementById('clear-filters');

  busca.addEventListener('input',  e => { filtrosAtivos.busca = e.target.value.toLowerCase().trim(); aplicarFiltros(); });
  nicho.addEventListener('change', e => { filtrosAtivos.nicho = e.target.value; aplicarFiltros(); });
  fonte.addEventListener('change', e => { filtrosAtivos.fonte = e.target.value; aplicarFiltros(); });

  limpar.addEventListener('click', () => {
    filtrosAtivos = { busca: '', nicho: '', fonte: '' };
    busca.value = nicho.value = fonte.value = '';
    aplicarFiltros();
  });
}

function aplicarFiltros() {
  const { busca, nicho, fonte } = filtrosAtivos;

  const resultado = dadosBrutos.filter(o =>
    (!busca  || o.nome.toLowerCase().includes(busca)) &&
    (!nicho  || o.nicho === nicho) &&
    (!fonte  || o.fonte === fonte)
  );

  renderizarOfertas(resultado);
  atualizarContagem(resultado.length);
}


/* ============================================================
   RENDERIZAÇÃO
   ============================================================ */

function renderizarOfertas(lista) {
  const container = document.getElementById('offers-container');
  container.innerHTML = '';

  if (!lista.length) {
    container.innerHTML = `
      <div class="empty-state" role="status">
        <p>Nenhuma oferta encontrada</p>
        <span>Tente ajustar ou limpar os filtros.</span>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  lista.forEach(oferta => frag.appendChild(criarCard(oferta)));
  container.appendChild(frag);
}

function criarCard(oferta) {
  const card = document.createElement('div');
  card.className = 'offer-card';

  card.innerHTML = `
    <div class="offer-card-header">
      <div class="offer-card-title">
        <h2 class="offer-name">${esc(oferta.nome)}</h2>
        ${oferta.nicho ? `<span class="nicho-badge">${esc(oferta.nicho)}</span>` : ''}
      </div>
      ${oferta.fonte ? `<span class="fonte-tag">${esc(oferta.fonte)}</span>` : ''}
    </div>

    <div class="offer-card-metrics">
      <div class="metric">
        <span class="metric-label">Valor Gasto (7d)</span>
        <span class="metric-value">${fmtValor(oferta.valorGasto)}</span>
      </div>
      <div class="metric">
        <span class="metric-label">CPA</span>
        <span class="metric-value highlight">${fmtValor(oferta.cpa)}</span>
      </div>
    </div>

    ${oferta.linkVsl ? `
      <div class="offer-card-footer">
        <div class="vsl-ref">
          <span class="detail-label">Referência VSL</span>
          <span class="vsl-ref-value" title="${esc(oferta.linkVsl)}">${esc(oferta.linkVsl)}</span>
        </div>
      </div>` : ''}
  `;

  return card;
}


/* ============================================================
   ESTADOS DE UI
   ============================================================ */

function mostrarSkeletons() {
  document.getElementById('offers-container').innerHTML = Array(6).fill(`
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton-header">
        <div class="skeleton sk-title"></div>
        <div class="skeleton sk-badge"></div>
      </div>
      <div class="skeleton sk-text" style="margin-top:16px"></div>
      <div class="skeleton sk-text sk-short"></div>
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

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtValor(v) {
  return (v && v.trim()) ? esc(v) : '—';
}
