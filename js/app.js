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
let ordenacao = { coluna: null, direcao: 'asc' }; // coluna: 'valorGasto' | 'cpa'


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
   RENDERIZAÇÃO — Tabela
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

  const listaSorted = ordenarLista(lista);

  const tabela = document.createElement('div');
  tabela.className = 'table-wrap';
  tabela.innerHTML = `
    <table class="offers-table">
      <thead>
        <tr>
          <th>Oferta</th>
          <th>Nicho</th>
          <th class="num sortable ${ordenacao.coluna === 'valorGasto' ? 'sorted' : ''}" data-col="valorGasto">
            Valor Gasto (7d) ${setSortIcon('valorGasto')}
          </th>
          <th class="num sortable ${ordenacao.coluna === 'cpa' ? 'sorted' : ''}" data-col="cpa">
            CPA (custo por aquisição) ${setSortIcon('cpa')}
          </th>
          <th>Fonte</th>
          <th>VSL</th>
        </tr>
      </thead>
      <tbody>
        ${listaSorted.map(o => `
          <tr>
            <td class="td-nome">${esc(o.nome)}</td>
            <td>${o.nicho ? `<span class="nicho-badge">${esc(o.nicho)}</span>` : '—'}</td>
            <td class="num td-valor">${fmtValor(o.valorGasto)}</td>
            <td class="num td-cpa">${fmtValor(o.cpa)}</td>
            <td>${o.fonte ? `<span class="fonte-tag">${esc(o.fonte)}</span>` : '—'}</td>
            <td class="td-vsl">${htmlLinkVsl(o.linkVsl)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  // Listeners de ordenação nos cabeçalhos clicáveis
  tabela.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (ordenacao.coluna === col) {
        ordenacao.direcao = ordenacao.direcao === 'asc' ? 'desc' : 'asc';
      } else {
        ordenacao.coluna  = col;
        ordenacao.direcao = 'desc'; // padrão: maior primeiro
      }
      aplicarFiltros();
    });
  });

  container.appendChild(tabela);
}

/** Retorna ícone SVG de ordenação conforme o estado atual */
function setSortIcon(col) {
  if (ordenacao.coluna !== col) {
    return `<svg class="sort-icon idle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M8 9l4-4 4 4M16 15l-4 4-4-4"/>
    </svg>`;
  }
  return ordenacao.direcao === 'desc'
    ? `<svg class="sort-icon active" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 9l-7 7-7-7"/>
       </svg>`
    : `<svg class="sort-icon active" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 15l7-7 7 7"/>
       </svg>`;
}

/** Ordena a lista pelo estado atual de ordenacao */
function ordenarLista(lista) {
  if (!ordenacao.coluna) return lista;
  return [...lista].sort((a, b) => {
    const va = parsearValor(a[ordenacao.coluna]);
    const vb = parsearValor(b[ordenacao.coluna]);
    return ordenacao.direcao === 'asc' ? va - vb : vb - va;
  });
}

/**
 * Renderiza a célula VSL:
 * - Se o valor for uma URL (http/https) → link clicável
 * - Caso contrário → texto simples
 */
function htmlLinkVsl(valor) {
  if (!valor) return '—';
  try {
    const url = new URL(valor);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return `<a href="${esc(valor)}" target="_blank" rel="noopener noreferrer" class="vsl-link" title="${esc(valor)}">
        Abrir VSL ↗
      </a>`;
    }
  } catch { /* não é URL */ }
  return `<span class="td-vsl-text" title="${esc(valor)}">${esc(valor)}</span>`;
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

/**
 * Converte string de valor monetário em número para ordenação.
 * Suporta formatos: "$54.855,00", "R$ 1.234,56", "163,88"
 */
function parsearValor(str) {
  if (!str || str === '—') return -Infinity;
  const limpo = str.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(limpo) || 0;
}

