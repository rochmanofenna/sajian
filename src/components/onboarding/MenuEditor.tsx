'use client';

// Inline-editable menu. After AI extraction (or manual add) the owner sees
// categories + items as rows with editable name/price fields and a trash
// button per item. No modal — edits apply to the draft store directly.
//
// Items without an `image_url` get a "Buat foto AI" action on their
// placeholder thumb that fills in a DALL-E 3 generated photo. A batch
// button above the grid processes every photo-less item sequentially so
// restaurants without any photos can reach visual parity in one click.

import { useState } from 'react';
import { Plus, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { useOnboarding } from '@/lib/onboarding/store';
import type { CategoryDraft, MenuItemDraft } from '@/lib/onboarding/types';
import { formatCurrency } from '@/lib/utils';

export function MenuEditor() {
  const menu = useOnboarding((s) => s.draft.menu_categories ?? []);
  const setMenu = useOnboarding((s) => s.setMenu);
  const addItem = useOnboarding((s) => s.addItem);
  const removeItem = useOnboarding((s) => s.removeItem);
  const updateItem = useOnboarding((s) => s.updateItem);
  const setItemImage = useOnboarding((s) => s.setItemImage);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [generating, setGenerating] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);

  function addCategory() {
    if (!newCategoryName.trim()) return;
    const updated: CategoryDraft[] = [...menu, { name: newCategoryName.trim(), items: [] }];
    setMenu(updated);
    setNewCategoryName('');
  }

  async function generatePhoto(item: MenuItemDraft, categoryName: string): Promise<boolean> {
    setGenerating(item.name);
    try {
      const res = await fetch('/api/ai/generate-food-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: item.name,
          description: item.description,
          category: categoryName,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.image_url) {
        console.error('[menu] photo generation failed', body);
        return false;
      }
      await setItemImage(item.name, body.image_url);
      return true;
    } catch (err) {
      console.error('[menu] photo generation threw', err);
      return false;
    } finally {
      setGenerating(null);
    }
  }

  async function generateAllPhotos() {
    const pending: Array<{ item: MenuItemDraft; category: string }> = [];
    for (const cat of menu) {
      for (const item of cat.items) {
        if (!item.image_url) pending.push({ item, category: cat.name });
      }
    }
    if (pending.length === 0) return;
    setBatch({ done: 0, total: pending.length });
    for (let i = 0; i < pending.length; i += 1) {
      setBatch({ done: i, total: pending.length });
      await generatePhoto(pending[i].item, pending[i].category);
      // Pace the calls — OpenAI rate limits + sharp CPU + stop us nuking
      // the owner's monthly budget if they keep the tab open.
      await new Promise((r) => setTimeout(r, 400));
    }
    setBatch(null);
  }

  if (menu.length === 0) {
    return (
      <div className="text-sm text-zinc-500 py-4">
        Belum ada menu. Upload foto atau tambahkan manual.
      </div>
    );
  }

  const missingPhotos = menu.reduce(
    (acc, c) => acc + c.items.filter((i) => !i.image_url).length,
    0,
  );

  return (
    <div className="space-y-6">
      {missingPhotos > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#1B5E3B]/15 bg-white px-3 py-2 text-sm">
          <span className="text-zinc-600">
            {missingPhotos} item belum ada fotonya.
          </span>
          <button
            type="button"
            onClick={generateAllPhotos}
            disabled={batch !== null || generating !== null}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1B5E3B] text-white text-xs font-medium px-3 h-8 disabled:opacity-50"
          >
            {batch ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Foto {batch.done + 1}/{batch.total}…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Buat foto AI untuk semua
              </>
            )}
          </button>
        </div>
      )}

      {menu.map((cat) => (
        <div key={cat.name} className="rounded-xl border border-[#1B5E3B]/15 bg-white overflow-hidden">
          <div className="px-3 py-2 bg-[#1B5E3B]/5 font-semibold text-sm">{cat.name}</div>
          <ul className="divide-y divide-[#1B5E3B]/10">
            {cat.items.map((item) => {
              const busy = generating === item.name;
              return (
                <li key={item.name} className="flex items-center gap-2 px-3 py-2">
                  <PhotoSlot
                    item={item}
                    busy={busy}
                    onGenerate={() => generatePhoto(item, cat.name)}
                    disabled={batch !== null}
                  />
                  <input
                    defaultValue={item.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== item.name) updateItem(item.name, 'name', v);
                    }}
                    className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-[#1B5E3B]/30 rounded px-1"
                  />
                  <input
                    defaultValue={item.price}
                    inputMode="numeric"
                    onBlur={(e) => {
                      const v = parseInt(e.target.value.replace(/\D/g, ''), 10);
                      if (!Number.isNaN(v) && v !== item.price) updateItem(item.name, 'price', v);
                    }}
                    className="w-24 bg-transparent text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#1B5E3B]/30 rounded px-1"
                    aria-label={`Harga ${item.name}`}
                  />
                  <span className="text-xs text-zinc-400 w-12 text-right">
                    {formatCurrency(item.price, 'Rp ', 'id-ID').replace('Rp ', '')}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.name)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                    aria-label={`Hapus ${item.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <AddItemRow category={cat.name} onAdd={addItem} />
        </div>
      ))}

      <div className="flex gap-2">
        <input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="Tambah kategori baru…"
          className="flex-1 h-9 px-3 rounded-lg border border-[#1B5E3B]/20 bg-white text-sm"
        />
        <button
          type="button"
          onClick={addCategory}
          className="h-9 px-3 rounded-lg bg-[#1B5E3B] text-white text-sm font-medium"
        >
          Tambah
        </button>
      </div>
    </div>
  );
}

function PhotoSlot({
  item,
  busy,
  disabled,
  onGenerate,
}: {
  item: MenuItemDraft;
  busy: boolean;
  disabled?: boolean;
  onGenerate: () => void;
}) {
  if (item.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.image_url}
        alt=""
        className="h-10 w-10 rounded-md object-cover flex-shrink-0"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onGenerate}
      disabled={busy || disabled}
      aria-label={`Buat foto AI untuk ${item.name}`}
      title="Buat foto AI"
      className="h-10 w-10 rounded-md bg-[#1B5E3B]/10 flex-shrink-0 flex items-center justify-center text-[#1B5E3B] hover:bg-[#1B5E3B]/15 transition disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
    </button>
  );
}

function AddItemRow({
  category,
  onAdd,
}: {
  category: string;
  onAdd: (cat: string, item: { name: string; description: string; price: number; tags?: string[] }) => void;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  function submit() {
    const p = parseInt(price.replace(/\D/g, ''), 10);
    if (!name.trim() || Number.isNaN(p)) return;
    onAdd(category, { name: name.trim(), description: '', price: p, tags: [] });
    setName('');
    setPrice('');
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-dashed border-[#1B5E3B]/10 bg-[#1B5E3B]/[0.02]">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nama item…"
        className="flex-1 min-w-0 h-8 px-2 rounded border border-[#1B5E3B]/15 bg-white text-sm"
      />
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Harga"
        inputMode="numeric"
        className="w-24 h-8 px-2 rounded border border-[#1B5E3B]/15 bg-white text-sm text-right"
      />
      <button
        type="button"
        onClick={submit}
        className="h-8 w-8 rounded-full bg-[#1B5E3B] text-white flex items-center justify-center"
        aria-label="Tambah item"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
