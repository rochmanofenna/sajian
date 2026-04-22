// GET  /api/admin/chat/history — load the owner's AI-tab chat transcript.
// PUT  /api/admin/chat/history — replace the transcript (send the full
//                                 messages array; we debounce client-side so
//                                 this isn't called on every keystroke).
// DELETE /api/admin/chat/history — reset chat (the "Mulai ulang" button).
//
// Scoped per (tenant_id, user_id) — a future co-owner sharing the same
// tenant gets their own transcript. Service client writes through RLS
// because requireOwnerOrThrow already verified ownership.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnerOrThrow } from '@/lib/admin/auth';
import { errorResponse, badRequest } from '@/lib/api/errors';
import { createServiceClient } from '@/lib/supabase/service';

const messageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  kind: z.enum(['text', 'error']).optional(),
});

const putSchema = z.object({
  messages: z.array(messageSchema).max(200),
});

export async function GET() {
  try {
    const { tenant, userId } = await requireOwnerOrThrow();
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('admin_chat_history')
      .select('messages, updated_at')
      .eq('tenant_id', tenant.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({
      messages: data?.messages ?? [],
      updated_at: data?.updated_at ?? null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const { tenant, userId } = await requireOwnerOrThrow();
    const parsed = putSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('admin_chat_history')
      .upsert({
        tenant_id: tenant.id,
        user_id: userId,
        messages: parsed.data.messages,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  try {
    const { tenant, userId } = await requireOwnerOrThrow();
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('admin_chat_history')
      .delete()
      .eq('tenant_id', tenant.id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
