# Trade Signals Bot (protótipo)

Sistema de sinais para Forex: recebe alertas técnicos do TradingView, cruza com o
contexto de notícias de mercado, mostra tudo num dashboard HTML e manda aviso no
Telegram. **Não executa ordens** — só te avisa, você decide e opera manualmente.

_Aviso: isto é uma ferramenta de apoio informativo, não é recomendação de
investimento. O viés de notícias é calculado por palavras-chave simples, não
por um modelo sofisticado — trate como um filtro a mais, não como verdade
absoluta. Ajuste e valide antes de confiar 100% nos sinais._

## Como funciona

1. **TradingView** roda um indicador (veja `pine-script-example.pine`) e dispara um
2.    alerta com um JSON quando EMA9 cruza EMA21 (+ filtro de RSI).
3.2. O alerta chama `/api/webhook` no seu projeto Vercel.
  3. O webhook pega o sinal técnico, olha o cache de notícias (atualizado a cada
  4.    hora por `/api/news-cron`) e calcula se as notícias **confirmam** ou pedem
  5.   **atenção** ao sinal.
  6.   4. O resultado é salvo (Upstash Redis) e:
       5.    - aparece na tabela em `/` (o dashboard HTML);
             -    - é enviado como mensagem pro seu Telegram.
              
                  - ## Estrutura
              
                  - ```
                    lib/kv.js          -> armazenamento (Upstash Redis, com fallback em memória p/ dev local)
                    lib/news.js        -> busca RSS de notícias forex + sentimento por palavra-chave
                    lib/telegram.js     -> envio de mensagem no Telegram
                    lib/signals.js      -> junta sinal técnico + notícias, decide status, salva e notifica
                    pages/api/webhook.js    -> recebe alerta do TradingView
                    pages/api/news-cron.js  -> roda de hora em hora (cron da Vercel), atualiza notícias
                    pages/api/signals.js    -> endpoint usado pelo dashboard pra dar refresh
                    pages/index.js          -> dashboard HTML (tabela de sinais + feed de notícias)
                    pine-script-example.pine -> indicador de exemplo pra gerar os alertas
                    ```

                    ## Feeds de notícia usados

                    - `investing.com/rss/news_1.rss` — Forex News
                    - - `investing.com/rss/news_11.rss` — Commodities & Futures (cobre ouro/XAU)
                      - - `fxstreet.com/rss/news` — FXStreet Forex & Commodities News
                       
                        - Todos testados e ativos em 2026-07-01. Se algum parar de funcionar no futuro,
                        - troque a lista `FEEDS` em `lib/news.js`.
                       
                        - ## Passo a passo para colocar no ar
                       
                        - ### 1. Criar o bot no Telegram
                        - 1. Fale com **@BotFather** no Telegram → `/newbot` → siga as instruções.
                          2. 2. Guarde o **token** que ele te dá (`TELEGRAM_BOT_TOKEN`).
                             3. 3. Mande qualquer mensagem pro seu bot recém-criado.
                                4. 4. Acesse `https://api.telegram.org/bot<SEU_TOKEN>/getUpdates` no navegador e
                                   5.    pegue o valor de `"chat":{"id": ...}` — esse número é o `TELEGRAM_CHAT_ID`.
                                  
                                   6.### 2. Subir o projeto na Vercel
                                   1. Suba esta pasta num repositório no GitHub (ou use `vercel` CLI direto).
                                   2. 2. No [vercel.com](https://vercel.com), **New Project** → importe o repositório.
                                      3. 3. Antes de clicar em Deploy (ou depois, em Settings > Environment Variables),
                                         4.    configure as variáveis abaixo.
                                        
                                         5.### 3. Criar o banco de dados (Upstash Redis)
                                         A Vercel KV antiga foi descontinuada — hoje o caminho é Upstash Redis.
                                         1. No projeto na Vercel: **Storage** → **Marketplace Database Providers** → **Upstash**
                                         2.    (Redis) → criar e conectar ao projeto. A Vercel injeta `KV_REST_API_URL` e
                                         3.   `KV_REST_API_TOKEN` sozinha.
                                         4.   2. Alternativa sem passar pela Vercel: crie uma conta grátis em
                                              3.    [upstash.com](https://upstash.com), crie um banco Redis, e copie a
                                              4.   "REST URL" e o "REST Token" para as variáveis `KV_REST_API_URL` e
                                              5.      `KV_REST_API_TOKEN`.
                                           
                                              6.  ### 4. Variáveis de ambiente (Settings > Environment Variables)
                                              7.  ```
                                                  TELEGRAM_BOT_TOKEN=...       (do passo 1)
                                                  TELEGRAM_CHAT_ID=...         (do passo 1)
                                                  WEBHOOK_SECRET=escolha-uma-senha-forte
                                                  WATCHED_PAIRS=EURUSD,USDJPY,GBPUSD,EURJPY,USDCAD,USDNOK,USDBRL,XAUUSD
                                                  ```
                                                  (`KV_REST_API_URL` e `KV_REST_API_TOKEN` já vêm do passo 3.)

                                                  ### 5. Configurar o alerta no TradingView
                                                  1. Abra o gráfico do par (ex: EURUSD), aba **Pine Editor**, cole o conteúdo de
                                                  2.    `pine-script-example.pine`, clique **Add to Chart**.
                                                  3.2. Clique direito no gráfico → **Add Alert**.
                                                    3. Em **Condition**, escolha o indicador → "Sinal de COMPRA" (crie outro alerta
                                                    4.    igual para "Sinal de VENDA").
                                                    5.4. Em **Webhook URL**, cole `https://SEU-PROJETO.vercel.app/api/webhook`.
                                                      5. O campo **Message** já vem preenchido pelo `alertcondition` do script — só
                                                         troque `SEU_SEGREDO_AQUI` pelo mesmo valor que você colocou em
                                                         `WEBHOOK_SECRET`.
                                                      6. Repita para cada par que você acompanha (EURUSD, USDJPY, GBPUSD, EURJPY,
                                                         USDCAD, USDNOK, USDBRL, XAUUSD).

                                                      ### 5.1 Entrada, Take Profit e Stop Loss
                                                  O indicador agora calcula, além do sinal, o **ponto de entrada** (preço de
                                                  fechamento do candle do sinal) e um **Take Profit**/**Stop Loss** baseados no
                                                  ATR (volatilidade recente do par) — por padrão SL = 1.5x ATR e TP = 2.5x ATR
                                                  (relação de risco:retorno de ~1:1.67). Esses valores aparecem:
                                                  - no gráfico, como marcadores (círculo verde = TP, círculo vermelho = SL) no
                                                  -   candle do sinal;
                                                  -   - na mensagem do alerta (`entry`, `takeProfit`, `stopLoss`), que o webhook
                                                      -   repassa pro dashboard e pro Telegram.
                                                   
                                                      -   Pra ajustar a distância do SL/TP: clique no engrenagem do indicador no gráfico
                                                      -   e mude "Stop Loss (x ATR)" / "Take Profit (x ATR)". Isso só muda o cálculo
                                                      -   pra frente — não recalcula sinais antigos.
                                                   
                                                      -   ### 6. Primeira carga de notícias
                                                      -   Assim que o deploy subir, chame uma vez manualmente para não esperar 1h pelo
                                                      -   cron:
                                                      -   ```
                                                          curl https://SEU-PROJETO.vercel.app/api/news-cron
                                                          ```

                                                          ### 7. Testar o webhook manualmente
                                                          ```bash
                                                          curl -X POST https://SEU-PROJETO.vercel.app/api/webhook \
                                                            -H "Content-Type: application/json" \
                                                            -d '{"secret":"SUA_SENHA","pair":"EURUSD","action":"buy","price":1.1423,"entry":1.1423,"takeProfit":1.1490,"stopLoss":1.1385,"strategy":"teste manual"}'
                                                          ```
                                                          Se der certo: aparece na tabela do dashboard e chega mensagem no Telegram.

                                                          ## Rodando localmente (opcional, pra testar antes de subir)
                                                          ```bash
                                                          npm install
                                                          npm run dev
                                                          ```
                                                          Sem `KV_REST_API_URL`/`KV_REST_API_TOKEN` configurados, os dados ficam só em
                                                          memória (somem ao reiniciar) — serve só pra ver a interface funcionando.
                                                          Já testei localmente (build + webhook + dashboard) e está tudo funcionando.

                                                          ## O que ajustar daqui pra frente (vamos iterando)
                                                          - Trocar o critério técnico (EMA9x21+RSI) por outra estratégia sua.
                                                          - - Adicionar mais feeds de notícia ou trocar por uma API paga com sentimento
                                                            -   mais preciso (ex: usando IA em vez de palavras-chave).
                                                            -   - Adicionar filtro de calendário econômico (ex: não confirmar sinal em horário
                                                                -   de notícia de alto impacto).
                                                                -   - Adicionar histórico de acerto (quantos sinais "confirmados" realmente foram
                                                                    -   na direção certa) pra medir a qualidade do robô com o tempo.
                                                                    -   - Trocar/ajustar os pares em `WATCHED_PAIRS` e nos `alertcondition` do Pine Script.
                                                                        - 
