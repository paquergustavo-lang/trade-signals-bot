import { processTechnicalSignal } from '../../lib/signals';

// Endpoint que recebe os alertas do TradingView.
// Configure o alerta no TradingView com Webhook URL apontando pra:
//   https://SEU-PROJETO.vercel.app/api/webhook
// E a mensagem do alerta (Message) como um JSON, exemplo:
// {
//   "secret": "{{sua senha do WEBHOOK_SECRET}}",
//   "pair": "{{ticker}}",
//   "action": "buy",
//   "market": "forex",
//   "price": {{close}},
//   "entry": {{close}},
//   "takeProfit": {{plot("Long TP")}},
//   "stopLoss": {{plot("Long SL")}},
//   "strategy": "EMA9x21 + RSI"
// }
// "market" pode ser "forex" (entradas analiticas H4/H1/M15) ou "binary"
// (entradas rapidas M1). Se nao vier, assume "forex".
export default async function handler(req, res) {
      if (req.method !== 'POST') {
              res.setHeader('Allow', 'POST');
              return res.status(405).json({ error: 'Metodo nao permitido, use POST.' });
      }

  try {
          const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
          const { secret, pair, action, price, strategy, note, entry, takeProfit, stopLoss, market } = body || {};

        if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
                  return res.status(401).json({ error: 'Secret invalido ou ausente.' });
        }

        if (!pair || !action) {
                  return res.status(400).json({ error: 'Campos "pair" e "action" sao obrigatorios.' });
        }

        const record = await processTechnicalSignal({
                  pair,
                  action,
                  price,
                  strategy,
                  note,
                  entry,
                  takeProfit,
                  stopLoss,
                  market,
        });
          return res.status(200).json({ ok: true, signal: record });
  } catch (err) {
          console.error('Erro no webhook:', err);
          return res.status(500).json({ error: err.message });
  }
}
