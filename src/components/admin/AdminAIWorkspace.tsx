'use client';

// Split-screen AI live-ops: chat on the left, real storefront iframe on
// the right. When the chat applies a mutation we reload the iframe so the
// owner sees the change land on the actual page their customers will see.

import { useRef, useState } from 'react';
import { Smartphone, Monitor, RefreshCw, ExternalLink } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { AdminChat } from './AdminChat';

type Device = 'phone' | 'desktop';

export function AdminAIWorkspace({ tenant }: { tenant: PublicTenant }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<Device>('phone');
  const [reloadKey, setReloadKey] = useState(0);

  function reloadPreview() {
    // Bump the key to force a clean remount — cheaper than talking to the
    // iframe's contentWindow and avoids cross-origin quirks.
    setReloadKey((k) => k + 1);
  }

  // Admin lives on the same origin as the storefront (tenant subdomain),
  // so an absolute '/' loads the public page without any URL juggling.
  const previewSrc = `/?preview=admin&t=${reloadKey}`;

  return (
    <div className="ai-split">
      <div className="ai-split__chat">
        <AdminChat tenant={tenant} onAfterMutate={reloadPreview} fill />
      </div>

      <div className="ai-split__preview">
        <div className="ai-split__topbar">
          <div className="ai-split__label">
            <span className="ai-split__dot" aria-hidden="true" />
            Live storefront
          </div>
          <div className="ai-split__actions">
            <div className="ai-split__toggle" role="tablist">
              <button
                type="button"
                data-active={device === 'phone'}
                onClick={() => setDevice('phone')}
              >
                <Smartphone className="h-3 w-3" aria-hidden="true" />
                <span>Phone</span>
              </button>
              <button
                type="button"
                data-active={device === 'desktop'}
                onClick={() => setDevice('desktop')}
              >
                <Monitor className="h-3 w-3" aria-hidden="true" />
                <span>Desktop</span>
              </button>
            </div>
            <button
              type="button"
              className="ai-split__icon-btn"
              onClick={reloadPreview}
              aria-label="Reload preview"
              title="Reload"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="ai-split__icon-btn"
              aria-label="Buka toko di tab baru"
              title="Buka di tab baru"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className={`ai-split__device ai-split__device--${device}`}>
          {device === 'phone' && (
            <span className="ai-split__speaker" aria-hidden="true" />
          )}
          {device === 'desktop' && (
            <div className="ai-split__chrome" aria-hidden="true">
              <span className="ai-split__tl ai-split__tl--r" />
              <span className="ai-split__tl ai-split__tl--y" />
              <span className="ai-split__tl ai-split__tl--g" />
              <span className="ai-split__url">{tenant.slug}.sajian.app</span>
            </div>
          )}
          <iframe
            ref={iframeRef}
            key={reloadKey}
            src={previewSrc}
            title="Storefront preview"
            className="ai-split__frame"
          />
        </div>
      </div>
    </div>
  );
}
