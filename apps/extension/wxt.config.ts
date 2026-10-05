import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

const api = new URL(process.env.WXT_API_URL ?? 'http://localhost:3000');
const apiMatch = `${api.protocol}//${api.hostname}/*`;

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
    // Content-script metadata is also bundled into browser code. Inline this
    // value there so evaluating matches never references Node's process global.
    define: { 'process.env.WXT_API_URL': JSON.stringify(api.origin) },
  }),
  manifest: {
    name: 'Reporty',
    description: 'Revisioni e segnalazioni per siti e app web',
    web_accessible_resources: [{ resources: ['brand/*.png'], matches: ['http://*/*', 'https://*/*'] }],
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: [apiMatch],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    externally_connectable: { matches: [apiMatch] },
  },
});
