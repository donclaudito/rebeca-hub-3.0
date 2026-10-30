// Cliente Base44 do Rebeca Hub 3.0.
//
// O `appId` vem da variável VITE_BASE44_APP_ID (ficheiro .env.local) e, se ela
// faltar, cai no id fixo da app. Esse id NÃO é um segredo — é o mesmo que
// aparece no URL público da app — e tê-lo aqui evita a falha que aconteceu: um
// build feito sem .env.local publicava uma página que não arrancava.
import { createClient, getAccessToken } from '@base44/sdk';

const APP_ID_DE_RESERVA = '6acd249f4ace16d50aecdc9b';

const appId = import.meta.env.VITE_BASE44_APP_ID || APP_ID_DE_RESERVA;

if (!appId) {
  // Só acontece se o id de reserva for apagado: sem appId não há nuvem.
  throw new Error(
    'Falta o VITE_BASE44_APP_ID. Crie um ficheiro .env.local com a linha:\n' +
      'VITE_BASE44_APP_ID=o_id_do_seu_app',
  );
}

export const base44 = createClient({
  appId,
  token: getAccessToken(),
  functionsVersion: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION,
  serverUrl: '',
  appBaseUrl: import.meta.env.VITE_BASE44_APP_BASE_URL,
  // ANALYTICS DESLIGADO: o módulo de analytics do SDK pergunta "quem está"
  // (auth.me) de fundo, e num visitante sem conta isso é um
  // GET /entities/User/me -> 401 em cada carregamento (o vermelho na consola).
  // Esta app não precisa dessas estatísticas; com isto há menos pedidos e a
  // consola fica limpa. Para voltar a ligar: analytics: { enabled: true }.
  analytics: { enabled: false },
});

// Há sessão guardada? É só ver o token (não faz pedido nenhum). Serve para a
// app NÃO perguntar "quem está" quando não há ninguém — era outro 401 garantido
// a cada visita anónima.
export const temSessao = () => Boolean(getAccessToken());
