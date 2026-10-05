import { shadowStyles } from '@/lib/shadow-styles';
import { ToastProvider } from '@/components/ui/toast';
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Site, Environment } from '@/lib/session';
import { ReviewOverlay } from '@/components/review-overlay';
import css from '@/entrypoints/popup/style.css?inline';

export default defineContentScript({
  matches: [], registration: 'runtime',
  main(ctx) {
    if (document.getElementById('reporty-overlay') || document.getElementById('reporty-widget')?.dataset.enabled === 'true') return;
    const host = document.createElement('div'); host.id = 'reporty-overlay';
    host.style.cssText = 'all:initial!important;display:block!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;font:14px/1.5 system-ui,sans-serif!important;direction:ltr!important;color-scheme:light!important';
    document.documentElement.append(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = shadowStyles(css);
    const mount = document.createElement('div'); shadow.append(style, mount);
    const root = createRoot(mount);
    let disposed = false;
    let refreshVersion = 0;
    async function refresh() {
      const version = ++refreshVersion;
      try {
        const response = await browser.runtime.sendMessage({ type: 'REPORTY_PAGE' });
        if (disposed || version !== refreshVersion) return;
        const data = response?.ok ? response.data as { site: Site; environment: Environment } | null : null;
        root.render(data ? React.createElement(ToastProvider, { children: React.createElement(ReviewOverlay, { ...data, host }) }) : null);
      } catch { if (!disposed && version === refreshVersion) root.render(null); }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    const listener = (message: { type?: string }, _sender: unknown, sendResponse: (response: { ok: boolean }) => void) => {
      if (message.type !== 'REPORTY_REFRESH') return;
      void refresh().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
      return true;
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => { disposed = true; clearInterval(timer); browser.runtime.onMessage.removeListener(listener); root.unmount(); host.remove(); });
  },
});
