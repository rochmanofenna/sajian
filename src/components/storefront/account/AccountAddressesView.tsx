'use client';

// /akun/alamat — saved delivery addresses. Backed by
// customers.saved_addresses jsonb. Single-page CRUD with an inline
// dialog for edit + create; delete is immediate.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Trash2, Edit3 } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { PageNav } from '@/components/chrome/PageNav';

interface Address {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  address: string;
  note?: string | null;
}

export function AccountAddressesView({ tenant }: { tenant: PublicTenant }) {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [unauthed, setUnauthed] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/customer/addresses', { cache: 'no-store' });
      if (res.status === 401) {
        setUnauthed(true);
        return;
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Gagal memuat');
      setAddresses((body.addresses as Address[]) ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(addr: Omit<Address, 'id'> & { id?: string }) {
    setError(null);
    try {
      const res = await fetch('/api/customer/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addr),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Gagal simpan');
      setAddresses((body.addresses as Address[]) ?? []);
      setShowForm(false);
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/customer/addresses?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Gagal hapus');
      setAddresses((body.addresses as Address[]) ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const primary = tenant.colors.primary;

  if (unauthed) {
    return (
      <>
        <PageNav label="Alamat" backHref="/akun" />
        <div className="max-w-md mx-auto py-10 px-4 text-center">
          <Link
            href="/?login=1"
            className="inline-flex h-11 px-5 rounded-full text-white text-sm items-center"
            style={{ background: primary }}
          >
            Masuk
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageNav label="Alamat tersimpan" backHref="/akun" />
      <div className="max-w-md mx-auto px-4 py-6 space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {addresses === null ? (
          <div className="flex justify-center py-10 text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : addresses.length === 0 && !showForm ? (
          <div className="rounded-2xl border p-6 text-center text-sm text-zinc-500 bg-white">
            Belum ada alamat tersimpan.
          </div>
        ) : (
          addresses.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl border p-4 bg-white"
              style={{ borderColor: `${primary}18` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{a.label}</div>
                  <div className="text-xs text-zinc-500">
                    {a.recipient} · {a.phone}
                  </div>
                  <div className="text-sm mt-1">{a.address}</div>
                  {a.note && <div className="text-xs text-zinc-500 mt-1">{a.note}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(a);
                      setShowForm(true);
                    }}
                    aria-label="Edit"
                    className="h-8 w-8 rounded-full border border-zinc-200 flex items-center justify-center hover:bg-zinc-50"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    aria-label="Hapus"
                    className="h-8 w-8 rounded-full border border-zinc-200 flex items-center justify-center hover:bg-red-50 text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        {!showForm && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="w-full h-12 rounded-full border-2 border-dashed border-zinc-300 text-sm text-zinc-600 inline-flex items-center justify-center gap-2 hover:border-zinc-400"
          >
            <Plus className="h-4 w-4" />
            Tambah alamat
          </button>
        )}

        {showForm && (
          <AddressForm
            tenant={tenant}
            initial={editing}
            onCancel={() => {
              setShowForm(false);
              setEditing(null);
            }}
            onSave={save}
          />
        )}
      </div>
    </>
  );
}

function AddressForm({
  tenant,
  initial,
  onCancel,
  onSave,
}: {
  tenant: PublicTenant;
  initial: Address | null;
  onCancel: () => void;
  onSave: (addr: Omit<Address, 'id'> & { id?: string }) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [recipient, setRecipient] = useState(initial?.recipient ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [note, setNote] = useState(initial?.note ?? '');

  const primary = tenant.colors.primary;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          id: initial?.id,
          label: label.trim(),
          recipient: recipient.trim(),
          phone: phone.trim(),
          address: address.trim(),
          note: note.trim() || null,
        });
      }}
      className="rounded-2xl border p-4 bg-white space-y-3"
      style={{ borderColor: `${primary}25` }}
    >
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (Rumah, Kantor, …)"
        className="w-full h-11 px-4 rounded-full border border-zinc-200"
        required
      />
      <input
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder="Nama penerima"
        className="w-full h-11 px-4 rounded-full border border-zinc-200"
        required
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="No. WhatsApp penerima"
        className="w-full h-11 px-4 rounded-full border border-zinc-200"
        required
      />
      <textarea
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        rows={3}
        placeholder="Alamat lengkap + patokan"
        className="w-full px-4 py-3 rounded-2xl border border-zinc-200"
        required
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Catatan (opsional)"
        className="w-full px-4 py-3 rounded-2xl border border-zinc-200"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-11 rounded-full border border-zinc-200 text-sm"
        >
          Batal
        </button>
        <button
          type="submit"
          className="flex-1 h-11 rounded-full text-white text-sm font-medium"
          style={{ background: primary }}
        >
          Simpan
        </button>
      </div>
    </form>
  );
}
