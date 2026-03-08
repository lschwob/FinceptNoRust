const STORAGE_KEY = "fincept-browser-fs";

type FsMap = Record<string, string>;

export enum BaseDirectory {
  AppData = "AppData",
  Document = "Document",
  Download = "Download",
}

function loadFs(): FsMap {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as FsMap) : {};
}

function saveFs(payload: FsMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function normalize(path: string): string {
  return path.replace(/^\/+/, "");
}

function encode(data: Uint8Array | string): string {
  if (typeof data === "string") {
    return btoa(unescape(encodeURIComponent(data)));
  }
  let binary = "";
  data.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function exists(path: string, _options?: Record<string, unknown>): Promise<boolean> {
  const fs = loadFs();
  return Object.prototype.hasOwnProperty.call(fs, normalize(path));
}

export async function mkdir(path: string, _options?: Record<string, unknown>): Promise<void> {
  const fs = loadFs();
  fs[`__dir__/${normalize(path)}`] = "";
  saveFs(fs);
}

export async function writeFile(path: string, data: Uint8Array | string, _options?: Record<string, unknown>): Promise<void> {
  const fs = loadFs();
  fs[normalize(path)] = encode(data);
  saveFs(fs);
}

export async function writeTextFile(path: string, data: string, _options?: Record<string, unknown>): Promise<void> {
  await writeFile(path, data);
}

export async function readFile(path: string, _options?: Record<string, unknown>): Promise<Uint8Array> {
  const fs = loadFs();
  const entry = fs[normalize(path)];
  if (!entry) {
    throw new Error(`File not found: ${path}`);
  }
  return decode(entry);
}

export async function readTextFile(path: string, _options?: Record<string, unknown>): Promise<string> {
  const bytes = await readFile(path);
  return new TextDecoder().decode(bytes);
}

export async function remove(path: string, _options?: Record<string, unknown>): Promise<void> {
  const fs = loadFs();
  delete fs[normalize(path)];
  saveFs(fs);
}

export async function copyFile(from: string, to: string, _options?: Record<string, unknown>): Promise<void> {
  const fs = loadFs();
  fs[normalize(to)] = fs[normalize(from)];
  saveFs(fs);
}

export async function rename(from: string, to: string, _options?: Record<string, unknown>): Promise<void> {
  const fs = loadFs();
  fs[normalize(to)] = fs[normalize(from)];
  delete fs[normalize(from)];
  saveFs(fs);
}

export async function readDir(path = "", _options?: Record<string, unknown>): Promise<Array<{ name: string; isDirectory: boolean; path: string }>> {
  const fs = loadFs();
  const prefix = normalize(path);
  return Object.keys(fs)
    .filter((key) => key.startsWith(prefix))
    .map((key) => ({
      name: key.split("/").pop() ?? key,
      isDirectory: key.startsWith("__dir__/"),
      path: key,
    }));
}
