// Reads text from screenshots on the phone (no server). The OCR engine (~2–3 MB) is downloaded
// only the first time you use it, then cached for offline use by the service worker.
export async function readScreenshots(files: File[], onProgress: (pct: number, label: string) => void): Promise<string> {
  onProgress(2, 'Pregătesc cititorul de text…');
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('ron', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'loading language traineddata') onProgress(5 + m.progress * 15, 'Descarc limba română (o singură dată)…');
    },
  });
  try {
    let text = '';
    for (let i = 0; i < files.length; i++) {
      onProgress(20 + (i / files.length) * 78, `Citesc captura ${i + 1} din ${files.length}…`);
      const { data } = await worker.recognize(files[i]);
      text += `\n${data.text}`;
    }
    onProgress(100, 'Gata');
    return text;
  } finally {
    await worker.terminate();
  }
}
