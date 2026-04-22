// Post-launch screen. Shows the live URL + QR code. The slug comes in as a
// query param from /api/onboarding/launch redirect. We re-check auth here
// so a stale link can't display someone else's QR.

import Link from 'next/link';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

interface Props {
  searchParams: Promise<{ slug?: string }>;
}

export default async function LaunchPage({ searchParams }: Props) {
  const { slug } = await searchParams;
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect('/signup');
  if (!slug) redirect('/setup');

  const domain = process.env.PLATFORM_DOMAIN ?? 'sajian.app';
  const liveUrl = `https://${slug}.${domain}`;
  const qrPng = `/api/onboarding/qr?slug=${encodeURIComponent(slug)}&format=png`;
  const qrSvg = `/api/onboarding/qr?slug=${encodeURIComponent(slug)}&format=svg`;

  return (
    <div className="max-w-lg mx-auto px-4 py-10 text-center">
      <div className="text-5xl mb-2">🚀</div>
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Restoran kamu LIVE!</h1>
      <p className="text-zinc-600 mb-8">
        Pelanggan kamu sekarang bisa pesan di{' '}
        <a
          href={liveUrl}
          target="_blank"
          rel="noreferrer"
          className="underline text-[#1B5E3B] font-medium"
        >
          {slug}.{domain}
        </a>
      </p>

      <div className="bg-white border border-[#1B5E3B]/20 rounded-2xl p-6 mb-6 inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSvg} alt="QR code" className="h-64 w-64" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <a
          href={qrPng}
          className="h-11 px-5 rounded-full bg-[#1B5E3B] text-white font-medium inline-flex items-center justify-center"
        >
          📥 Download QR (PNG)
        </a>
        <Link
          href="/setup"
          className="h-11 px-5 rounded-full border border-[#1B5E3B]/25 text-[#1B5E3B] font-medium inline-flex items-center justify-center"
        >
          Kembali ke setup
        </Link>
      </div>

      <p className="mt-8 text-xs text-zinc-500">
        Share link <strong>{liveUrl}</strong> ke WhatsApp kamu supaya pelanggan langsung bisa pesan.
      </p>
    </div>
  );
}
