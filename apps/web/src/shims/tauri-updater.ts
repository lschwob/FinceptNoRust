export interface Update {
  available: boolean;
  version?: string;
  currentVersion?: string;
  downloadAndInstall?: () => Promise<void>;
}

export async function check(): Promise<Update | null> {
  return {
    available: false,
    currentVersion: "web-migration",
    downloadAndInstall: async () => undefined,
  };
}
