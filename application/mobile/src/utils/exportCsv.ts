import { shareFile } from "./shareFile";

export async function shareCsv(filename: string, content: string): Promise<void> {
  await shareFile(filename, content, { mimeType: "text/csv", uti: "public.comma-separated-values-text" });
}
