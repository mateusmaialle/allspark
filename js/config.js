/* ============================================================
   config.js — Configurações do Catálogo de Ofertas

   Senha, Sheet ID e segredos ficam no Vercel (env vars).
   Este arquivo não contém dados sensíveis.
   ============================================================ */

const CONFIG = {
  // Duração da sessão após login: 24 horas em milissegundos
  AUTH_DURATION_MS: 24 * 60 * 60 * 1000,

  // Chave usada no localStorage para guardar a sessão
  AUTH_STORAGE_KEY: 'catalogo_auth_v1',
};
