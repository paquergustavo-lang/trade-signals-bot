import { XMLParser } from 'fast-xml-parser';

// Feeds RSS gratuitos, sem necessidade de API key. Testados e confirmados
// ativos em 2026-07-01. Pode adicionar/remover a vontade - dailyfx.com e
// forexlive.com foram removidos porque os feeds antigos pararam de funcionar.
const FEEDS = [
    'https://www.investing.com/rss/news_1.rss', // Forex News
    'https://www.investing.com/rss/news_11.rss', // Commodities & Futures (cobre ouro)
    'https://www.fxstreet.com/rss/news', // FXStreet Forex & Commodities News
  ];

// Palavras-chave usadas so pra ligar uma noticia a uma moeda especifica
// (relevancia, nao sentimento). O sentimento em si agora e lido pela IA.
const CURRENCY_KEYWORDS = {
    USD: ['dollar', 'usd', 'fed ', 'federal reserve', 'powell', 'fomc', 'greenback'],
    EUR: ['euro', 'eur ', 'eurusd', 'ecb', 'lagarde', 'eurozone', 'euro zone'],
    GBP: ['pound', 'sterling', 'gbp', 'boe', 'bank of england', 'cable'],
    JPY: ['yen', 'jpy', 'boj', 'bank of japan', 'ueda'],
    CAD: ['loonie', 'cad', 'boc', 'bank of canada', 'canadian dollar'],
    NOK: ['krone', 'nok', 'norges bank', 'norwegian'],
    BRL: ['real', 'brl', 'brazil', 'brazilian', 'bcb', 'selic', 'copom'],
    XAU: ['gold', 'xau', 'bullion', 'precious metal'],
};

const POSITIVE_WORDS = [
    'rally', 'rallies', 'surge', 'surges', 'gain', 'gains', 'strengthen', 'strengthens',
    'jump', 'jumps', 'rise', 'rises', 'rising', 'hawkish', 'beat', 'beats', 'optimis',
    'soar', 'soars', 'higher', 'upbeat', 'recovery', 'boost', 'boosts',
  ];

const NEGATIVE_WORDS = [
    'fall', 'falls', 'falling', 'drop', 'drops', 'plunge', 'plunges', 'dovish',
    'miss', 'misses', 'weaken', 'weakens', 'recession', 'crisis', 'sell-off', 'selloff',
    'lower', 'slump', 'slumps', 'tumble', 'tumbles', 'worry', 'worries', 'fear', 'fears',
    'cut ', 'cuts',
  ];

function scoreSentimentKeyword(text) {
    const t = text.toLowerCase();
    let score = 0;
    for (const w of POSITIVE_WORDS) if (t.includes(w)) score += 1;
    for (const w of NEGATIVE_WORDS) if (t.includes(w)) score -= 1;
    return Math.max(-2, Math.min(2, score));
}

function matchCurrencies(text) {
    const t = text.toLowerCase();
    const matched = [];
    for (const [code, keywords] of Object.entries(CURRENCY_KEYWORDS)) {
          if (keywords.some((k) => t.includes(k))) matched.push(code);
    }
    return matched;
}

function extractText(field) {
    if (field == null) return '';
    if (typeof field === 'string') return field;
    if (typeof field === 'object' && '#text' in field) return String(field['#text']);
    return String(field);
}

const parser = new XMLParser({ ignoreAttributes: false });

async function fetchFeed(url) {
    try {
          const res = await fetch(url, {
                  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TradeSignalsBot/1.0)' },
          });
          if (!res.ok) return [];
          const xml = await res.text();
          const parsed = parser.parse(xml);
          const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
          const list = Array.isArray(items) ? items : [items].filter(Boolean);
          return list.map((item) => ({
                  title: extractText(item.title),
                  description: extractText(item.description ?? item.summary),
                  link: typeof item.link === 'object' ? item.link['@_href'] ?? '' : extractText(item.link),
                  pubDate: item.pubDate ?? item.published ?? item.updated ?? null,
                  source: url,
          }));
    } catch (err) {
          console.error(`Erro ao buscar feed ${url}:`, err.message);
          return [];
    }
}

// Manda ate MAX_AI_ITEMS noticias de uma vez pra IA analisar o sentimento
// real (contexto, ironia, hawkish/dovish etc), em vez de so contar palavra.
// Uma chamada so por rodada do cron (barato e rapido).
const MAX_AI_ITEMS = 50;

async function scoreWithAI(items) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || items.length === 0) return null;

  const batch = items.slice(0, MAX_AI_ITEMS);
    const numbered = batch
      .map((it, i) => `${i + 1}. TITULO: ${it.title}\nRESUMO: ${it.description || '(sem resumo)'}`)
      .join('\n\n');

  const prompt =
        'Voce e um analista de mercado forex. Para cada noticia numerada abaixo, avalie o ' +
        'impacto real no sentimento da(s) moeda(s)/ativo(s) mencionados - considere contexto, ' +
        'tom hawkish/dovish de bancos centrais, ironia, e o significado economico, nao so palavras ' +
        'soltas. De uma nota de -2 (muito negativo pra moeda) a +2 (muito positivo), 0 se neutro ' +
        'ou irrelevante. Responda APENAS com um JSON array, um objeto por noticia, na mesma ordem, ' +
        'formato exato: [{"sentiment": -2, "reasoning": "frase curta em portugues explicando o motivo"}, ...]. ' +
        'Sem nenhum texto antes ou depois do JSON.\n\n' +
        numbered;

  try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                          'content-type': 'application/json',
                          'x-api-key': apiKey,
                          'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                          model: 'claude-haiku-4-5-20251001',
                          max_tokens: 4000,
                          messages: [{ role: 'user', content: prompt }],
                }),
        });

      if (!res.ok) {
              console.error('Erro na API da Anthropic:', res.status, await res.text());
              return null;
      }

      const data = await res.json();
        const text = data?.content?.[0]?.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(parsed)) return null;
        return parsed;
  } catch (err) {
        console.error('Falha ao chamar IA pra sentimento de noticias:', err.message);
        return null;
  }
}

export async function fetchNewsWithSentiment() {
    const results = await Promise.all(FEEDS.map(fetchFeed));
    const allItems = results.flat();

  const relevant = allItems
      .map((item) => {
              const text = `${item.title} ${item.description}`;
              const currencies = matchCurrencies(text);
              if (currencies.length === 0) return null;
              return { ...item, currencies, text };
      })
      .filter(Boolean);

  const aiResults = await scoreWithAI(relevant);

  const analyzed = relevant.map((item, i) => {
        const ai = aiResults?.[i];
        const sentiment = ai && Number.isFinite(ai.sentiment) ? ai.sentiment : scoreSentimentKeyword(item.text);
        const reasoning = ai?.reasoning || null;
        return {
                title: item.title,
                link: item.link,
                pubDate: item.pubDate,
                currencies: item.currencies,
                sentiment,
                reasoning,
                source: aiResults ? 'ia' : 'palavra-chave',
        };
  });

  analyzed.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

  return analyzed.slice(0, 60);
}

export function currencyBias(newsItems, currencyCode, hoursWindow = 12) {
    const cutoff = Date.now() - hoursWindow * 60 * 60 * 1000;
    const relevant = newsItems.filter((n) => {
          if (!n.currencies.includes(currencyCode)) return false;
          if (!n.pubDate) return true;
          const t = new Date(n.pubDate).getTime();
          return Number.isNaN(t) || t >= cutoff;
    });
    const score = relevant.reduce((sum, n) => sum + n.sentiment, 0);
    return { score, count: relevant.length, items: relevant.slice(0, 5) };
}
