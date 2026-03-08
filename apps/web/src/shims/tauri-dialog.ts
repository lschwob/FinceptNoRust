type FileFilter = {
  name: string;
  extensions: string[];
};

type SaveOptions = {
  defaultPath?: string;
  filters?: FileFilter[];
};

type OpenOptions = {
  multiple?: boolean;
  directory?: boolean;
  filters?: FileFilter[];
};

function pickFiles(options?: OpenOptions): Promise<string | string[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = Boolean(options?.multiple);
    if (options?.filters?.length) {
      input.accept = options.filters.flatMap((filter) => filter.extensions.map((ext) => `.${ext}`)).join(",");
    }
    input.onchange = () => {
      if (!input.files || input.files.length === 0) {
        resolve(null);
        return;
      }
      const names = Array.from(input.files).map((file) => file.name);
      resolve(options?.multiple ? names : names[0]);
    };
    input.click();
  });
}

export async function open(options?: OpenOptions): Promise<string | string[] | null> {
  return pickFiles(options);
}

export async function save(options?: SaveOptions): Promise<string | null> {
  return options?.defaultPath ?? "download.dat";
}
