/* ============================================================
   app.js — Catálogo de Ofertas XMX
   Depende de: js/config.js (carregado antes no index.html)
   ============================================================ */


/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
let dadosBrutos      = [];   // linhas mapeadas por field name
let dadosColunasOrdem = [];  // [{field, label, type, idx}] na ordem da planilha
let filtrosAtivos    = { busca: '', nicho: '', fonte: '' };
let ordenacao        = { coluna: null, direcao: 'asc' };


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
  configurarBotaoRefresh();
});


/* ============================================================
   AUTENTICAÇÃO
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
    ok: true, expiry: Date.now() + CONFIG.AUTH_DURATION_MS,
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

function configurarBotaoRefresh() {
  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    ordenacao = { coluna: null, direcao: 'asc' };
    carregarDados();
  });
}


/* ============================================================
   BUSCA DE DADOS
   ============================================================ */
async function carregarDados() {
  mostrarSkeletons();
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&gid=${CONFIG.SHEET_GID}`;
  try {
    const res   = await fetch(url);
    const texto = await res.text();
    const { dados, colunasOrdem } = parsearGviz(texto);

    dadosBrutos       = dados;
    dadosColunasOrdem = colunasOrdem;

    popularDropdownsFiltros(dadosBrutos);
    renderizarOfertas(dadosBrutos);
    atualizarContagem(dadosBrutos.length);
  } catch (err) {
    console.error('[Catálogo] Erro:', err);
    mostrarErroCarregamento();
  }
}


/* ============================================================
   PARSER GVIZ — mapeamento dinâmico por nome de cabeçalho
   ============================================================ */

// Nomes aceitos para cada campo (case-insensitive, sem acentos)
const LABEL_MAP = {
  nome:            ['oferta', 'nome da oferta', 'nome', 'offer', 'produto'],
  nicho:           ['nicho', 'niche', 'categoria'],
  valorGasto:      ['valor gasto (7d)', 'valor gasto', 'valor investido (7d)', 'valor investido', 'investido', 'gasto'],
  cpa:             ['cpa', 'custo por aquisicao', 'custo por aquisição'],
  fonte:           ['fonte', 'fonte de trafego', 'fonte de tráfego', 'canal', 'trafego'],
  linkVsl:         ['link vsl', 'vsl', 'link', 'url', 'link da pasta'],
  nomeVsl:         ['nome vsl', 'nome do vsl', 'nome da vsl', 'vsl nome', 'nome do arquivo'],
  versao:          ['versao', 'versão', 'version', 'ver'],
  dataAtualizacao: ['data de atualizacao', 'data de atualização', 'data', 'atualizado em', 'atualização'],
};

// Índice invertido: label normalizado → field name
const NORM_TO_FIELD = {};
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
Object.entries(LABEL_MAP).forEach(([field, labels]) => {
  labels.forEach(l => { NORM_TO_FIELD[norm(l)] = field; });
});

function parsearGviz(texto) {
  const match = texto.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)\s*;?\s*$/);
  if (!match) throw new Error('Formato inesperado do Google Sheets');

  const data = JSON.parse(match[1]);
  if (data.status === 'error') throw new Error(data.errors?.[0]?.detailed_message || 'Erro na planilha');

  const { cols, rows } = data.table;
  if (!rows?.length) return { dados: [], colunasOrdem: [] };

  // Mapeia cada coluna (com label) ao seu field e mantém a ordem da planilha
  const colunasOrdem = cols
    .map((col, idx) => {
      const field = NORM_TO_FIELD[norm(col.label)] ?? null;
      return {
        idx,
        label: field === 'nomeVsl' ? 'Nome da Oferta' : col.label,
        type:  col.type,
        field,
      };
    })
    .filter(c => c.label.trim()) // ignora colunas sem cabeçalho
    .sort((a, b) => {            // garante que Nome da Oferta aparece primeiro
      if (a.field === 'nomeVsl') return -1;
      if (b.field === 'nomeVsl') return 1;
      return 0;
    });

  // Índice por field para extração rápida (inclui todas as colunas mapeadas, mesmo as não exibidas)
  const I = {};
  cols.forEach((col, idx) => {
    const field = NORM_TO_FIELD[norm(col.label)] ?? null;
    if (field && !(field in I)) I[field] = idx;
  });

  const cel = (row, i) => {
    if (i == null) return '';
    const c = row.c?.[i];
    if (!c) return '';
    return (c.f != null ? String(c.f) : c.v != null ? String(c.v) : '').trim();
  };

  const dados = rows
    .map(row => ({
      nome:            cel(row, I.nome),
      nicho:           cel(row, I.nicho),
      valorGasto:      cel(row, I.valorGasto),
      cpa:             cel(row, I.cpa),
      fonte:           cel(row, I.fonte),
      linkVsl:         cel(row, I.linkVsl),
      nomeVsl:         cel(row, I.nomeVsl),
      versao:          cel(row, I.versao),
      dataAtualizacao: cel(row, I.dataAtualizacao),
    }))
    .filter(r => r.nome);

  return { dados, colunasOrdem };
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
   RENDERIZAÇÃO — tabela dinâmica na ordem da planilha
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

  // Cabeçalhos na ordem das colunas da planilha
  const headers = dadosColunasOrdem.map(col => {
    const isNumeric = col.type === 'number' && col.field;
    const isSorted  = ordenacao.coluna === col.field;
    if (isNumeric) {
      return `<th class="num sortable ${isSorted ? 'sorted' : ''}" data-col="${col.field}">
        ${esc(col.label)} ${setSortIcon(col.field)}
      </th>`;
    }
    return `<th>${esc(col.label)}</th>`;
  }).join('');

  // Linhas de dados
  const bodyRows = listaSorted.map(o => {
    const cells = dadosColunasOrdem.map(col => {
      return `<td class="${classesCelula(col)}">${renderCelula(col, o)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.innerHTML = `
    <table class="offers-table">
      <thead><tr>${headers}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;

  // Ordenação: clique no cabeçalho
  wrap.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      ordenacao.coluna  = ordenacao.coluna === col && ordenacao.direcao === 'desc' ? col : col;
      ordenacao.direcao = ordenacao.coluna === col && ordenacao.direcao === 'desc' ? 'asc' : 'desc';
      ordenacao.coluna  = col;
      aplicarFiltros();
    });
  });

  container.appendChild(wrap);
}

/** Retorna as classes CSS adequadas para cada célula */
function classesCelula(col) {
  const classes = [];
  if (col.type === 'number') classes.push('num');
  if (col.field === 'nome')            classes.push('td-nome');
  if (col.field === 'cpa')             classes.push('td-cpa');
  if (col.field === 'valorGasto')      classes.push('td-valor');
  if (col.field === 'versao')          classes.push('td-versao');
  if (col.field === 'dataAtualizacao') classes.push('td-data');
  if (col.field === 'linkVsl')         classes.push('td-vsl');
  return classes.join(' ');
}

/** Renderiza o conteúdo de uma célula com formatação especial por campo */
function renderCelula(col, oferta) {
  const val = col.field ? (oferta[col.field] ?? '') : '';
  if (!val) return '—';
  if (col.field === 'nicho')   return `<span class="nicho-badge">${esc(val)}</span>`;
  if (col.field === 'fonte')   return `<span class="fonte-tag">${esc(val)}</span>`;
  if (col.field === 'linkVsl') return htmlLinkVsl(val);
  return esc(val);
}

/** Ícone SVG de ordenação */
function setSortIcon(field) {
  if (ordenacao.coluna !== field) {
    return `<svg class="sort-icon idle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M8 9l4-4 4 4M16 15l-4 4-4-4"/>
    </svg>`;
  }
  return ordenacao.direcao === 'desc'
    ? `<svg class="sort-icon active" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 9l-7 7-7-7"/></svg>`
    : `<svg class="sort-icon active" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 15l7-7 7 7"/></svg>`;
}

/** Ordena a lista pelo campo e direção ativos */
function ordenarLista(lista) {
  if (!ordenacao.coluna) return lista;
  return [...lista].sort((a, b) => {
    const va = parsearValor(a[ordenacao.coluna]);
    const vb = parsearValor(b[ordenacao.coluna]);
    return ordenacao.direcao === 'asc' ? va - vb : vb - va;
  });
}

/** Renderiza VSL como link clicável se for URL, senão texto */
function htmlLinkVsl(valor) {
  if (!valor) return '—';
  try {
    const url = new URL(valor);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return `<a href="${esc(valor)}" target="_blank" rel="noopener noreferrer" class="vsl-link">Abrir VSL ↗</a>`;
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

function parsearValor(str) {
  if (!str || str === '—') return -Infinity;
  let s = str.replace(/[R$\s]/g, '');
  // Detecta formato: se o último separador for '.', é US (ex: 54,855.00); se for ',', é BR (ex: 4.200,00)
  const lastDot   = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot > lastComma) {
    s = s.replace(/,/g, ''); // remove separador de milhar US
  } else {
    s = s.replace(/\./g, '').replace(',', '.'); // formato BR
  }
  return parseFloat(s) || 0;
}
