import type { AwbInvoiceDeliveryDto } from "@nationwide/shared-types";

/**
 * What staff are told after mapping an AWB, which now also sends the GST invoice. Only a failure
 * opens the review dialog: that is where the invoice can be corrected and sent by hand.
 */
export function awbInvoiceNotice(awb: string, delivery: AwbInvoiceDeliveryDto | undefined) {
  if (!delivery || delivery.status === "NOT_BILLABLE") {
    return {
      toast: {
        variant: "success" as const,
        title: `AWB ${awb} mapped. The GST invoice goes out once the order is paid.`,
      },
      openReview: false,
    };
  }
  if (delivery.status === "SENT") {
    return {
      toast: {
        variant: "success" as const,
        title: `AWB ${awb} mapped. Invoice ${delivery.invoiceNumber ?? ""} sent to the customer on WhatsApp.`,
      },
      openReview: false,
    };
  }
  return {
    toast: {
      variant: "error" as const,
      title: `AWB ${awb} mapped, but the invoice was not sent: ${delivery.reason ?? "unknown error"}`,
    },
    openReview: true,
  };
}
