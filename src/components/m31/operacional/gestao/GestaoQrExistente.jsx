import { useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { Download, ExternalLink, QrCode } from 'lucide-react';
import { gestaoQrModel } from '@/lib/m31GestaoApi';

export default function GestaoQrExistente({ inscricao }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const svgRef = useRef(null);
  const { image, payload, available } = gestaoQrModel(inscricao);

  async function download() {
    if (downloading) return;
    setDownloading(true);
    setError('');
    let objectUrl;
    try {
      let blob;
      let extension;
      if (image) {
        const response = await fetch(image, { credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error('download_failed');
        blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('invalid_image');
        extension = blob.type.includes('svg') ? 'svg' : blob.type.includes('jpeg') ? 'jpg' : 'png';
      } else {
        const svg = svgRef.current?.querySelector('svg');
        if (!svg) throw new Error('missing_svg');
        blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
        extension = 'svg';
      }
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `QR-M31-${String(inscricao.codigo_inscricao || inscricao.id).replace(/[^a-zA-Z0-9_-]/g, '')}.${extension}`;
      anchor.click();
    } catch {
      setError('Não foi possível baixar a imagem. Use “Abrir imagem do QR” para acessar a credencial existente.');
    } finally {
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setDownloading(false);
    }
  }

  return (
    <section className="m31-gestao-qr">
      <h3>QR Code</h3>
      {available ? (
        <>
          <button type="button" className="m31-gestao-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
            <QrCode size={18} aria-hidden="true" />{open ? 'Ocultar QR Code' : 'Ver QR Code'}
          </button>
          {open && (
            <div className="m31-gestao-qr-preview">
              {image ? (
                <img src={image} alt={`QR Code existente da inscrição ${inscricao.codigo_inscricao || ''}`} referrerPolicy="no-referrer" />
              ) : (
                <div ref={svgRef}>
                  <QRCode value={payload} size={224} title="QR Code existente da inscrição" />
                </div>
              )}
              <div className="m31-gestao-ficha-actions">
                <button type="button" className="m31-gestao-btn" onClick={download} disabled={downloading}>
                  <Download size={17} aria-hidden="true" />{downloading ? 'Baixando…' : 'Baixar QR Code'}
                </button>
                {image && (
                  <a href={image} target="_blank" rel="noopener noreferrer" className="m31-gestao-btn">
                    <ExternalLink size={17} aria-hidden="true" />Abrir imagem do QR
                  </a>
                )}
              </div>
              {error && <p className="m31-gestao-error" role="alert">{error}</p>}
              <p className="m31-gestao-muted">Visualização da credencial existente. Abrir ou baixar não registra presença nem envia mensagens.</p>
            </div>
          )}
        </>
      ) : (
        <p className="m31-gestao-muted">QR não disponível nesta inscrição.</p>
      )}
    </section>
  );
}
