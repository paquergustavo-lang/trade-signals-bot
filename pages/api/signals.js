import { listSignals, getCachedNews } from '../../lib/signals';

// Usado pelo dashboard (pages/index.js) pra fazer auto-refresh via fetch no
// navegador, sem precisar recarregar a pagina inteira.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metodo nao permitido.' });
  }

  try {
    const [signals, news] = await Promise.all([listSignals(100), getCachedNews()]);
    return res.status(200).json({ signals, news });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
