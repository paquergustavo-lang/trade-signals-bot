import { Redis } from '@upstash/redis';

// So usa o Redis de verdade (Upstash, via integracao da Vercel Marketplace ou
// conta direta em upstash.com) se as credenciais estiverem configuradas.
// Sem elas (ex: rodando "npm run dev" local sem configurar nada), cai num
// armazenamento em memoria - so serve pra testar o dashboard localmente,
// nao mantem dado entre deploys/execucoes serverless.
const hasKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const redis = hasKv
  ? new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })
  : null;

const memoryStore = new Map();

const memoryKv = {
  async get(key) {
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  },
  async set(key, value) {
    memoryStore.set(key, value);
    return 'OK';
  },
};

const redisKv = {
  get: (key) => redis.get(key),
  set: (key, value) => redis.set(key, value),
};

export const kv = hasKv ? redisKv : memoryKv;
export const kvReady = hasKv;
