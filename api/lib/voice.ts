type TranscriptionResult = {
  text: string;
  model: string;
};

function guessExtension(mimeType: string) {
  const m = String(mimeType || '').toLowerCase();
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('webm')) return 'webm';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  return 'audio';
}

export async function transcribeAudioFromUrl(params: {
  openAiApiKey: string;
  audioUrl: string;
  mimeType?: string;
}) {
  const audioUrl = String(params.audioUrl || '').trim();
  if (!audioUrl) return null;
  const key = String(params.openAiApiKey || '').trim();
  if (!key) return null;

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) return null;

  const buf = await audioRes.arrayBuffer();
  if (!buf || buf.byteLength === 0) return null;
  if (buf.byteLength > 12 * 1024 * 1024) return null;

  const contentType = String(params.mimeType || audioRes.headers.get('content-type') || 'audio/mpeg');
  const ext = guessExtension(contentType);
  const blob = new Blob([buf], { type: contentType });

  const form = new FormData();
  form.append('model', 'whisper-1');
  form.append('file', blob, `audio.${ext}`);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
    },
    body: form,
  });

  const json: any = await res.json().catch(() => null);
  if (!res.ok) return null;

  const text = String(json?.text ?? '').trim();
  if (!text) return null;
  const result: TranscriptionResult = { text, model: 'whisper-1' };
  return result;
}
