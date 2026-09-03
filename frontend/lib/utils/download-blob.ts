/**
 * Hand a fetched Blob to the browser's download manager under a given filename.
 *
 * The two things this gets right, and every hand-rolled copy of it got wrong:
 *
 * 1. THE ANCHOR IS IN THE DOCUMENT. Firefox ignores a synthetic `click()` on an anchor that was
 *    never appended, so a detached-anchor download silently does nothing there — no error, no
 *    file, nothing to debug from.
 *
 * 2. THE OBJECT URL OUTLIVES THE CLICK. `URL.revokeObjectURL` in the same tick as the click
 *    races the download manager's read of the blob and can cancel the save. The delay below is
 *    long enough for any browser to have started reading and short enough that a large PDF is
 *    not pinned in memory for the life of the tab.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";

  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
