// Cliente Base44 do Rebeca Hub 3.0.
//
// O `appId` vem da variável VITE_BASE44_APP_ID (ficheiro .env.local). O token
// de acesso é gerido pelo próprio SDK — a app pode ser pública ou exigir sessão,
// conforme a configuração do app na Base44.
import { createClient, getAccessToken } from '@base44/sdk';

const appId = import.meta.env.VITE_BASE44_APP_ID;

if (!appId) {
  // Falha cedo e com uma mensagem clara: sem appId não há funções de nuvem.
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
});
