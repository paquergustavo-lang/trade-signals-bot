import { useEffect, useState, useCallback } from 'react';
import { listSignals, getCachedNews } from '../lib/signals';

export async function getServerSideProps() {
        const [signals, news] = await Promise.all([listSignals(100), getCachedNews()]);
        return { props: { initialSignals: signals, initialNews: news } };
}

const STATUS_STYLES = {
        confirmado: { bg: '#0f3d24', color: '#4ade80', label: 'CONFIRMADO' },
        atencao: { bg: '#3d2e0f', color: '#facc15', label: 'ATENCAO' },
        neutro: { bg: '#22262b', color: '#9ca3af', label: 'NEUTRO' },
};

function formatDate(iso) {
        try {
                  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        } catch {
                  return iso;
        }
}

// Tabela reutilizavel de sinais - usada uma vez pra Forex e uma vez pra Binarias.
function SignalsTable({ title, emptyHint, signals }) {
        return (
                  <section style={styles.section}>
      <h2 style={styles.sectionTitle}>
        {title} ({signals.length})
              </h2>
      {signals.length === 0 ? (
                    <p style={styles.empty}>{emptyHint}</p>
                  ) : (
                    <div style={styles.tableWrap}>
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th style={styles.th}>Data/Hora</th>
                       <th style={styles.th}>Par</th>
                       <th style={styles.th}>Ação</th>
                       <th style={styles.th}>Entrada</th>
                       <th style={styles.th}>Take Profit</th>
                       <th style={styles.th}>Stop Loss</th>
                       <th style={styles.th}>Estratégia</th>
                       <th style={styles.th}>Viés notícias (base/quote)</th>
                       <th style={styles.th}>Status</th>
            </tr>
            </thead>
                   <tbody>
      {signals.map((s) => {
                            const st = STATUS_STYLES[s.status] || STATUS_STYLES.neutro;
                            return (
                                                    <tr key={s.id}>
                                       <td style={styles.td}>{formatDate(s.timestamp)}</td>
                                       <td style={{ ...styles.td, fontWeight: 700 }}>{s.pair}</td>
                          <td
                            style={{
                                                          ...styles.td,
                                                          color: s.action === 'BUY' ? '#4ade80' : '#f87171',
                                                          fontWeight: 700,
                            }}
                    >
{s.action}
</td>
                    <td style={{ ...styles.td, fontWeight: 700 }}>{s.entry ?? s.price ?? '—'}</td>
                    <td style={{ ...styles.td, color: '#4ade80' }}>{s.takeProfit ?? '—'}</td>
                    <td style={{ ...styles.td, color: '#f87171' }}>{s.stopLoss ?? '—'}</td>
                    <td style={styles.td}>{s.strategy}</td>
                    <td style={styles.td}>
{s.newsBias
                        ? `${s.newsBias.base.code} ${s.newsBias.base.score >= 0 ? '+' : ''}${s.newsBias.base.score} / ${s.newsBias.quote.code} ${s.newsBias.quote.score >= 0 ? '+' : ''}${s.newsBias.quote.score}`
                              : '—'}
</td>
                    <td style={styles.td}>
                      <span
                        style={{
                                                        ...styles.badge,
                                                        background: st.bg,
                                                        color: st.color,
                        }}
                      >
{st.label}
</span>
      </td>
      </tr>
                );
})}
</tbody>
      </table>
      </div>
      )}
</section>
  );
}

export default function Dashboard({ initialSignals, initialNews }) {
        const [signals, setSignals] = useState(initialSignals || []);
        const [news, setNews] = useState(initialNews || []);
        const [lastUpdate, setLastUpdate] = useState(new Date());
        const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
            setLoading(true);
            try {
                        const res = await fetch('/api/signals');
                        const data = await res.json();
                        if (data.signals) setSignals(data.signals);
                        if (data.news) setNews(data.news);
                        setLastUpdate(new Date());
            } catch (err) {
                        console.error('Erro ao atualizar dashboard:', err);
            } finally {
                        setLoading(false);
            }
  }, []);

  useEffect(() => {
            const interval = setInterval(refresh, 30000);
            return () => clearInterval(interval);
  }, [refresh]);

  // Alertas antigos nao mandam "market" - caem em forex por padrao (mesma
  // regra usada no backend, lib/signals.js).
  const forexSignals = signals.filter((s) => (s.market || 'forex') !== 'binary');
        const binarySignals = signals.filter((s) => s.market === 'binary');

  return (
            <div style={styles.page}>
      <header style={styles.header}>
        <div>
                  <h1 style={styles.title}>Trade Signals — Forex</h1>
                <p style={styles.subtitle}>
            Sinais técnicos (TradingView) cruzados com notícias de mercado
        </p>
        </div>
              <div style={styles.headerRight}>
          <button style={styles.refreshBtn} onClick={refresh} disabled={loading}>
  {loading ? 'Atualizando...' : 'Atualizar agora'}
</button>
          <span style={styles.lastUpdate}>
            Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}
