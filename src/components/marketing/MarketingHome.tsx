'use client';

// sajian.app root landing. Editorial warm palette (cream + ink + ochre +
// banana-leaf green), Fraunces display / Plus Jakarta Sans body / JetBrains
// Mono details. English-primary with an ID toggle. Every section reveals on
// scroll; the header compacts on scroll; the cluster marquee loops slowly.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LanguageProvider, useLang } from '@/lib/i18n/LanguageProvider';
import { PhoneMockup } from './PhoneMockup';
import { Reveal } from './Reveal';

export function MarketingHome() {
  return (
    <LanguageProvider initial="en">
      <MarketingShell />
    </LanguageProvider>
  );
}

function MarketingShell() {
  return (
    <div className="sj-marketing">
      <BackdropDecor />
      <Header />
      <Hero />
      <Pullquote />
      <HowItWorks />
      <Features />
      <LiveDemo />
      <ClusterTeaser />
      <SiteFooter />
    </div>
  );
}

function Pullquote() {
  const { t } = useLang();
  return (
    <Reveal as="section" className="sj-pullquote">
      <p>{t('pullquote')}</p>
    </Reveal>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Header
// ──────────────────────────────────────────────────────────────────────────

function Header() {
  const { t } = useLang();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="sj-header" data-scrolled={scrolled ? 'true' : 'false'}>
      <div className="sj-header__row">
        <Link href="/" className="sj-wordmark" aria-label="Sajian">
          Sajian<span className="sj-wordmark__dot">.</span>
        </Link>

        <nav className="sj-nav" aria-label="Primary">
          <a href="#how">{t('nav_how')}</a>
          <a href="#features">{t('nav_features')}</a>
          <a href="#demo">{t('nav_demo')}</a>
        </nav>

        <div className="sj-header__side">
          <LanguageToggle />
          <Link href="/signup" className="sj-btn sj-btn--primary sj-btn--sm">
            {t('cta_primary')}
            <Arrow />
          </Link>
        </div>
      </div>
    </header>
  );
}

function LanguageToggle() {
  const { lang, setLang, t } = useLang();
  return (
    <div className="sj-lang" role="group" aria-label="Language">
      <button
        type="button"
        data-active={lang === 'en'}
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
      >
        {t('lang_en')}
      </button>
      <span aria-hidden="true">/</span>
      <button
        type="button"
        data-active={lang === 'id'}
        onClick={() => setLang('id')}
        aria-pressed={lang === 'id'}
      >
        {t('lang_id')}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Hero
// ──────────────────────────────────────────────────────────────────────────

function Hero() {
  const { t } = useLang();

  return (
    <section className="sj-hero">
      <div className="sj-hero__grid">
        <div className="sj-hero__copy">
          <div className="sj-marker">
            <span className="sj-marker__dot" aria-hidden="true" />
            <span>{t('hero_marker')}</span>
          </div>

          <h1 className="sj-display">
            <span className="sj-display__line" style={{ animationDelay: '80ms' }}>
              {t('hero_line_1')}
            </span>
            <span className="sj-display__line" style={{ animationDelay: '220ms' }}>
              {t('hero_line_2')}{' '}
              <em className="sj-display__italic">{t('hero_line_3')}</em>
            </span>
          </h1>

          <p className="sj-hero__sub">{t('hero_sub')}</p>

          <div className="sj-hero__cta">
            <Link href="/signup" className="sj-btn sj-btn--primary">
              {t('cta_primary')}
              <Arrow />
            </Link>
            <a href="https://mindiology.sajian.app" className="sj-btn sj-btn--ghost">
              {t('cta_secondary')}
            </a>
          </div>

          <div className="sj-hero__proof">
            <span className="sj-hero__pulse" aria-hidden="true" />
            <span>{t('hero_proof')}</span>
          </div>
        </div>

        <div className="sj-hero__stage">
          <PhoneMockup />
        </div>
      </div>

      <div className="sj-hero__rules" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// How it works
// ──────────────────────────────────────────────────────────────────────────

function HowItWorks() {
  const { t } = useLang();
  const steps = [
    { num: t('how_1_num'), title: t('how_1_title'), body: t('how_1_body') },
    { num: t('how_2_num'), title: t('how_2_title'), body: t('how_2_body') },
    { num: t('how_3_num'), title: t('how_3_title'), body: t('how_3_body') },
  ];

  return (
    <section id="how" className="sj-section sj-how">
      <Reveal className="sj-section__head">
        <div className="sj-eyebrow">{t('how_eyebrow')}</div>
        <h2 className="sj-h2">{t('how_title')}</h2>
      </Reveal>

      <ol className="sj-steps">
        {steps.map((s, i) => (
          <Reveal as="article" className="sj-step" key={s.num} delay={i * 120}>
            <div className="sj-step__num">{s.num}</div>
            <div className="sj-step__body">
              <h3 className="sj-step__title">{s.title}</h3>
              <p className="sj-step__copy">{s.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Features (bento)
// ──────────────────────────────────────────────────────────────────────────

function Features() {
  const { t } = useLang();

  const tiles: Array<{ key: string; kicker: string; title: string; body: string; size?: 'wide' | 'tall' | 'box' }> = [
    { key: '1', kicker: t('feat_1_kicker'), title: t('feat_1_title'), body: t('feat_1_body'), size: 'wide' },
    { key: '2', kicker: t('feat_2_kicker'), title: t('feat_2_title'), body: t('feat_2_body'), size: 'box' },
    { key: '3', kicker: t('feat_3_kicker'), title: t('feat_3_title'), body: t('feat_3_body'), size: 'tall' },
    { key: '4', kicker: t('feat_4_kicker'), title: t('feat_4_title'), body: t('feat_4_body'), size: 'box' },
    { key: '5', kicker: t('feat_5_kicker'), title: t('feat_5_title'), body: t('feat_5_body'), size: 'box' },
    { key: '6', kicker: t('feat_6_kicker'), title: t('feat_6_title'), body: t('feat_6_body'), size: 'wide' },
  ];

  return (
    <section id="features" className="sj-section sj-features">
      <Reveal className="sj-section__head">
        <div className="sj-eyebrow">{t('feat_eyebrow')}</div>
        <h2 className="sj-h2">{t('feat_title')}</h2>
      </Reveal>

      <div className="sj-bento">
        {tiles.map((tile, i) => (
          <Reveal as="article" className={`sj-tile sj-tile--${tile.size}`} key={tile.key} delay={i * 60}>
            <div className="sj-tile__kicker">{tile.kicker}</div>
            <h3 className="sj-tile__title">{tile.title}</h3>
            <p className="sj-tile__body">{tile.body}</p>
            <div className="sj-tile__rule" aria-hidden="true" />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Live demo
// ──────────────────────────────────────────────────────────────────────────

function LiveDemo() {
  const { t } = useLang();
  return (
    <section id="demo" className="sj-section sj-demo">
      <Reveal className="sj-demo__frame">
        <div className="sj-eyebrow sj-eyebrow--light">{t('demo_eyebrow')}</div>
        <h2 className="sj-h2 sj-h2--inverse">{t('demo_title')}</h2>
        <p className="sj-demo__body">{t('demo_body')}</p>
        <a href="https://mindiology.sajian.app" className="sj-demo__link">
          <span className="sj-demo__link-label">{t('demo_link_label')}</span>
          <span className="sj-demo__link-cta">
            {t('cta_visit_mindiology')}
            <Arrow />
          </span>
        </a>
      </Reveal>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Cluster teaser
// ──────────────────────────────────────────────────────────────────────────

function ClusterTeaser() {
  const { t } = useLang();
  const marquee = t('cluster_marquee');

  return (
    <section className="sj-section sj-cluster">
      <Reveal className="sj-cluster__head">
        <div className="sj-eyebrow">{t('cluster_eyebrow')}</div>
        <h2 className="sj-h2">{t('cluster_title')}</h2>
        <p className="sj-cluster__body">{t('cluster_body')}</p>
        <a href={`mailto:${t('footer_email')}`} className="sj-btn sj-btn--primary">
          {t('cluster_cta')}
          <Arrow />
        </a>
      </Reveal>

      <div className="sj-marquee" aria-hidden="true">
        <div className="sj-marquee__track">
          <span>{marquee}</span>
          <span>{marquee}</span>
          <span>{marquee}</span>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Footer
// ──────────────────────────────────────────────────────────────────────────

function SiteFooter() {
  const { t } = useLang();
  return (
    <footer className="sj-footer">
      <div className="sj-footer__row">
        <div className="sj-footer__mark">
          <div className="sj-wordmark sj-wordmark--xl">
            Sajian<span className="sj-wordmark__dot">.</span>
          </div>
          <p className="sj-footer__tag">{t('footer_tag')}</p>
        </div>
        <div className="sj-footer__col">
          <div className="sj-eyebrow">{t('footer_contact')}</div>
          <a href={`mailto:${t('footer_email')}`} className="sj-footer__link">
            {t('footer_email')}
          </a>
        </div>
      </div>
      <div className="sj-footer__legal">{t('footer_legal')}</div>
    </footer>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Decorative backdrop + small primitives
// ──────────────────────────────────────────────────────────────────────────

function BackdropDecor() {
  return (
    <div className="sj-backdrop" aria-hidden="true">
      <div className="sj-backdrop__grain" />
      <div className="sj-backdrop__glow sj-backdrop__glow--a" />
      <div className="sj-backdrop__glow sj-backdrop__glow--b" />
    </div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" className="sj-arrow" aria-hidden="true">
      <path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
