import { message } from 'antd';
import { DOWNLOAD_BASE_URL } from '@/config/serverApiConfig';
import storePersist from '@/redux/storePersist';

export default async function downloadPdf({ entity, id }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    if (
      !['quote', 'invoice', 'payment'].includes(entity) ||
      !/^[a-fA-F0-9]{24}$/.test(String(id))
    ) {
      throw new Error('Dokumen yang dipilih tidak valid.');
    }

    const auth = storePersist.get('auth');
    const token = auth?.current?.token;

    if (!token) {
      throw new Error('Silakan login kembali sebelum mengunduh.');
    }

    const response = await fetch(
      `${DOWNLOAD_BASE_URL}${entity}/${entity}-${id}.pdf`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      let errorMessage = `Unduhan gagal: HTTP ${response.status}`;

      try {
        const body = await response.json();
        errorMessage = body.message || errorMessage;
      } catch {
        // Respons kesalahan tidak selalu berbentuk JSON.
      }

      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    const signature = await blob.slice(0, 5).text();

    if (signature !== '%PDF-') {
      throw new Error('Respons server bukan berkas PDF.');
    }

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = objectUrl;
    link.download = `${entity}-${id}.pdf`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    return true;
  } catch (error) {
    message.error(
      error.name === 'AbortError'
        ? 'Unduhan melewati batas waktu. Coba kembali.'
        : error.message
    );

    return false;
  } finally {
    clearTimeout(timeout);
  }
}