</span>
      </div>
      </header>

      <SignalsTable
        title="📈 Forex (analítico)"
        emptyHint="Nenhum sinal de Forex recebido ainda. Configure um alerta no TradingView (market: forex) apontando pro endpoint /api/webhook — veja o README do projeto."
        signals={forexSignals}
      />

                    <SignalsTable
        title="🎯 Binárias"
        emptyHint='Nenhum sinal de Binárias recebido ainda. Configure um alerta com "market": "binary" no Message do TradingView.'
        signals={binarySignals}
      />

                    <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Notícias relevantes ({news.length})</h2>
{news.length === 0 ? (
                <p style={styles.empty}>
            Nenhuma notícia em cache ainda. O cron roda a cada hora, ou chame
             /api/news-cron manualmente pra forçar a primeira busca.
      </p>
         ) : (
                         <ul style={styles.newsList}>
               {news.slice(0, 20).map((n, i) => (
                             <li key={i} style={styles.newsItem}>
                               <div style={styles.newsTags}>
               {n.currencies.map((c) => (
                                         <span key={c} style={styles.newsTag}>
                     {c}
                     </span>
                                                   ))}
                   <span
                     style={{
                                                 ...styles.sentimentTag,
                                                 color: n.sentiment > 0 ? '#4ade80' : n.sentiment < 0 ? '#f87171' : '#9ca3af',
                     }}
                  >
{n.sentiment > 0 ? `+${n.sentiment}` : n.sentiment}
</span>
      </div>
                <a href={n.link} target="_blank" rel="noreferrer" style={styles.newsLink}>
{n.title}
      </a>
{n.reasoning ? <p style={styles.newsReasoning}>{n.reasoning}</p> : null}
      </li>
             ))}
</ul>
        )}
</section>
              </div>
  );
}

const styles = {
        page: {
                  minHeight: '100vh',
                  background: '#0b0d10',
                  color: '#e5e7eb',
                  fontFamily: "'Segoe UI', system-ui, sans-serif",
                  padding: '24px 32px',
        },
        header: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 16,
                  marginBottom: 32,
                  borderBottom: '1px solid #1f2937',
                  paddingBottom: 16,
        },
        title: { margin: 0, fontSize: 26 },
        subtitle: { margin: '4px 0 0', color: '#9ca3af', fontSize: 14 },
        headerRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 },
        refreshBtn: {
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontSize: 14,
        },
        lastUpdate: { fontSize: 12, color: '#6b7280' },
        section: { marginBottom: 40 },
        sectionTitle: { fontSize: 18, marginBottom: 12 },
        empty: { color: '#9ca3af', fontSize: 14 },
        tableWrap: { overflowX: 'auto', border: '1px solid #1f2937', borderRadius: 8 },
        table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
        th: {
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: '#111418',
                  borderBottom: '1px solid #1f2937',
                  color: '#9ca3af',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
        },
        td: {
                  padding: '10px 12px',
                  borderBottom: '1px solid #16191d',
                  whiteSpace: 'nowrap',
        },
        badge: {
                  padding: '3px 10px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
        },
        newsList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
        newsItem: {
                  border: '1px solid #1f2937',
                  borderRadius: 8,
                  padding: '10px 14px',
                  background: '#111418',
        },
        newsTags: { display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' },
        newsTag: {
                  background: '#1e293b',
                  color: '#93c5fd',
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 700,
        },
        sentimentTag: { fontSize: 12, fontWeight: 700, marginLeft: 'auto' },
        newsLink: { color: '#e5e7eb', textDecoration: 'none', fontSize: 14 },
        newsReasoning: { margin: '6px 0 0', fontSize: 12, color: '#7d8590', fontStyle: 'italic' },
};
