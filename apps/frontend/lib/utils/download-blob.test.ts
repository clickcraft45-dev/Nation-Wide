import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "./download-blob";

// jsdom implements neither of these, and they are exactly what is under test.
const createObjectURL = vi.fn(() => "blob:mock-url");
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("downloadBlob", () => {
  it("clicks an anchor that is actually in the document, then removes it", () => {
    let inDocumentAtClickTime: boolean | null = null;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        // Firefox ignores a click on a detached anchor, which is the bug this guards against.
        inDocumentAtClickTime = document.body.contains(this);
      });

    downloadBlob(new Blob(["x"]), "invoice.pdf");

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(inDocumentAtClickTime).toBe(true);
    expect(document.querySelector("a")).toBeNull();
    clickSpy.mockRestore();
  });

  it("sets href and the download filename", () => {
    let href = "";
    let download = "";
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        href = this.href;
        download = this.download;
      });

    downloadBlob(new Blob(["x"]), "NW-INV-2026-0001.pdf");

    expect(href).toBe("blob:mock-url");
    expect(download).toBe("NW-INV-2026-0001.pdf");
    clickSpy.mockRestore();
  });

  it("does not revoke the object URL in the same tick as the click", () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    downloadBlob(new Blob(["x"]), "invoice.pdf");

    // Revoking synchronously races the download manager's read and can cancel the save.
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    clickSpy.mockRestore();
  });
});
