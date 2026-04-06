/* ============================================================
   config.js — Configurações do Catálogo de Ofertas

   COMO TROCAR A SENHA:
   1. Gere o hash SHA-256 da nova senha em:
      https://emn178.github.io/online-tools/sha256.html
   2. Cole o resultado em PASSWORD_HASH abaixo

   SHEET_ID e SHEET_GID ficam no Vercel como variáveis de ambiente
   (Settings → Environment Variables) — não aparecem no código.
   ============================================================ */

const CONFIG = {
  // Hash SHA-256 da senha de acesso
  PASSWORD_HASH: '6b44861e689047437e3e08ac14dfed73871886c5bc85e5398c5cd92327a3e626',

  // Duração da sessão após login: 24 horas em milissegundos
  AUTH_DURATION_MS: 24 * 60 * 60 * 1000,

  // Chave usada no localStorage para guardar a sessão
  AUTH_STORAGE_KEY: 'catalogo_auth_v1',
};
