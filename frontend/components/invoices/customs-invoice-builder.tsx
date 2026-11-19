"use client";

import { useState } from "react";
import { Download, PackagePlus, Plus, ScrollText, Trash2 } from "lucide-react";
import {
  customsInvoiceDefaultDeclaration,
  CUSTOMS_INVOICE_DEFAULT_TERMS,
  type CustomsInvoiceDto,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { todayIso } from "@/components/ui/calendar";
import { useToast } from "@/components/ui/toast";
import { downloadBlob } from "@/lib/utils/download-blob";

const TEXTAREA =
  "glass-field w-full rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type ItemForm = { description: string; quantity: string; rate: string };
type BoxForm = { weightKg: string; dimensions: string; items: ItemForm[] };

const emptyItem = (): ItemForm => ({ description: "", quantity: "", rate: "" });
const emptyBox = (): BoxForm => ({ weightKg: "", dimensions: "", items: [emptyItem()] });

const num = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const inr = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A labelled text input, laid out the same everywhere in this form. */
function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  className,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputMode?: "decimal" | "numeric" | "tel";
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * The invoice that goes in the box with a personal international shipment: consignor, consignee,
 * each box with its weight and size, and the goods with their declared value. Typed here and
 * downloaded as a PDF in the office's usual layout. Nothing is stored and no GST number is used.
 */
export function CustomsInvoiceBuilder() {
  const { showToast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso);

  const [consignorName, setConsignorName] = useState("");
  const [consignorAddress, setConsignorAddress] = useState("");
  const [consignorPhone, setConsignorPhone] = useState("");
  const [consignorIdLabel, setConsignorIdLabel] = useState("AADHAAR NO.");
  const [consignorIdNumber, setConsignorIdNumber] = useState("");

  const [consigneeName, setConsigneeName] = useState("");
  const [consigneeAddress, setConsigneeAddress] = useState("");
  const [consigneeCountry, setConsigneeCountry] = useState("");
  const [consigneePhone, setConsigneePhone] = useState("");

  const [countryOfOrigin, setCountryOfOrigin] = useState("INDIA");
  const [terms, setTerms] = useState(CUSTOMS_INVOICE_DEFAULT_TERMS);
  const [totalWeight, setTotalWeight] = useState("");
  const [buyer, setBuyer] = useState("");
  const [vesselFlightNo, setVesselFlightNo] = useState("");
  const [portOfDischarge, setPortOfDischarge] = useState("");
  // Blank means the standard declaration with the destination filled in.
  const [declaration, setDeclaration] = useState("");

  const [boxes, setBoxes] = useState<BoxForm[]>([emptyBox()]);

  const destination = consigneeCountry.trim();
  const boxWeight = boxes.reduce((sum, b) => sum + num(b.weightKg), 0);
  const grandTotal = boxes.reduce(
    (sum, b) => sum + b.items.reduce((s, i) => s + num(i.quantity) * num(i.rate), 0),
    0,
  );

  const patchBox = (b: number, patch: Partial<BoxForm>) =>
    setBoxes((all) => all.map((box, i) => (i === b ? { ...box, ...patch } : box)));
  const patchItem = (b: number, it: number, patch: Partial<ItemForm>) =>
    setBoxes((all) =>
      all.map((box, i) =>
        i === b
          ? { ...box, items: box.items.map((item, j) => (j === it ? { ...item, ...patch } : item)) }
          : box,
      ),
    );

  function validate(): string | null {
    if (consignorName.trim().length < 2) return "Enter the consignor's name.";
    if (consignorAddress.trim().length < 3) return "Enter the consignor's address.";
    if (consigneeName.trim().length < 2) return "Enter the consignee's name.";
    if (consigneeAddress.trim().length < 3) return "Enter the consignee's address.";
    if (destination.length < 2) return "Enter the consignee's country.";
    for (const [b, box] of boxes.entries()) {
      if (!box.items.some((i) => i.description.trim()))
        return `Box ${b + 1} has no items. Add what is inside it.`;
    }
    return null;
  }

  async function download() {
    const why = validate();
    setProblem(why);
    if (why) return;

    const body: CustomsInvoiceDto = {
      invoiceNumber: invoiceNumber.trim() || null,
      invoiceDate,
      consignorName: consignorName.trim(),
      consignorAddress: consignorAddress.trim(),
      consignorPhone: consignorPhone.trim() || null,
      consignorIdLabel: consignorIdLabel.trim() || null,
      consignorIdNumber: consignorIdNumber.trim() || null,
      consigneeName: consigneeName.trim(),
      consigneeAddress: consigneeAddress.trim(),
      consigneeCountry: destination,
      consigneePhone: consigneePhone.trim() || null,
      buyer: buyer.trim() || null,
      countryOfOrigin: countryOfOrigin.trim() || "INDIA",
      countryOfDestination: destination,
      terms: terms.trim() || null,
      vesselFlightNo: vesselFlightNo.trim() || null,
      portOfLoading: countryOfOrigin.trim() || "INDIA",
      portOfDischarge: portOfDischarge.trim() || null,
      finalDestination: destination,
      totalWeightKg: totalWeight.trim() ? num(totalWeight) : null,
      boxes: boxes.map((box) => ({
        weightKg: num(box.weightKg),
        dimensions: box.dimensions.trim() || null,
        items: box.items
          .filter((i) => i.description.trim())
          .map((i) => ({
            description: i.description.trim(),
            quantity: num(i.quantity),
            rate: num(i.rate),
          })),
      })),
      declaration: declaration.trim() || null,
    };

    setIsDownloading(true);
    try {
      const { blob } = await apiClient.postBlob("/admin/invoices/customs/pdf", body);
      if (blob.size === 0) throw new Error("Empty PDF");
      const name = consigneeName.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
      downloadBlob(blob, `invoice-${name || "customs"}-${invoiceDate}.pdf`);
      showToast({ variant: "success", title: "Invoice downloaded" });
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't create the invoice.") });
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Card className="glass-sheen">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ScrollText className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-foreground">Customs invoice</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The invoice that goes with a personal shipment. Fill it in and download the PDF.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="ci-no" label="Invoice no. (optional)" value={invoiceNumber} onChange={setInvoiceNumber} />
          <div className="space-y-1">
            <Label htmlFor="ci-date">Date</Label>
            <DateField id="ci-date" title="Invoice date" value={invoiceDate} onChange={setInvoiceDate} />
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-foreground">Consignor (sender)</legend>
          <Field id="ci-cr-name" label="Name" value={consignorName} onChange={setConsignorName} />
          <div className="space-y-1">
            <Label htmlFor="ci-cr-addr">Address (one line per row)</Label>
            <textarea
              id="ci-cr-addr"
              rows={3}
              className={TEXTAREA}
              value={consignorAddress}
              onChange={(e) => setConsignorAddress(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="ci-cr-ph" label="Phone" inputMode="tel" value={consignorPhone} onChange={setConsignorPhone} placeholder="+91" />
            <Field id="ci-cr-idl" label="ID type" value={consignorIdLabel} onChange={setConsignorIdLabel} />
            <Field id="ci-cr-id" label="ID number" value={consignorIdNumber} onChange={setConsignorIdNumber} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-foreground">Consignee (receiver)</legend>
          <Field id="ci-ce-name" label="Name" value={consigneeName} onChange={setConsigneeName} />
          <div className="space-y-1">
            <Label htmlFor="ci-ce-addr">Address (one line per row)</Label>
            <textarea
              id="ci-ce-addr"
              rows={3}
              className={TEXTAREA}
              value={consigneeAddress}
              onChange={(e) => setConsigneeAddress(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ci-ce-country" label="Country" value={consigneeCountry} onChange={setConsigneeCountry} />
            <Field id="ci-ce-ph" label="Phone" inputMode="tel" value={consigneePhone} onChange={setConsigneePhone} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-foreground">Shipment</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="ci-origin" label="Country of origin" value={countryOfOrigin} onChange={setCountryOfOrigin} />
            <Field id="ci-terms" label="Terms" value={terms} onChange={setTerms} />
            <Field
              id="ci-total-wt"
              label="Total weight, kg"
              inputMode="decimal"
              value={totalWeight}
              onChange={setTotalWeight}
              placeholder={boxWeight ? boxWeight.toFixed(2) : "Sum of boxes"}
            />
            <Field id="ci-flight" label="Vessel / flight no. (optional)" value={vesselFlightNo} onChange={setVesselFlightNo} />
            <Field id="ci-pod" label="Port of discharge (optional)" value={portOfDischarge} onChange={setPortOfDischarge} />
            <Field id="ci-buyer" label="Buyer, if not consignee (optional)" value={buyer} onChange={setBuyer} />
          </div>
        </fieldset>

        <div className="space-y-4">
          {boxes.map((box, b) => (
            <fieldset key={b} className="glass-field space-y-3 rounded-xl p-3">
              <div className="flex items-center justify-between gap-2">
                <legend className="text-sm font-semibold text-foreground">Box {b + 1}</legend>
                {boxes.length > 1 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Remove box ${b + 1}`}
                    onClick={() => setBoxes((all) => all.filter((_, i) => i !== b))}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Remove box
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id={`ci-b${b}-wt`}
                  label="Weight, kg"
                  inputMode="decimal"
                  value={box.weightKg}
                  onChange={(v) => patchBox(b, { weightKg: v })}
                  placeholder="21.8"
                />
                <Field
                  id={`ci-b${b}-dim`}
                  label="Size, cm (L*W*H)"
                  value={box.dimensions}
                  onChange={(v) => patchBox(b, { dimensions: v })}
                  placeholder="61*42*24"
                />
              </div>

              <div className="space-y-2">
                <div className="hidden grid-cols-[1fr_5rem_6rem_6rem_2.75rem] gap-2 text-xs font-medium text-muted-foreground sm:grid">
                  <span>Description of goods</span>
                  <span>Quantity</span>
                  <span>Rate, ₹</span>
                  <span className="text-right">Value, ₹</span>
                  <span />
                </div>
                {box.items.map((item, it) => (
                  <div
                    key={it}
                    className="grid grid-cols-[1fr_1fr_1fr] gap-2 sm:grid-cols-[1fr_5rem_6rem_6rem_2.75rem] sm:items-center"
                  >
                    <Input
                      aria-label={`Box ${b + 1} item ${it + 1} description`}
                      className="col-span-3 sm:col-span-1"
                      placeholder="Steel masala box sets"
                      value={item.description}
                      onChange={(e) => patchItem(b, it, { description: e.target.value })}
                    />
                    <Input
                      aria-label={`Box ${b + 1} item ${it + 1} quantity`}
                      inputMode="decimal"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => patchItem(b, it, { quantity: e.target.value })}
                    />
                    <Input
                      aria-label={`Box ${b + 1} item ${it + 1} rate`}
                      inputMode="decimal"
                      placeholder="Rate"
                      value={item.rate}
                      onChange={(e) => patchItem(b, it, { rate: e.target.value })}
                    />
                    <span className="self-center text-right text-sm tabular-nums text-foreground">
                      {inr(num(item.quantity) * num(item.rate))}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="col-span-3 sm:col-span-1 sm:h-11 sm:w-11 sm:p-0"
                      aria-label={`Remove box ${b + 1} item ${it + 1}`}
                      disabled={box.items.length === 1}
                      onClick={() => patchBox(b, { items: box.items.filter((_, j) => j !== it) })}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => patchBox(b, { items: [...box.items, emptyItem()] })}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add item
                </Button>
              </div>
            </fieldset>
          ))}
          <Button variant="secondary" onClick={() => setBoxes((all) => [...all, emptyBox()])}>
            <PackagePlus className="h-4 w-4" aria-hidden />
            Add box
          </Button>
        </div>

        <div className="space-y-1">
          <Label htmlFor="ci-decl">Declaration (optional)</Label>
          <textarea
            id="ci-decl"
            rows={4}
            className={TEXTAREA}
            placeholder={customsInvoiceDefaultDeclaration(destination)}
            value={declaration}
            onChange={(e) => setDeclaration(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Left blank, the standard wording above is printed.</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary/5 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {boxes.length} {boxes.length === 1 ? "box" : "boxes"} ·{" "}
            {(totalWeight.trim() ? num(totalWeight) : boxWeight).toFixed(2)} kg
          </span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            Total ₹{inr(grandTotal)}
          </span>
        </div>

        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}

        <Button onClick={download} isLoading={isDownloading} disabled={isDownloading}>
          <Download className="h-4 w-4" aria-hidden />
          Download invoice PDF
        </Button>
      </CardContent>
    </Card>
  );
}
