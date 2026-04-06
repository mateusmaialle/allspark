module.exports = async function handler(req, res) {
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
