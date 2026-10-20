import base44 from '@base44/vite-plugin';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// Rebeca Hub 3.0 (nuvem) — sem React, sem framework.
//
// ATENÇÃO ao `root`: o index.html está em public/, por isso o Vite trata public/
// como a raiz do projeto. Sem o `envDir` abaixo, ele procuraria o .env.local
// DENTRO de public/ e o id do app nunca seria encontrado — foi um defeito real:
// o build passava, mas avisava que o VITE_BASE44_APP_ID não estava definido.
export default defineConfig(({ mode }) => {
  const raiz = fileURLToPath(new URL('.', import.meta.url));
  const env = loadEnv(mode, raiz, 'VITE_');

  // O plugin do Base44 lê o id de `process.env`, não do .env do Vite. Sem esta
  // linha ele avisa "VITE_BASE44_APP_ID is not set" mesmo com o .env.local certo
  // (o valor acabava por ser injectado, mas o aviso e o `base44 build` ficavam
  // inconsistentes). Aqui as duas vias passam a ver o mesmo.
  if (env.VITE_BASE44_APP_ID && !process.env.VITE_BASE44_APP_ID) {
    process.env.VITE_BASE44_APP_ID = env.VITE_BASE44_APP_ID;
  }
  if (env.VITE_BASE44_FUNCTIONS_VERSION && !process.env.VITE_BASE44_FUNCTIONS_VERSION) {
    process.env.VITE_BASE44_FUNCTIONS_VERSION = env.VITE_BASE44_FUNCTIONS_VERSION;
  }
  if (env.VITE_BASE44_APP_BASE_URL && !process.env.VITE_BASE44_APP_BASE_URL) {
    process.env.VITE_BASE44_APP_BASE_URL = env.VITE_BASE44_APP_BASE_URL;
  }

  return {
    root: 'public',
    publicDir: false,
    // Os ficheiros .env ficam na raiz do projeto, não em public/.
    envDir: raiz,
    resolve: {
      alias: {
        // A página importa o cliente como '@/base44Client' (o mesmo padrão do 2.0).
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    plugins: [
      base44({
        hmrNotifier: false,
        navigationNotifier: false,
        analyticsTracker: false,
        visualEditAgent: false,
      }),
    ],
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      open: true,
    },
  };
});