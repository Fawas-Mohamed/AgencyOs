import { ApiFailure } from './client';
const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function saveJson(value: unknown, filename: string) {
  saveBlob(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), filename);
}
export async function downloadFile(id: string, filename: string) {
  let response: Response;
  try {
    response = await fetch(base + '/files/' + id + '/download', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiFailure('Unable to download the file. Please retry.', 'NETWORK_ERROR', {}, 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiFailure(
      body?.message ?? 'Download failed',
      body?.code ?? 'DOWNLOAD_FAILED',
      body?.details ?? {},
      response.status,
    );
  }
  saveBlob(await response.blob(), filename);
}
