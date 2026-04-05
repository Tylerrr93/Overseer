// ============================================================
//  src/engine/utils/SerializationUtils.ts
//
//  Pure DOM-/IO-level helpers for save file handling.
//  No game-specific logic — just JSON serialization, file
//  download, and file upload primitives.
//
//  Engine-safe: no imports from game/ or content definitions.
// ============================================================

/**
 * Triggers a browser download of `data` as a .json file.
 */
export function downloadJSON(filename: string, data: string): void {
  const blob = new Blob([data], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Opens a native file-picker restricted to .json files and resolves
 * with the raw text content of the chosen file.
 * Rejects if the user cancels or if the read fails.
 */
export function readJSONFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input    = document.createElement("input");
    input.type     = "file";
    input.accept   = ".json,application/json";

    // Cancelled — no file chosen
    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      // Give the change event a tick to fire first
      setTimeout(() => {
        if (!input.files?.length) reject(new Error("No file selected"));
      }, 500);
    };
    window.addEventListener("focus", onFocus, { once: true });

    input.onchange = () => {
      window.removeEventListener("focus", onFocus);
      const file = input.files?.[0];
      if (!file) { reject(new Error("No file selected")); return; }

      const reader    = new FileReader();
      reader.onload  = e  => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error("File read failed"));
      reader.readAsText(file);
    };

    input.click();
  });
}

/**
 * Returns a human-readable relative time string for a unix-ms timestamp.
 * e.g. "just now", "3 minutes ago", "2 hours ago".
 */
export function relativeTime(tsMs: number): string {
  const diff = Date.now() - tsMs;
  if (diff < 10_000)          return "just now";
  if (diff < 60_000)          return `${Math.floor(diff / 1_000)}s ago`;
  if (diff < 3_600_000)       return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)      return `${Math.floor(diff / 3_600_000)}h ago`;
  return                             `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Builds a datestamped filename for save exports.
 * e.g. "overseer_save_2025-06-12_14-30.json"
 */
export function buildSaveFilename(prefix = "overseer_save"): string {
  const d   = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${prefix}_${date}_${time}.json`;
}
