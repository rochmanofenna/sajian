'use client';

// Editorial "share your store" card. Renders the public storefront URL,
// a one-tap copy button, a WhatsApp share shortcut, and a downloadable QR
// poster. Used as the Pesanan empty state so a brand-new restaurant owner
// has an obvious next step instead of a blank page.

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, MessageCircle } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';

export function ShareCard({ tenant }: { tenant: PublicTenant }) {
  const [copied, setCopied] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const url =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${tenant.slug}.sajian.app`
      : `https://${tenant.slug}.sajian.app`;

  useEffect(() => {
    QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      width: 220,
      color: { dark: tenant.colors.primary, light: '#00000000' },
    })
      .then(setQrSvg)
      .catch(() => setQrSvg(null));
  }, [url, tenant.colors.primary]);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* no-op */
    }
  }

  async function downloadPoster() {
    // Render a 1080×1350 poster (IG-friendly) to canvas, drop the QR in the
    // middle, drop tenant name + url below. Export as PNG.
    const canvas = canvasRef.current ?? document.createElement('canvas');
    const W = 1080;
    const H = 1350;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = tenant.colors.background ?? '#F4EDE0';
    ctx.fillRect(0, 0, W, H);

    // Decorative dotted rule
    ctx.strokeStyle = tenant.colors.dark ?? '#0A0B0A';
    ctx.setLineDash([8, 10]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 110);
    ctx.lineTo(W - 80, 110);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(80, H - 110);
    ctx.lineTo(W - 80, H - 110);
    ctx.stroke();
    ctx.setLineDash([]);

    // Kicker
    ctx.fillStyle = tenant.colors.primary ?? '#1B5E3B';
    ctx.font = '600 24px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PESAN ONLINE · SCAN QR', W / 2, 170);

    // Title
    ctx.fillStyle = tenant.colors.dark ?? '#0A0B0A';
    ctx.font = '500 88px "Fraunces", serif';
    ctx.fillText(tenant.name, W / 2, 290);

    if (tenant.tagline) {
      ctx.font = 'italic 36px "Fraunces", serif';
      ctx.fillStyle = (tenant.colors.dark ?? '#0A0B0A') + 'B0';
      ctx.fillText(tenant.tagline, W / 2, 360);
    }

    // QR — render via offscreen SVG → image
    const svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 0,
      width: 620,
      color: { dark: tenant.colors.dark ?? '#0A0B0A', light: '#FFFFFF00' },
    });
    const img = new Image();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const qrUrl = URL.createObjectURL(blob);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('qr image failed'));
      img.src = qrUrl;
    });
    const qrSize = 620;
    ctx.drawImage(img, (W - qrSize) / 2, 430, qrSize, qrSize);
    URL.revokeObjectURL(qrUrl);

    // URL
    ctx.font = '500 32px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = tenant.colors.primary ?? '#1B5E3B';
    ctx.fillText(`${tenant.slug}.sajian.app`, W / 2, H - 170);

    // Footer
    ctx.font = '400 20px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = (tenant.colors.dark ?? '#0A0B0A') + '88';
    ctx.fillText('Dibuat dengan Sajian · sajian.app', W / 2, H - 60);

    const href = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = href;
    a.download = `${tenant.slug}-poster.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(
    `Pesan ${tenant.name} online: ${url}`,
  )}`;

  return (
    <div className="sc">
      <div className="sc__kicker">menunggu pesanan pertama</div>
      <h1 className="sc__title">
        Belum ada pesanan — <em>yet</em>.
      </h1>
      <p className="sc__lede">
        Bagikan link toko ke pelanggan. Scan QR di cover, tempel di etalase, kirim ke grup WA RT/RW —
        satu klik buat mulai nerima pesanan.
      </p>

      <div className="sc__grid">
        <div className="sc__qr" aria-label="QR code untuk storefront">
          {qrSvg ? (
            <div className="sc__qr-frame" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          ) : (
            <div className="sc__qr-frame sc__qr-frame--empty">
              <span>QR…</span>
            </div>
          )}
          <div className="sc__qr-caption">{tenant.slug}.sajian.app</div>
        </div>

        <div className="sc__actions">
          <div className="sc__url">
            <span className="sc__url-label">link toko</span>
            <div className="sc__url-row">
              <code className="sc__url-code">{url.replace(/^https?:\/\//, '')}</code>
              <button
                type="button"
                onClick={copyUrl}
                className="sc__copy"
                aria-label="Salin link"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'tersalin' : 'salin'}</span>
              </button>
            </div>
          </div>

          <div className="sc__cta-group">
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="sc__cta sc__cta--primary"
              style={{ background: tenant.colors.primary }}
            >
              <MessageCircle className="h-4 w-4" />
              Share ke WhatsApp
            </a>
            <button type="button" onClick={downloadPoster} className="sc__cta sc__cta--ghost">
              <Download className="h-4 w-4" />
              Download poster QR
            </button>
          </div>

          <p className="sc__tip">
            <span className="sc__tip-kicker">tips</span>
            Cetak posternya di kertas A4, tempel di kasir, meja, dan pintu masuk. Pelanggan yang pertama kali pesan biasanya dari QR fisik.
          </p>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}
