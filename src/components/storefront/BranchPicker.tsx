// Asks the browser for coords, calls /api/branches?lat&lng, picks the closest
// open branch into the cart store. Falls back to tenant.fallback_coords if
// geolocation fails or is denied.

'use client';

import { useEffect, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import type { Tenant } from '@/lib/tenant';
import { useCart } from '@/lib/cart/store';

interface BranchOption {
  code: string;
  name: string;
  distanceKm?: number;
  isOpen?: boolean;
  supportsDineIn?: boolean;
  supportsTakeaway?: boolean;
}

export function BranchPicker({ tenant }: { tenant: Tenant }) {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const { branchCode, setBranch } = useCart();

  useEffect(() => {
    let cancelled = false;

    const resolve = async (lat: number, lng: number) => {
      try {
        const res = await fetch(`/api/branches?lat=${lat}&lng=${lng}`);
        if (!res.ok) throw new Error('branch lookup failed');
        const data = (await res.json()) as { branches: BranchOption[] };
        if (!cancelled) {
          setBranches(data.branches);
          if (!branchCode && data.branches[0]?.code) setBranch(data.branches[0].code);
        }
      } catch (err) {
        console.error('[BranchPicker] fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const fallback = tenant.fallback_coords ?? { lat: -6.2788, lng: 106.7142 };
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords.latitude, pos.coords.longitude),
        () => resolve(fallback.lat, fallback.lng),
        { timeout: 5000 },
      );
    } else {
      resolve(fallback.lat, fallback.lng);
    }

    return () => {
      cancelled = true;
    };
  }, [tenant, branchCode, setBranch]);

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 text-zinc-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Mencari cabang terdekat…
      </div>
    );
  }

  if (branches.length === 0) {
    return <p className="text-zinc-500">Tidak ada cabang ditemukan.</p>;
  }

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <MapPin className="h-4 w-4" />
        Cabang terdekat
      </label>
      <select
        className="h-11 px-4 rounded-full border border-zinc-300 bg-white text-base font-medium"
        value={branchCode ?? branches[0].code}
        onChange={(e) => setBranch(e.target.value)}
      >
        {branches.map((b) => (
          <option key={b.code} value={b.code}>
            {b.name}
            {b.distanceKm != null ? ` · ${b.distanceKm.toFixed(1)} km` : ''}
            {b.isOpen === false ? ' (tutup)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
