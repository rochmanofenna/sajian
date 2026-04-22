'use client';

// Chat bubble. Editorial warm palette. Rich attachments (menu editor, color
// picker, launch CTA) render inline beneath the body text.

import type { ChatMessage as Msg } from '@/lib/onboarding/types';
import { MenuEditor } from './MenuEditor';
import { ColorPicker } from './ColorPicker';

interface Props {
  msg: Msg;
  onLaunch?: () => void;
}

export function ChatMessage({ msg, onLaunch }: Props) {
  const mine = msg.role === 'user';
  return (
    <div className={`ob-bubble-row ${mine ? 'ob-bubble-row--user' : 'ob-bubble-row--ai'}`}>
      <div className={`ob-bubble ${mine ? 'ob-bubble--user' : 'ob-bubble--ai'}`}>
        <span className="ob-bubble__text">{msg.content}</span>

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
            🚀 Luncurkan toko kamu
          </button>
        )}
      </div>
    </div>
  );
}
