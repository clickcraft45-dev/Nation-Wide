"use client";

import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogClose } from "./dialog";
import { Button } from "./button";

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "primary",
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "primary" | "danger";
  onConfirm: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent title={title} description={description}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant={variant}
              size="sm"
              isLoading={isSubmitting}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
