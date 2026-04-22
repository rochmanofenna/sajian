// Root domain landing. Phase 1 stub — sells Sajian itself to restaurant owners.
// Phase 2 adds signup, pricing, demo video, case studies.

export function MarketingHome() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 bg-white">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900">
          Restaurant OS for Indonesia
        </h1>
        <p className="text-xl text-zinc-600">
          Launch a branded ordering app in 48 hours. AI-powered. POS-native. Built for F&amp;B owners who
          want out of the aggregator tax.
        </p>
        <div className="flex gap-4 justify-center pt-4">
          <a
            href="mailto:hello@sajian.app"
            className="inline-flex h-12 items-center px-8 rounded-full bg-zinc-900 text-white font-medium hover:bg-zinc-800"
          >
            Book a demo
          </a>
        </div>
        <p className="pt-8 text-sm text-zinc-500">
          Already a customer? Visit <span className="font-mono">your-slug.sajian.app</span>.
        </p>
      </div>
    </main>
  );
}
