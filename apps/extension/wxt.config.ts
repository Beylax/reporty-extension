import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

const api = new URL(process.env.WXT_API_URL ?? 'http://localhost:3000');
const apiMatch = `${api.protocol}//${api.hostname}/*`;

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Reporty',
    description: 'Revisioni e segnalazioni per siti e app web',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: [apiMatch],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    externally_connectable: { matches: [apiMatch] },
  },
});
