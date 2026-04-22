'use client';

// Live menu editor for sajian_native tenants. Lists every category + its
// items with full inline CRUD:
//   · name / description / price — click to edit, save on blur or Enter
//   · availability — tap toggle
//   · image — tap thumbnail → file picker → uploads to Storage
//   · delete — trash icon with confirm
//   · category reorder — up/down arrows in header
//   · add item / add category — inline disclosure forms
// ESB tenants render read-only.

import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  ImageOff,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { formatCurrency } from '@/lib/utils';

interface Item {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  items: Item[];
}

interface MenuResponse {
  readonly: boolean;
  categories: Category[];
  orphaned: Item[];
}

export function MenuEditor({ tenant }: { tenant: PublicTenant }) {
  const [data, setData] = useState<MenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    reload().catch(() => {
      /* handled in reload */
    });
    async function reload() {
      try {
        const res = await fetch('/api/admin/menu');
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Gagal memuat menu');
        setData(body as MenuResponse);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat menu…
      </div>
    );
  }
  if (error) return <div className="text-red-600 py-4">{error}</div>;
  if (!data) return null;

  if (data.readonly) {
    return (
      <div className="max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
        Menu tenant ini disinkronisasi dari ESB. Edit menu langsung di portal ESB — perubahan akan muncul di sini otomatis.
      </div>
    );
  }

  function replaceItem(itemId: string, next: Item | null) {
    setData((cur) => {
      if (!cur) return cur;
      return {
        ...cur,
        categories: cur.categories.map((c) => ({
          ...c,
          items:
            next === null
              ? c.items.filter((it) => it.id !== itemId)
              : c.items.map((it) => (it.id === itemId ? next : it)),
        })),
      };
    });
  }

  function appendItem(catId: string, item: Item) {
    setData((cur) => {
      if (!cur) return cur;
      return {
        ...cur,
        categories: cur.categories.map((c) =>
          c.id === catId ? { ...c, items: [...c.items, item] } : c,
        ),
      };
    });
  }

  function replaceCategory(catId: string, next: Category | null) {
    setData((cur) => {
      if (!cur) return cur;
      if (next === null) {
        return { ...cur, categories: cur.categories.filter((c) => c.id !== catId) };
      }
      return {
        ...cur,
        categories: cur.categories.map((c) => (c.id === catId ? { ...c, ...next } : c)),
      };
    });
  }

  function reorderCategory(catId: string, direction: -1 | 1) {
    setData((cur) => {
      if (!cur) return cur;
      const idx = cur.categories.findIndex((c) => c.id === catId);
      const swap = idx + direction;
      if (idx < 0 || swap < 0 || swap >= cur.categories.length) return cur;
      const next = [...cur.categories];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return { ...cur, categories: next };
    });
  }

  function appendCategory(cat: Category) {
    setData((cur) => (cur ? { ...cur, categories: [...cur.categories, cat] } : cur));
  }

  return (
    <div className="space-y-8">
      {data.categories.length === 0 && (
        <div className="text-sm text-zinc-500">
          Belum ada kategori. Tambah yang pertama di bawah.
        </div>
      )}

      {data.categories.map((cat, idx) => (
        <CategorySection
          key={cat.id}
          tenant={tenant}
          cat={cat}
          first={idx === 0}
          last={idx === data.categories.length - 1}
          onReorder={(dir) => {
            reorderCategory(cat.id, dir);
            // Persist the swap; server-side sort_order gets recomputed from
            // the new adjacent category's position.
            const neighbourIdx = data.categories.findIndex((c) => c.id === cat.id) + dir;
            const neighbour = data.categories[neighbourIdx];
            if (!neighbour) return;
            Promise.all([
              patchCategory(cat.id, { sort_order: neighbour.sort_order }),
              patchCategory(neighbour.id, { sort_order: cat.sort_order }),
            ]).catch((e) => alert((e as Error).message));
          }}
          onRename={async (name) => {
            const prev = cat.name;
            replaceCategory(cat.id, { ...cat, name });
            try {
              await patchCategory(cat.id, { name });
            } catch (e) {
              replaceCategory(cat.id, { ...cat, name: prev });
              alert((e as Error).message);
            }
          }}
          onDelete={async () => {
            if (
              !confirm(
                `Hapus kategori "${cat.name}" beserta ${cat.items.length} item di dalamnya? Aksi ini tidak bisa dibatalkan.`,
              )
            ) {
              return;
            }
            const snapshot = cat;
            replaceCategory(cat.id, null);
            try {
              const res = await fetch(`/api/admin/categories/${cat.id}`, { method: 'DELETE' });
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? 'Gagal hapus kategori');
              }
            } catch (e) {
              appendCategory(snapshot);
              alert((e as Error).message);
            }
          }}
          onPatchItem={async (item, changes) => {
            const prev = { ...item };
            const optimistic = { ...item, ...changes };
            replaceItem(item.id, optimistic);
            try {
              const updated = await patchItem(item.id, changes);
              replaceItem(item.id, { ...optimistic, ...updated });
            } catch (e) {
              replaceItem(item.id, prev);
              alert((e as Error).message);
            }
          }}
          onDeleteItem={async (item) => {
            if (!confirm(`Hapus "${item.name}" dari menu?`)) return;
            const snapshot = item;
            replaceItem(item.id, null);
            try {
              const res = await fetch(`/api/admin/menu/${item.id}`, { method: 'DELETE' });
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? 'Gagal hapus item');
              }
            } catch (e) {
              appendItem(cat.id, snapshot);
              alert((e as Error).message);
            }
          }}
          onUploadImage={async (item, file) => {
            const fd = new FormData();
            fd.append('photo', file);
            const res = await fetch(`/api/admin/menu/${item.id}/image`, { method: 'POST', body: fd });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body.error ?? 'Gagal upload foto');
            }
            const { item: updated } = await res.json();
            replaceItem(item.id, updated as Item);
          }}
          onRemoveImage={async (item) => {
            const res = await fetch(`/api/admin/menu/${item.id}/image`, { method: 'DELETE' });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body.error ?? 'Gagal hapus foto');
            }
            replaceItem(item.id, { ...item, image_url: null });
          }}
          onAddItem={async (input) => {
            const res = await fetch('/api/admin/menu', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...input, category_id: cat.id }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? 'Gagal tambah item');
            appendItem(cat.id, body.item as Item);
          }}
        />
      ))}

      <AddCategoryForm
        tenant={tenant}
        onAdd={async (name) => {
          const res = await fetch('/api/admin/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? 'Gagal tambah kategori');
          appendCategory({ ...(body.category as Category), items: [] });
        }}
      />

      {data.orphaned.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2 text-amber-700">
            Tanpa kategori · {data.orphaned.length} item
          </h2>
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 divide-y divide-amber-200">
            {data.orphaned.map((it) => (
              <div key={it.id} className="px-4 py-2 text-sm text-amber-900">
                {it.name} · {formatCurrency(it.price, tenant.currency_symbol, tenant.locale)}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

async function patchItem(id: string, changes: Partial<Item>): Promise<Partial<Item>> {
  const res = await fetch(`/api/admin/menu/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? 'Gagal update');
  return body.item as Partial<Item>;
}

async function patchCategory(id: string, changes: Partial<Category>) {
  const res = await fetch(`/api/admin/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Gagal update kategori');
  }
}

// ─── CategorySection ─────────────────────────────────────────────────────

interface CategorySectionProps {
  tenant: PublicTenant;
  cat: Category;
  first: boolean;
  last: boolean;
  onReorder: (dir: -1 | 1) => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onPatchItem: (item: Item, changes: Partial<Item>) => Promise<void>;
  onDeleteItem: (item: Item) => Promise<void>;
  onUploadImage: (item: Item, file: File) => Promise<void>;
  onRemoveImage: (item: Item) => Promise<void>;
  onAddItem: (input: { name: string; price: number; description?: string }) => Promise<void>;
}

function CategorySection({
  tenant,
  cat,
  first,
  last,
  onReorder,
  onRename,
  onDelete,
  onPatchItem,
  onDeleteItem,
  onUploadImage,
  onRemoveImage,
  onAddItem,
}: CategorySectionProps) {
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(cat.name);
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <header className="flex items-center gap-2 mb-3">
        {renaming ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const next = nameInput.trim();
              if (next && next !== cat.name) await onRename(next);
              setRenaming(false);
            }}
            className="flex items-center gap-2 flex-1"
          >
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={async () => {
                const next = nameInput.trim();
                if (next && next !== cat.name) await onRename(next);
                setRenaming(false);
              }}
              className="h-9 px-3 rounded-lg border border-zinc-300 text-base font-semibold flex-1 max-w-sm"
            />
          </form>
        ) : (
          <button
            onClick={() => {
              setNameInput(cat.name);
              setRenaming(true);
            }}
            className="text-lg font-semibold hover:underline decoration-dotted underline-offset-4"
            style={{ color: tenant.colors.primary }}
          >
            {cat.name}
          </button>
        )}
        <span className="text-xs text-zinc-400">{cat.items.length} item</span>

        <div className="ml-auto flex items-center gap-1">
          <IconBtn
            aria-label="Pindah ke atas"
            disabled={first}
            onClick={() => onReorder(-1)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            aria-label="Pindah ke bawah"
            disabled={last}
            onClick={() => onReorder(1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            aria-label="Hapus kategori"
            onClick={onDelete}
            danger
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </header>

      <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100 bg-white">
        {cat.items.length === 0 && (
          <div className="text-sm text-zinc-400 italic px-4 py-3">Kategori kosong</div>
        )}
        {cat.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            tenant={tenant}
            onPatch={(changes) => onPatchItem(item, changes)}
            onDelete={() => onDeleteItem(item)}
            onUploadImage={(file) => onUploadImage(item, file)}
            onRemoveImage={() => onRemoveImage(item)}
          />
        ))}
        <div className="px-3 py-2">
          {adding ? (
            <AddItemForm
              tenant={tenant}
              onCancel={() => setAdding(false)}
              onSubmit={async (input) => {
                await onAddItem(input);
                setAdding(false);
              }}
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 h-9 px-3 rounded-lg"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah item
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── ItemRow ────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: Item;
  tenant: PublicTenant;
  onPatch: (changes: Partial<Item>) => Promise<void>;
  onDelete: () => Promise<void>;
  onUploadImage: (file: File) => Promise<void>;
  onRemoveImage: () => Promise<void>;
}

function ItemRow({ item, tenant, onPatch, onDelete, onUploadImage, onRemoveImage }: ItemRowProps) {
  const [nameEditing, setNameEditing] = useState(false);
  const [nameInput, setNameInput] = useState(item.name);
  const [descEditing, setDescEditing] = useState(false);
  const [descInput, setDescInput] = useState(item.description ?? '');
  const [priceEditing, setPriceEditing] = useState(false);
  const [priceInput, setPriceInput] = useState(String(item.price));
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function commitName() {
    const next = nameInput.trim();
    setNameEditing(false);
    if (next && next !== item.name) await onPatch({ name: next });
  }
  async function commitDesc() {
    const next = descInput.trim();
    setDescEditing(false);
    const prevDesc = item.description ?? '';
    if (next !== prevDesc) await onPatch({ description: next || null });
  }
  async function commitPrice() {
    setPriceEditing(false);
    const next = parseInt(priceInput, 10);
    if (Number.isFinite(next) && next >= 0 && next !== item.price) {
      await onPatch({ price: next });
    }
  }

  async function onFilePicked(file: File) {
    setUploading(true);
    try {
      await onUploadImage(file);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-start gap-3 px-3 py-3">
      {/* Thumbnail */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="relative h-14 w-14 rounded-lg border border-zinc-200 bg-zinc-50 overflow-hidden flex-shrink-0 group"
        aria-label="Ganti foto"
      >
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <span className="h-full w-full flex items-center justify-center text-zinc-300">
            <Camera className="h-5 w-5" />
          </span>
        )}
        {uploading && (
          <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          </span>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFilePicked(f);
        }}
      />

      <div className="flex-1 min-w-0">
        {/* Name */}
        {nameEditing ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              else if (e.key === 'Escape') {
                setNameInput(item.name);
                setNameEditing(false);
              }
            }}
            className="h-8 w-full px-2 rounded-md border border-zinc-300 text-sm font-medium"
          />
        ) : (
          <button
            onClick={() => {
              setNameInput(item.name);
              setNameEditing(true);
            }}
            className="text-left font-medium text-sm hover:underline decoration-dotted underline-offset-4 truncate block w-full"
          >
            {item.name}
          </button>
        )}

        {/* Description */}
        {descEditing ? (
          <textarea
            autoFocus
            value={descInput}
            onChange={(e) => setDescInput(e.target.value)}
            onBlur={commitDesc}
            rows={2}
            className="mt-1 w-full px-2 py-1 rounded-md border border-zinc-300 text-xs"
          />
        ) : (
          <button
            onClick={() => {
              setDescInput(item.description ?? '');
              setDescEditing(true);
            }}
            className="text-left text-xs text-zinc-500 hover:text-zinc-800 hover:underline decoration-dotted underline-offset-4 mt-0.5 line-clamp-2 w-full"
          >
            {item.description || <span className="italic">+ tambah deskripsi</span>}
          </button>
        )}

        {/* Image remove hint — only shown when image present */}
        {item.image_url && !uploading && (
          <button
            type="button"
            onClick={() => {
              if (confirm('Hapus foto menu item ini?')) onRemoveImage().catch((e) => alert((e as Error).message));
            }}
            className="text-[10px] text-zinc-400 hover:text-red-600 inline-flex items-center gap-1 mt-1"
          >
            <ImageOff className="h-3 w-3" />
            hapus foto
          </button>
        )}
      </div>

      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        {priceEditing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitPrice();
            }}
            className="flex items-center gap-1"
          >
            <input
              type="number"
              min={0}
              autoFocus
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              onBlur={commitPrice}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setPriceInput(String(item.price));
                  setPriceEditing(false);
                }
              }}
              className="h-8 w-24 px-2 rounded-md border border-zinc-300 text-sm"
            />
          </form>
        ) : (
          <button
            onClick={() => {
              setPriceInput(String(item.price));
              setPriceEditing(true);
            }}
            className="font-mono text-sm font-medium hover:underline decoration-dotted underline-offset-4"
            style={{ color: tenant.colors.primary }}
          >
            {formatCurrency(item.price, tenant.currency_symbol, tenant.locale)}
          </button>
        )}

        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[11px]">
            <input
              type="checkbox"
              checked={item.is_available}
              onChange={(e) => onPatch({ is_available: e.target.checked })}
              className="sr-only peer"
            />
            <span
              className="h-4 w-7 rounded-full bg-zinc-300 peer-checked:bg-emerald-500 relative transition"
              aria-hidden="true"
            >
              <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition peer-checked:translate-x-3" />
            </span>
            <span className="text-zinc-600 peer-checked:text-zinc-900 w-10">
              {item.is_available ? 'Ready' : 'Habis'}
            </span>
          </label>
          <IconBtn aria-label="Hapus item" onClick={onDelete} danger>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

