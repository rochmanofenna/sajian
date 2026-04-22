'use client';

// Inline-editable menu. After AI extraction (or manual add) the owner sees
// categories + items as rows with editable name/price fields and a trash
// button per item. No modal — edits apply to the draft store directly.

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useOnboarding } from '@/lib/onboarding/store';
import type { CategoryDraft } from '@/lib/onboarding/types';
import { formatCurrency } from '@/lib/utils';

export function MenuEditor() {
  const menu = useOnboarding((s) => s.draft.menu_categories ?? []);
  const setMenu = useOnboarding((s) => s.setMenu);
  const addItem = useOnboarding((s) => s.addItem);
  const removeItem = useOnboarding((s) => s.removeItem);
  const updateItem = useOnboarding((s) => s.updateItem);

  const [newCategoryName, setNewCategoryName] = useState('');

  function addCategory() {
    if (!newCategoryName.trim()) return;
    const updated: CategoryDraft[] = [...menu, { name: newCategoryName.trim(), items: [] }];
    setMenu(updated);
    setNewCategoryName('');
  }

  if (menu.length === 0) {
    return (
      <div className="text-sm text-zinc-500 py-4">
        Belum ada menu. Upload foto atau tambahkan manual.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {menu.map((cat) => (
        <div key={cat.name} className="rounded-xl border border-[#1B5E3B]/15 bg-white overflow-hidden">
          <div className="px-3 py-2 bg-[#1B5E3B]/5 font-semibold text-sm">{cat.name}</div>
          <ul className="divide-y divide-[#1B5E3B]/10">
            {cat.items.map((item) => (
              <li key={item.name} className="flex items-center gap-2 px-3 py-2">
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
            ))}
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
