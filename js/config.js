/* ============================================================
   config.js — Configurações do Catálogo de Ofertas
   Este é o único arquivo que você precisa editar para:
     - Trocar a planilha
     - Trocar a senha de acesso

   COMO TROCAR A SENHA:
   1. Gere o hash SHA-256 da nova senha em:
      https://emn178.github.io/online-tools/sha256.html
   2. Cole o resultado em PASSWORD_HASH abaixo
   ============================================================ */

const CONFIG = {
  // ID da planilha do Google Sheets (extraído da URL)
  SHEET_ID: '1gGYS8GKNSDad0F-rx44jvpszInUuRj6HVci_Sj50dk8',

  // ID da aba específica (o número após gid= na URL da planilha)
  // Deixe vazio ('') para usar a primeira aba
  SHEET_GID: '95760077',

  // Hash SHA-256 da senha "xmxoffers"
  // Para trocar a senha, gere um novo hash e substitua abaixo
  PASSWORD_HASH: '6b44861e689047437e3e08ac14dfed73871886c5bc85e5398c5cd92327a3e626',

  // Duração da sessão após login: 24 horas em milissegundos
  AUTH_DURATION_MS: 24 * 60 * 60 * 1000,

  // Chave usada no localStorage para guardar a sessão
  AUTH_STORAGE_KEY: 'catalogo_auth_v1',
};
