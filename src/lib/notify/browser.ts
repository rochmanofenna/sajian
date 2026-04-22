'use client';

// Browser notifications + chime for the /admin order feed. Owner opts in
// via the 🔔 toggle or the first-visit banner; preference persists in
// localStorage so we never re-prompt. Chime is synthesized via Web Audio —
// no mp3 asset needed, works offline.

import { useEffect, useState } from 'react';

const LS_KEY = 'sajian-notifications-enabled';
const CHANGE_EVENT = 'sajian:notif-pref-changed';

export type NotifPref = 'yes' | 'no' | 'unset';

export function getNotifPref(): NotifPref {
  if (typeof window === 'undefined') return 'unset';
  const raw = localStorage.getItem(LS_KEY);
  if (raw === 'yes' || raw === 'no') return raw;
  return 'unset';
}

function setNotifPrefLS(pref: 'yes' | 'no') {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEY, pref);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function getPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function canNotify(): boolean {
  return getPermission() === 'granted' && getNotifPref() === 'yes';
}

export async function enableNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }
  setNotifPrefLS(perm === 'granted' ? 'yes' : 'no');
  return perm;
}

export function disableNotifications() {
  setNotifPrefLS('no');
}

export function useNotifPref(): {
  pref: NotifPref;
  permission: NotificationPermission | 'unsupported';
  enable: () => Promise<NotificationPermission | 'unsupported'>;
  disable: () => void;
  active: boolean;
} {
  const [pref, setPref] = useState<NotifPref>('unset');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');

  useEffect(() => {
    const refresh = () => {
      setPref(getNotifPref());
      setPermission(getPermission());
    };
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return {
    pref,
    permission,
    enable: enableNotifications,
    disable: disableNotifications,
    active: permission === 'granted' && pref === 'yes',
  };
}

interface NotifyArgs {
  title: string;
  body: string;
  tag: string;
}

export function sendNotification({ title, body, tag }: NotifyArgs) {
  if (!canNotify()) return;
  try {
    const n = new Notification(title, {
      body,
      tag,
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (err) {
    console.warn('[notify] failed to create Notification:', err);
  }
}

// Two-tone chime: D5 → A5, ~500ms with gentle envelope. Created fresh each
// call so we can bounce across tabs without needing a resume gesture (first
// call after any user gesture unlocks the AudioContext).
export function playChime() {
  if (typeof window === 'undefined') return;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch (err) {
    console.warn('[notify] chime failed:', err);
  }
}
