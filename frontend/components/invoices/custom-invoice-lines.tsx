"use client";

import { Plus, Trash2 } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import {
  customInvoiceLineTotal,
  customInvoiceTotal,
  type CustomInvoiceLineDto,
} from "@nationwide/shared-types";

/**
 * A row as it is being typed. Every field is a string because that is what an input holds — a
 * half-typed "12." is not a number, and coercing on every keystroke is what makes a field fight
 * back while someone is still typing in it.
 */
export interface CustomInvoiceLineForm {
  awbNumber: string;
  supplyDate: string;
  destination: string;
  network: string;
  service: string;
  weightKg: string;
  amount: string;
  otherCharges: string;
  pss: string;
  fsc: string;
}

export const emptyCustomInvoiceLine: CustomInvoiceLineForm = {
  awbNumber: "",
  supplyDate: "",
  destination: "",
  network: "",
  service: "",
  weightKg: "",
  amount: "",
  otherCharges: "",
  pss: "",
  fsc: "",
};

const num = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** The wire shape. Blank optional fields are omitted rather than sent as empty strings. */
export function toCustomInvoiceLine(row: CustomInvoiceLineForm): CustomInvoiceLineDto {
  return {
    awbNumber: row.awbNumber.trim() || undefined,
    // A date input gives YYYY-MM-DD; the server wants an instant.
    supplyDate: row.supplyDate ? new Date(`${row.supplyDate}T00:00:00`).toISOString() : undefined,
    destination: row.destination.trim() || undefined,
    network: row.network.trim() || undefined,
    service: row.service.trim() || undefined,
    weightKg: row.weightKg ? num(row.weightKg) : undefined,
    amount: num(row.amount),
    otherCharges: row.otherCharges ? num(row.otherCharges) : undefined,
    pss: row.pss ? num(row.pss) : undefined,
    fsc: row.fsc ? num(row.fsc) : undefined,
  };
}

export const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What the schedule adds up to, using the same helper the server invoices from. */
export function customInvoiceLinesTotal(rows: CustomInvoiceLineForm[]): number {
  return customInvoiceTotal(rows.map(toCustomInvoiceLine));
}

const CELL =
  "glass-field h-9 w-full rounded-md px-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The freight schedule behind a custom invoice — the shipment list the office already bills
 * from, typed in as it is read off: a row per AWB, with freight, GMR, PSS and fuel in their own
 * columns rather than pre-added into one number nobody can check afterwards.
 *
 * Scrolls sideways rather than wrapping. Twelve columns will not fit a laptop, and a row that
 * wraps mid-shipment is harder to proof-read than one you scroll to.
 */
export function CustomInvoiceLines({
  rows,
  onChange,
}: {
  rows: CustomInvoiceLineForm[];
  onChange: (rows: CustomInvoiceLineForm[]) => void;
}) {
  const update = (index: number, field: keyof CustomInvoiceLineForm, value: string) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const addRow = () => onChange([...rows, { ...emptyCustomInvoiceLine }]);
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

  if (rows.length === 0) {
    return (
      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Bill a list of shipments instead
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-separate border-spacing-y-1 text-xs">
          <thead>
            <tr className="text-left text-[11px] text-muted-foreground">
              <th className="w-8 px-1 font-medium">#</th>
              <th className="px-1 font-medium">AWB No.</th>
              <th className="min-w-[150px] px-1 font-medium">Date</th>
              <th className="px-1 font-medium">Destination</th>
              <th className="px-1 font-medium">Network</th>
              <th className="px-1 font-medium">D/S</th>
              <th className="px-1 font-medium">Weight (kg)</th>
              <th className="px-1 font-medium">Amount</th>
              <th className="px-1 font-medium">GMR/Comm.</th>
              <th className="px-1 font-medium">PSS</th>
              <th className="px-1 font-medium">FSC</th>
              <th className="px-1 text-right font-medium">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="px-1 text-muted-foreground">{index + 1}</td>
                <td className="px-1">
                  <input
                    className={CELL}
                    value={row.awbNumber}
                    onChange={(e) => update(index, "awbNumber", e.target.value)}
                    placeholder="6003402616"
                    aria-label={`AWB number, row ${index + 1}`}
                  />
                </td>
                <td className="px-1">
                  {/* The app's own calendar, not the browser's — the native picker ignores the
                      theme entirely and renders a bright system-blue dialog over a dark page. */}
                  <DateField
                    id={`schedule-date-${index}`}
                    title="Date of supply"
                    placeholder="Pick a date"
                    value={row.supplyDate}
                    onChange={(iso) => update(index, "supplyDate", iso)}
                  />
                </td>
                <td className="px-1">
                  <input
                    className={CELL}
                    value={row.destination}
                    onChange={(e) => update(index, "destination", e.target.value)}
                    placeholder="U.S.A"
                    aria-label={`Destination, row ${index + 1}`}
                  />
                </td>
                <td className="px-1">
                  <input
                    className={CELL}
                    value={row.network}
                    onChange={(e) => update(index, "network", e.target.value)}
                    placeholder="FDX"
                    aria-label={`Network, row ${index + 1}`}
                  />
                </td>
                <td className="px-1">
                  <input
                    className={CELL}
                    value={row.service}
                    onChange={(e) => update(index, "service", e.target.value)}
                    placeholder="SPX"
                    aria-label={`Service, row ${index + 1}`}
                  />
                </td>
                <td className="px-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={CELL}
                    value={row.weightKg}
                    onChange={(e) => update(index, "weightKg", e.target.value)}
                    placeholder="0.50"
                    aria-label={`Weight, row ${index + 1}`}
                  />
                </td>
                <td className="px-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={CELL}
                    value={row.amount}
                    onChange={(e) => update(index, "amount", e.target.value)}
                    placeholder="0.00"
                    aria-label={`Amount, row ${index + 1}`}
                  />
                </td>
                <td className="px-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={CELL}
                    value={row.otherCharges}
                    onChange={(e) => update(index, "otherCharges", e.target.value)}
                    placeholder="0.00"
                    aria-label={`GMR or commercial charge, row ${index + 1}`}
                  />
                </td>
                <td className="px-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={CELL}
                    value={row.pss}
                    onChange={(e) => update(index, "pss", e.target.value)}
                    placeholder="0"
                    aria-label={`PSS, row ${index + 1}`}
                  />
                </td>
                <td className="px-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={CELL}
                    value={row.fsc}
                    onChange={(e) => update(index, "fsc", e.target.value)}
                    placeholder="0.00"
                    aria-label={`FSC, row ${index + 1}`}
                  />
                </td>
                <td className="whitespace-nowrap px-1 text-right font-medium text-foreground">
                  {rupees(customInvoiceLineTotal(toCustomInvoiceLine(row)))}
                </td>
                <td className="px-1">
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove row ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add shipment
        </button>
        <p className="text-sm">
          <span className="text-muted-foreground">
            {rows.length} shipment{rows.length === 1 ? "" : "s"} ·{" "}
          </span>
          <span className="font-semibold text-foreground">
            {rupees(customInvoiceLinesTotal(rows))}
          </span>
          <span className="text-muted-foreground"> including GST</span>
        </p>
      </div>
    </div>
  );
}
