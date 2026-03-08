export async function appDataDir(): Promise<string> {
  return "/browser/app-data/";
}

export async function join(...parts: string[]): Promise<string> {
  return parts.join("/").replace(/\/+/g, "/");
}
