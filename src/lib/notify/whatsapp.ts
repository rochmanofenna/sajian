// WhatsApp notifications via Fonnte. Phase 1 is a console.log stub; Phase 2
// swaps in the real API call.
//
// Ryan: no Fonnte account yet — treat this as a TODO. Keep the function
// signature stable so the swap is a one-file change.

export type WhatsAppTemplate = 'order_received' | 'order_ready' | 'cashier_qr_reminder';

interface SendOpts {
  phone: string; // E.164 format with +, e.g. +6281234567890
  template: WhatsAppTemplate;
  data: Record<string, string | number>;
}

export async function sendWhatsApp({ phone, template, data }: SendOpts): Promise<void> {
  // TODO(phase-2): wire up Fonnte. For now just log so we can verify the
  // order-submit path is calling this.
  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    console.log(`[whatsapp:stub] template=${template} → ${phone}`, data);
    return;
  }

  // Placeholder for when the token is available.
  // const res = await fetch('https://api.fonnte.com/send', {
  //   method: 'POST',
  //   headers: { Authorization: token, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ target: phone, message: renderTemplate(template, data) }),
  // });
  console.log(`[whatsapp:unimpl] template=${template} → ${phone}`, data);
}
