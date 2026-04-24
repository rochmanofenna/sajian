// Marketing-site translations. Small enough to live as a flat dict; no
// runtime i18n library. Keys are flat and shared between EN and ID — add a
// key to `en` first, the type system will enforce `id` parity.

export const messages = {
  en: {
    // Nav
    nav_how: 'How it works',
    nav_features: 'Features',
    nav_demo: 'See it live',
    nav_login: 'Log in',
    nav_logout: 'Sign out',
    nav_dashboard: 'Open dashboard',
    nav_resume_setup: 'Resume setup',

    // CTAs
    cta_primary: 'Create your store',
    cta_secondary: 'See a live store',
    cta_visit_mindiology: 'Visit Mindiology',

    // Hero
    hero_marker: 'Est. 2026 · Jakarta',
    hero_line_1: 'Your restaurant,',
    hero_line_2: 'online in',
    hero_line_3: 'fifteen minutes.',
    hero_sub:
      'AI-powered ordering pages for Indonesian F&B. Upload your menu photos. Your customers order and pay directly. No aggregator commissions, no coding.',
    hero_proof: 'Live now at Mindiology Coffee, Bintaro — and counting.',

    // Pull-quote between hero and how-it-works
    pullquote: '0% commission. Payments go straight to your bank.',

    // Phone mockup labels
    mock_url: 'mindiology.sajian.app',
    mock_greeting: 'Good morning.',
    mock_branch: 'Emerald · Bintaro',
    mock_item_1: 'Kopi Susu Gula Aren',
    mock_item_2: 'Croffle Original',
    mock_item_3: 'Cakwe Avocado',
    mock_add: 'Tambah',
    mock_cart: '3 items · Rp 75.000',

    // How it works
    how_eyebrow: 'The workflow',
    how_title: 'Three moves. One restaurant online.',
    how_1_num: '01',
    how_1_title: 'Snap your menu.',
    how_1_body:
      'A printed menu, a PDF, a drawer full of photos. Our vision model reads every item, every price, every modifier. You edit anything the model got wrong by talking to it.',
    how_2_num: '02',
    how_2_title: 'AI builds the store.',
    how_2_body:
      'Brand colours pulled from a storefront photo. A logo generated from your name and vibe. Operating hours, categories, delivery radius — handled. You watch it assemble in real time.',
    how_3_num: '03',
    how_3_title: 'Accept orders.',
    how_3_body:
      'Live at your-name.sajian.app in minutes. Customers order from their phone, pay with QRIS or e-wallets, the order lands on your dashboard. You manage from the same phone.',

    // Features
    feat_eyebrow: 'What you get',
    feat_title: 'Tools F&B owners actually asked for.',
    feat_1_kicker: 'Feature 01',
    feat_1_title: 'POS-native, out of the box.',
    feat_1_body:
      'Direct ESB integration. Orders print at your stations like any other channel — without handing 25% of your margin to an aggregator.',
    feat_2_kicker: 'Feature 02',
    feat_2_title: 'Menu OCR that understands Indonesian.',
    feat_2_body:
      '"25rb", "25.000", "Rp25K" — all the same number to us. Handles mixed scripts, poor lighting, rotated pages, 100-item PDFs.',
    feat_3_kicker: 'Feature 03',
    feat_3_title: 'QRIS and e-wallets, direct.',
    feat_3_body:
      'Customers pay with any banking app that scans QRIS — which is all of them. DANA, OVO, GoPay, ShopeePay supported. Your settlement, your bank, your margin.',
    feat_4_kicker: 'Feature 04',
    feat_4_title: 'Live orders on your phone.',
    feat_4_body:
      'Realtime order feed. Tap to confirm, tap to mark ready. No laptop, no second device, no training.',
    feat_5_kicker: 'Feature 05',
    feat_5_title: 'Your brand, your subdomain.',
    feat_5_body:
      'nasi-bu-tini.sajian.app with your logo, your colours, your photos. Print the QR, stick it on every table.',
    feat_6_kicker: 'Feature 06',
    feat_6_title: 'Built for food halls.',
    feat_6_body:
      'One QR at the entrance. Every vendor in the market. One cart, many kitchens. Designed with Fresh Market in mind.',

    // Demo section
    demo_eyebrow: 'Proof',
    demo_title: 'Don’t trust the marketing.',
    demo_body:
      'Tap through an actual restaurant running on Sajian. Real menu, real prices, real ESB integration printing tickets at Bintaro Emerald.',
    demo_link_label: 'mindiology.sajian.app',

    // Cluster teaser
    cluster_eyebrow: 'Coming to',
    cluster_title: 'Fresh Market Emerald Bintaro.',
    cluster_body:
      'One QR at the market entrance. Every vendor, one basket, many kitchens. If you run a stall, talk to us — the first cohort launches for free.',
    cluster_cta: 'Get in touch',
    cluster_marquee: 'nasi goreng · sate · misoa · bakpao · kopi susu · roti bakar · gado-gado · rendang · soto ayam · mie ayam · cakwe · es kopi',

    // Footer
    footer_tag: 'Restaurant OS for Indonesia.',
    footer_contact: 'Talk to us',
    footer_whatsapp: 'WhatsApp',
    footer_email: 'hello@sajian.app',
    footer_legal: '© 2026 Sajian. Built in Jakarta.',

    // Language toggle labels
    lang_en: 'EN',
    lang_id: 'ID',
  },

  id: {
    nav_how: 'Cara kerja',
    nav_features: 'Fitur',
    nav_demo: 'Lihat langsung',
    nav_login: 'Masuk',
    nav_logout: 'Keluar',
    nav_dashboard: 'Buka dashboard',
    nav_resume_setup: 'Lanjut setup',

    cta_primary: 'Buat toko kamu',
    cta_secondary: 'Lihat toko live',
    cta_visit_mindiology: 'Kunjungi Mindiology',

    hero_marker: 'Didirikan 2026 · Jakarta',
    hero_line_1: 'Restoran kamu,',
    hero_line_2: 'online dalam',
    hero_line_3: 'lima belas menit.',
    hero_sub:
      'Halaman pemesanan AI untuk F&B Indonesia. Upload foto menu kamu. Pelanggan pesan dan bayar langsung. Tanpa komisi aggregator, tanpa coding.',
    hero_proof: 'Sudah live di Mindiology Coffee, Bintaro — dan terus bertambah.',

    pullquote: '0% komisi. Pembayaran langsung ke rekening kamu.',

    mock_url: 'mindiology.sajian.app',
    mock_greeting: 'Selamat pagi.',
    mock_branch: 'Emerald · Bintaro',
    mock_item_1: 'Kopi Susu Gula Aren',
    mock_item_2: 'Croffle Original',
    mock_item_3: 'Cakwe Avocado',
    mock_add: 'Tambah',
    mock_cart: '3 item · Rp 75.000',

    how_eyebrow: 'Alurnya',
    how_title: 'Tiga langkah. Satu restoran online.',
    how_1_num: '01',
    how_1_title: 'Foto menu kamu.',
    how_1_body:
      'Menu cetak, PDF, atau folder foto di HP. Vision model kami baca setiap item, setiap harga, setiap modifier. Koreksi apa pun dengan cara ngobrol biasa.',
    how_2_num: '02',
    how_2_title: 'AI bikin tokonya.',
    how_2_body:
      'Warna brand dari foto depan toko. Logo otomatis dari nama & gaya kamu. Jam buka, kategori, radius delivery — semua otomatis. Kamu lihat prosesnya real-time.',
    how_3_num: '03',
    how_3_title: 'Langsung terima pesanan.',
    how_3_body:
      'Live di nama-kamu.sajian.app dalam hitungan menit. Pelanggan pesan dari HP, bayar pakai QRIS atau e-wallet, order masuk ke dashboard kamu. Dikelola dari HP yang sama.',

    feat_eyebrow: 'Yang kamu dapat',
    feat_title: 'Tools yang memang diminta pemilik F&B.',
    feat_1_kicker: 'Fitur 01',
    feat_1_title: 'POS-native, langsung jalan.',
    feat_1_body:
      'Integrasi langsung ke ESB. Order print di station kamu kayak channel lain — tanpa kehilangan 25% margin ke aggregator.',
    feat_2_kicker: 'Fitur 02',
    feat_2_title: 'OCR menu yang ngerti Indonesia.',
    feat_2_body:
      '"25rb", "25.000", "Rp25K" — semua sama buat kami. Bisa baca tulisan campur, foto redup, halaman miring, PDF 100-item.',
    feat_3_kicker: 'Fitur 03',
    feat_3_title: 'QRIS dan e-wallet, langsung ke kamu.',
    feat_3_body:
      'Pelanggan bayar pakai banking app apa pun yang scan QRIS — berarti semua. DANA, OVO, GoPay, ShopeePay support. Settlement ke rekening kamu, bukan middleman.',
    feat_4_kicker: 'Fitur 04',
    feat_4_title: 'Order live di HP kamu.',
    feat_4_body:
      'Feed order realtime. Tap konfirmasi, tap tandai siap. Tanpa laptop, tanpa device kedua, tanpa training.',
    feat_5_kicker: 'Fitur 05',
    feat_5_title: 'Brand kamu, URL kamu.',
    feat_5_body:
      'nasi-bu-tini.sajian.app dengan logo, warna, foto kamu. Print QR, tempel di setiap meja.',
    feat_6_kicker: 'Fitur 06',
    feat_6_title: 'Dirancang buat food hall.',
    feat_6_body:
      'Satu QR di pintu masuk. Semua vendor di dalam pasar. Satu keranjang, banyak dapur. Dirancang khusus untuk Fresh Market.',

    demo_eyebrow: 'Bukti',
    demo_title: 'Jangan percaya marketing.',
    demo_body:
      'Klik dan rasakan langsung restoran yang beneran jalan di Sajian. Menu asli, harga asli, integrasi ESB yang beneran print tiket di Bintaro Emerald.',
    demo_link_label: 'mindiology.sajian.app',

    cluster_eyebrow: 'Segera di',
    cluster_title: 'Fresh Market Emerald Bintaro.',
    cluster_body:
      'Satu QR di pintu masuk pasar. Semua vendor, satu keranjang, banyak dapur. Kalau kamu pemilik stall, kontak kami — cohort pertama launching gratis.',
    cluster_cta: 'Hubungi kami',
    cluster_marquee: 'nasi goreng · sate · misoa · bakpao · kopi susu · roti bakar · gado-gado · rendang · soto ayam · mie ayam · cakwe · es kopi',

    footer_tag: 'Restaurant OS untuk Indonesia.',
    footer_contact: 'Kontak kami',
    footer_whatsapp: 'WhatsApp',
    footer_email: 'hello@sajian.app',
    footer_legal: '© 2026 Sajian. Dibangun di Jakarta.',

    lang_en: 'EN',
    lang_id: 'ID',
  },
} as const;

export type Lang = keyof typeof messages;
export type MessageKey = keyof typeof messages.en;
