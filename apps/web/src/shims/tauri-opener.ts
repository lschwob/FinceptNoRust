export async function openUrl(target: string): Promise<void> {
  window.open(target, "_blank", "noopener,noreferrer");
}

export async function revealItemInDir(target: string): Promise<void> {
  window.open(target, "_blank", "noopener,noreferrer");
}