// ─── AddItemForm ────────────────────────────────────────────────────────

interface AddItemInput {
  name: string;
  price: number;
  description?: string;
}

function AddItemForm({
  tenant,
  onCancel,
  onSubmit,
}: {
  tenant: PublicTenant;
  onCancel: () => void;
  onSubmit: (input: AddItemInput) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && Number.isFinite(parseInt(price, 10));

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSubmitting(true);
        setErr(null);
        try {
          await onSubmit({
            name: name.trim(),
            price: parseInt(price, 10),
            description: description.trim() || undefined,
          });
        } catch (e) {
          setErr((e as Error).message);
          setSubmitting(false);
        }
      }}
      className="flex flex-col gap-2 p-2 rounded-lg bg-zinc-50 border border-zinc-200"
    >
      <div className="flex gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama item"
          className="flex-1 h-9 px-3 rounded-md border border-zinc-300 text-sm"
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          type="number"
          min={0}
          placeholder="Harga"
          className="w-28 h-9 px-3 rounded-md border border-zinc-300 text-sm"
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Deskripsi (opsional)"
        className="h-8 px-3 rounded-md border border-zinc-300 text-xs"
      />
      {err && <div className="text-xs text-red-600">{err}</div>}
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs text-zinc-600 hover:bg-zinc-200"
        >
          <X className="h-3 w-3" />
          Batal
        </button>
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs text-white disabled:opacity-50"
          style={{ background: tenant.colors.primary }}
        >
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Simpan
        </button>
      </div>
    </form>
  );
}

