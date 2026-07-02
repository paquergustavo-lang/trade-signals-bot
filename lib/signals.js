import { kv } from './kv';
import { fetchNewsWithSentiment, currencyBias } from './news';
import { sendTelegramMessage } from './telegram';

const SIGNALS_KEY = 'signals';
const NEWS_CACHE_KEY = 'news_cache';
const MAX_SIGNALS = 200;

function splitPair(rawPair) {
      const p = rawPair.toUpperCase().replace('/', '').trim();
      if (p.startsWith('XAU')) return { base: 'XAU', quote: p.slice(3) || 'USD' };
      if (p.length >= 6) return { base: p.slice(0, 3), quote: p.slice(3, 6) };
      return { base: p, quote: 'USD' };
}

export async function getCachedNews() {
      const cached = await kv.get(NEWS_CACHE_KEY);
      return cached || [];
}

export async function refreshNewsCache() {
      const news = await fetchNewsWithSentiment();
      await kv.set(NEWS_CACHE_KEY, news);
      return news;
}

// Recebe um sinal tecnico (vindo do webhook do TradingView), cruza com o
// contexto de noticias em cache e grava o resultado combinado.
export async function processTechnicalSignal({
      pair,
      action,
      price,
      strategy,
      note,
      entry,
      takeProfit,
      stopLoss,
      market,
}) {
      if (!pair || !action) {
              throw new Error('pair e action sao obrigatorios');
      }

  // "forex" (entradas analiticas, multi-timeframe H4/H1/M15) ou "binary"
  // (entradas rapidas em M1). Alertas antigos sem esse campo caem em "forex".
  const marketType = String(market || 'forex').toLowerCase() === 'binary' ? 'binary' : 'forex';

  const { base, quote } = splitPair(pair);
      const news = await getCachedNews();

  const baseBias = currencyBias(news, base);
      const quoteBias = currencyBias(news, quote);
      const netBias = baseBias.score - quoteBias.score;

  const actionUpper = String(action).toUpperCase();
      const wantsUp = ['BUY', 'COMPRA', 'LONG'].includes(actionUpper);

  let status = 'neutro';
      if (netBias !== 0) {
              const newsAgreesWithBuy = netBias > 0 && wantsUp;
              const newsAgreesWithSell = netBias < 0 && !wantsUp;
              status = newsAgreesWithBuy || newsAgreesWithSell ? 'confirmado' : 'atencao';
      }

  const toNumberOrNull = (v) => {
          if (v === undefined || v === null || v === '') return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
  };

  const record = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          pair: pair.toUpperCase(),
          action: actionUpper,
          market: marketType,
          price: price ?? null,
          entry: toNumberOrNull(entry) ?? toNumberOrNull(price),
          takeProfit: toNumberOrNull(takeProfit),
          stopLoss: toNumberOrNull(stopLoss),
          strategy: strategy || 'N/A',
          note: note || '',
          newsBias: {
                    base: { code: base, score: baseBias.score, count: baseBias.count },
                    quote: { code: quote, score: quoteBias.score, count: quoteBias.count },
                    net: netBias,
          },
          status,
  };

  const existing = (await kv.get(SIGNALS_KEY)) || [];
      existing.unshift(record);
      await kv.set(SIGNALS_KEY, existing.slice(0, MAX_SIGNALS));

  const statusEmoji = status === 'confirmado' ? '✅' : status === 'atencao' ? '⚠️' : '➖';
      const marketLabel = marketType === 'binary' ? '🎯 BINARIA' : '📈 FOREX';
      const dateLabel = new Date(record.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const message =
              `${statusEmoji} <b>${record.pair}</b> - ${record.action}\n` +
              `[${marketLabel}]\n` +
              `Entrada: ${record.entry ?? 'N/A'}\n` +
              `Take Profit: ${record.takeProfit ?? 'N/A'}\n` +
              `Stop Loss: ${record.stopLoss ?? 'N/A'}\n` +
              `Estrategia: ${record.strategy}\n` +
              `Vies noticias: ${base} ${baseBias.score >= 0 ? '+' : ''}${baseBias.score} / ${quote} ${quoteBias.score >= 0 ? '+' : ''}${quoteBias.score}\n` +
              `Status: ${status.toUpperCase()}\n` +
              `${dateLabel}`;

  await sendTelegramMessage(message);

  return record;
}

export async function listSignals(limit = 100) {
      const all = (await kv.get(SIGNALS_KEY)) || [];
      return all.slice(0, limit);
}

export async function listSignalsByMarket(marketType, limit = 100) {
      const all = (await kv.get(SIGNALS_KEY)) || [];
      return all.filter((s) => (s.market || 'forex') === marketType).slice(0, limit);
}
