import type { QuotePreviewResultDto, ShipmentTypeCode } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";

/**
 * The carrier prices for one destination and weight. One definition for the customer quote
 * wizard and the admin quote wizard, which used to build this URL each on their own.
 */
export function fetchQuotePreview(
  destinationCountry: string,
  weightKg: number,
  shipmentType: ShipmentTypeCode,
): Promise<QuotePreviewResultDto> {
  const query = new URLSearchParams({
    destinationCountry,
    weightKg: String(weightKg),
    shipmentType,
  });
  return apiClient.get<QuotePreviewResultDto>(`/quotes/preview?${query}`);
}
