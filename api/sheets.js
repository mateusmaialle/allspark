const crypto = require('crypto');

function isValidToken(token) {
  const secret = process.env.SESSION_SECRET;
  // Aceita token do dia atual ou do dia anterior (cobre sessões de até 48h)
  for (const offset of [0, -1]) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const day      = d.toISOString().slice(0, 10);
    const expected = crypto.createHmac('sha256', secret).update(day).digest('hex');
    if (token === expected) return true;
  }
  return false;
}

module.exports = async function handler(req, res) {
  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!isValidToken(token)) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const id  = process.env.SHEET_ID;
  const gid = process.env.SHEET_GID;

  if (!id || !gid) {
    return res.status(500).json({ error: 'Planilha não configurada' });
  }

  try {
    const url      = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&gid=${gid}`;
    const response = await fetch(url);
    const text     = await response.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(text);
  } catch {
    res.status(502).json({ error: 'Falha ao buscar dados da planilha' });
  }
};
