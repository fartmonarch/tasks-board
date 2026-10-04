const UUID_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const COMPACT_UUID_PATTERN = /^[\da-z_-]{22}$/i;

export function encodeProjectId(projectId: string): string {
  if (!UUID_PATTERN.test(projectId)) return projectId;

  const hex = projectId.replaceAll("-", "");
  let bytes = "";
  for (let index = 0; index < hex.length; index += 2) {
    bytes += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
  }

  return btoa(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeProjectId(projectRef?: string): string | null {
  if (!projectRef) return null;
  if (UUID_PATTERN.test(projectRef)) return projectRef.toLowerCase();
  if (!COMPACT_UUID_PATTERN.test(projectRef)) return projectRef;

  try {
    const base64 = projectRef.replaceAll("-", "+").replaceAll("_", "/");
    const bytes = atob(`${base64}==`);
    if (bytes.length !== 16) return null;

    const hex = Array.from(bytes, (byte) =>
      byte.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join("");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  } catch {
    return null;
  }
}
