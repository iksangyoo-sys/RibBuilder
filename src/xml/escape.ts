export function xmlEscape(value: string): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function attr(name: string, value: string | boolean | undefined | null): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "boolean") return ` ${name}="${value ? "true" : "false"}"`;
  return ` ${name}="${xmlEscape(value)}"`;
}