// ─── AddCategoryForm ────────────────────────────────────────────────────

function AddCategoryForm({
  tenant,
  onAdd,
}: {
  tenant: PublicTenant;
  onAdd: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-dashed border-zinc-300 hover:border-zinc-400 text-sm text-zinc-600"
      >
        <Plus className="h-4 w-4" />
        Tambah kategori
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setSubmitting(true);
        setErr(null);
        try {
          await onAdd(name.trim());
          setName('');
          setOpen(false);
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setSubmitting(false);
        }
      }}
      className="flex items-center gap-2 p-2 rounded-xl bg-zinc-50 border border-zinc-200 max-w-md"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nama kategori baru"
        className="flex-1 h-9 px-3 rounded-md border border-zinc-300 text-sm"
      />
      {err && <div className="text-xs text-red-600">{err}</div>}
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName('');
        }}
        className="h-8 px-3 rounded-md text-xs text-zinc-600 hover:bg-zinc-200"
      >
        Batal
      </button>
      <button
        type="submit"
        disabled={!name.trim() || submitting}
        className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs text-white disabled:opacity-50"
        style={{ background: tenant.colors.primary }}
      >
        {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
        Simpan
      </button>
    </form>
  );
}

// ─── IconBtn ───────────────────────────────────────────────────────────

function IconBtn({
  children,
  onClick,
  disabled,
  danger,
  ...rest
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  ['aria-label']?: string;
}) {
  return (
    <button
      {...rest}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-7 w-7 rounded-md inline-flex items-center justify-center transition disabled:opacity-30 ${
        danger
          ? 'text-zinc-400 hover:text-red-600 hover:bg-red-50'
          : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
      }`}
    >
      {children}
    </button>
  );
}
