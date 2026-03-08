export async function open(target: string): Promise<void> {
  window.open(target, "_blank", "noopener,noreferrer");
}
