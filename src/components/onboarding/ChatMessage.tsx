'use client';

// Chat bubble. Editorial warm palette. Rich attachments (menu editor, color
// picker, launch CTA, uploaded files) render inline beneath the body text.

import { FileText, Check } from 'lucide-react';
import type { ChatMessage as Msg, ChatAttachment } from '@/lib/onboarding/types';
import { useOnboarding } from '@/lib/onboarding/store';
import { MenuEditor } from './MenuEditor';
import { ColorPicker } from './ColorPicker';

interface Props {
  msg: Msg;
  onLaunch?: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentTile({ a, mine }: { a: ChatAttachment; mine: boolean }) {
  if (a.type === 'image' && a.url) {
    return (
      <span className="ob-attach ob-attach--image" data-mine={mine || undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={a.name ?? 'lampiran'} />
      </span>
    );
  }
  return (
    <span className="ob-attach ob-attach--file" data-mine={mine || undefined}>
      <FileText className="h-4 w-4" aria-hidden="true" />
      <span className="ob-attach__meta">
        <span className="ob-attach__name">{a.name ?? 'Dokumen'}</span>
        <span className="ob-attach__sub">
          {a.mime === 'application/pdf' ? 'PDF' : (a.mime ?? 'File')}
          {a.size ? ` · ${formatBytes(a.size)}` : ''}
        </span>
      </span>
    </span>
  );
}

function LogoOptions({ logos }: { logos: string[] }) {
  const selected = useOnboarding((s) => s.draft.logo_url ?? null);
  const patchDraft = useOnboarding((s) => s.patchDraft);
  return (
    <div className="ob-logo-picker">
      {logos.map((url) => {
        const active = selected === url;
        return (
          <button
            key={url}
            type="button"
            onClick={() => patchDraft({ logo_url: url })}
            className="ob-logo-picker__tile"
            data-active={active || undefined}
            aria-pressed={active}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Opsi logo" />
            {active && (
              <span className="ob-logo-picker__check" aria-hidden="true">
                <Check className="h-4 w-4" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ChatMessage({ msg, onLaunch }: Props) {
  const mine = msg.role === 'user';
  const hasText = typeof msg.content === 'string' && msg.content.trim().length > 0;
  const attachments = msg.attachments ?? [];
  const logoOptions =
    msg.kind === 'logo_options' && msg.payload && typeof msg.payload === 'object'
      ? ((msg.payload as { logos?: unknown }).logos as string[] | undefined) ?? null
      : null;

  return (
    <div className={`ob-bubble-row ${mine ? 'ob-bubble-row--user' : 'ob-bubble-row--ai'}`}>
      <div
        className={`ob-bubble ${mine ? 'ob-bubble--user' : 'ob-bubble--ai'}`}
        data-media-only={!hasText && attachments.length > 0 || undefined}
      >
        {hasText && <span className="ob-bubble__text">{msg.content}</span>}

        {attachments.length > 0 && (
          <div className={`ob-bubble__attachments ${hasText ? 'ob-bubble__attachments--below' : ''}`}>
            {attachments.map((a, i) => (
              <AttachmentTile key={i} a={a} mine={mine} />
            ))}
          </div>
        )}

        {logoOptions && logoOptions.length > 0 && (
          <div className="ob-bubble__attach">
            <LogoOptions logos={logoOptions} />
          </div>
        )}

        {msg.kind === 'menu_extracted' && (
          <div className="ob-bubble__attach">
            <MenuEditor />
          </div>
        )}
        {msg.kind === 'colors_extracted' && (
          <div className="ob-bubble__attach">
            <ColorPicker />
          </div>
        )}
        {msg.kind === 'launch_ready' && onLaunch && (
          <button type="button" onClick={onLaunch} className="ob-launch-btn">
            Luncurkan toko kamu
          </button>
        )}
      </div>
    </div>
  );
}
