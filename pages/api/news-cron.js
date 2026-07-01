import { refreshNewsCache } from '../../lib/signals';

// Chamado automaticamente pelo Vercel Cron (ver vercel.json, roda 1x por hora).
// Tambem pode ser chamado manualmente (GET ou POST) pra forcar atualizacao.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metodo nao permitido.' });
  }

  try {
    const news = await refreshNewsCache();
    return res.status(200).json({ ok: true, count: news.length });
  } catch (err) {
    console.error('Erro ao atualizar noticias:', err);
    return res.status(500).json({ error: err.message });
  }
}
