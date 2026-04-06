const crypto = require('crypto');

function makeToken() {
  const secret = process.env.SESSION_SECRET;
  const day    = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return crypto.createHmac('sha256', secret).update(day).digest('hex');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Senha obrigatória' });

  if (password !== process.env.SITE_PASSWORD) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }

  res.json({ token: makeToken() });
};
