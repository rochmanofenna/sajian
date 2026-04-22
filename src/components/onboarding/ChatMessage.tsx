'use client';

// Renders one chat message. Text by default; `kind` + `payload` unlock rich
// inline widgets so the AI can hand the user an editable menu, a color
// palette, or a launch button without leaving the conversation.

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
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
          mine
            ? 'bg-[#1B5E3B] text-white rounded-br-md'
            : 'bg-white text-[#1A1A18] border border-[#1B5E3B]/10 rounded-bl-md'
        }`}
      >
        {msg.content}

        {msg.kind === 'menu_extracted' && (
          <div className="mt-3">
            <MenuEditor />
          </div>
        )}
        {msg.kind === 'colors_extracted' && (
          <div className="mt-3">
            <ColorPicker />
          </div>
        )}
        {msg.kind === 'launch_ready' && onLaunch && (
          <button
            type="button"
            onClick={onLaunch}
            className="mt-3 w-full h-10 rounded-full bg-[#C9A84C] text-[#1A1A18] font-semibold"
          >
            🚀 Go Live
          </button>
        )}
      </div>
    </div>
  );
}
