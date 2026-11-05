import type { TrackingResultDto } from '@nationwide/shared-types';

/**
 * What the public tracking page may show. Tracking numbers are sequential (NW-26-00000123), so
 * anyone can walk the range: the answer must not hand out who sent a parcel, who receives it and
 * how to call them, or what the contents are worth. Enough stays for the real recipient to know
 * the parcel is theirs.
 *
 * Applied at the controller, after the cache, so answers cached before this existed are masked too.
 * Safe to apply twice.
 */
export function publicTracking(dto: TrackingResultDto): TrackingResultDto {
  return {
    ...dto,
    customerName: maskName(dto.customerName) ?? '',
    consigneeName: maskName(dto.consigneeName),
    consigneePhone: maskPhone(dto.consigneePhone),
    items: dto.items.map(({ description, category, quantity }) => ({
      description,
      ...(category ? { category } : {}),
      quantity,
    })),
  };
}

/** "Ravi Kumar Sharma" → "Ravi S."; a single name stays as it is. */
export function maskName(name: string | null): string | null {
  if (!name) return name;
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0];
  const last = words[words.length - 1].replace(/\.$/, '');
  return `${words[0]} ${last.charAt(0).toUpperCase()}.`;
}

/** "+919876543210" → "•••• 3210". */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  return digits.length < 4 ? '••••' : `•••• ${digits.slice(-4)}`;
}
