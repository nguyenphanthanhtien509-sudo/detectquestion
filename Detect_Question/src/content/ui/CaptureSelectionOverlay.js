class CaptureSelectionOverlay {
  static select() {
    if (typeof document === 'undefined' || !document.body) return Promise.reject(new Error('Không thể mở vùng chọn ảnh trên trang này.'));
    if (document.getElementById('qa-capture-selection-overlay')) return Promise.reject(new Error('Đang chọn vùng ảnh. Nhấn Esc để hủy.'));
    return new Promise((resolve, reject) => {
      const overlay = document.createElement('div'); overlay.id = 'qa-capture-selection-overlay';
      Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483646', cursor: 'crosshair', background: 'rgba(15,23,42,.15)', userSelect: 'none', touchAction: 'none' });
      const box = document.createElement('div'); Object.assign(box.style, { position: 'fixed', border: '2px solid #38bdf8', background: 'rgba(56,189,248,.14)', display: 'none', pointerEvents: 'none' });
      const hint = document.createElement('div'); hint.textContent = 'Kéo chuột để chọn vùng câu hỏi · Esc để hủy'; Object.assign(hint.style, { position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', padding: '8px 12px', borderRadius: '6px', background: '#0f172a', color: '#fff', font: '13px system-ui,sans-serif', pointerEvents: 'none' });
      overlay.appendChild(box); overlay.appendChild(hint);
      document.body.appendChild(overlay);
      let start = null;
      const cleanup = () => { overlay.removeEventListener('pointerdown', onDown, true); overlay.removeEventListener('pointermove', onMove, true); overlay.removeEventListener('pointerup', onUp, true); window.removeEventListener('keydown', onKey, true); overlay.remove(); };
      const rectAt = point => ({ left: Math.max(0, Math.min(start.x, point.x)), top: Math.max(0, Math.min(start.y, point.y)), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) });
      const onDown = event => { if (event.button !== 0) return; event.preventDefault(); start = { x: event.clientX, y: event.clientY }; overlay.setPointerCapture?.(event.pointerId); };
      const onMove = event => {
        if (!start) return;
        event.preventDefault();
        const rect = rectAt({ x: event.clientX, y: event.clientY });
        Object.assign(box.style, { display: 'block', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      };
      const onUp = event => { if (!start || event.button !== 0) return; const rect = rectAt({ x: event.clientX, y: event.clientY }); cleanup(); if (rect.width < 24 || rect.height < 24) return reject(new Error('Vùng chọn quá nhỏ. Hãy nhấn Y và kéo lại vùng câu hỏi.')); resolve(rect); };
      const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); cleanup(); reject(new Error('Đã hủy chụp màn hình.')); } };
      overlay.addEventListener('pointerdown', onDown, true); overlay.addEventListener('pointermove', onMove, true); overlay.addEventListener('pointerup', onUp, true); window.addEventListener('keydown', onKey, true);
    });
  }

  static crop(dataUrl, rect, options = {}) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const scaleX = image.naturalWidth / Math.max(1, window.innerWidth), scaleY = image.naturalHeight / Math.max(1, window.innerHeight);
          const source = { x: Math.max(0, Math.floor(rect.left * scaleX)), y: Math.max(0, Math.floor(rect.top * scaleY)), width: Math.max(1, Math.floor(rect.width * scaleX)), height: Math.max(1, Math.floor(rect.height * scaleY)) };
          source.width = Math.min(source.width, image.naturalWidth - source.x); source.height = Math.min(source.height, image.naturalHeight - source.y);
          if (source.width <= 0 || source.height <= 0) throw new Error('Invalid crop');
          const targetBytes = Math.max(16 * 1024, Number(options.targetBytes) || 96 * 1024);
          const maxBytes = Math.max(targetBytes, Number(options.maxBytes) || 512 * 1024);
          const longest = Math.max(source.width, source.height);
          const maxDimension = Math.max(512, Number(options.maxDimension) || 1800);
          let reduction = Math.min(1, maxDimension / longest);
          const minReduction = Math.min(reduction, 1024 / longest);
          let best = null;
          // Try JPEG quality first, then bounded resize. Preserve color for
          // diagrams and avoid reducing long images below a 1024px edge.
          for (let attempt = 0; attempt < 5; attempt++) {
            const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.floor(source.width * reduction)); canvas.height = Math.max(1, Math.floor(source.height * reduction));
            const context = canvas.getContext('2d');
            context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
            context.imageSmoothingQuality = 'high';
            context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
            for (const quality of (attempt === 0 ? [.85, .78, .72] : [.76, .72])) {
              const encoded = canvas.toDataURL('image/jpeg', quality);
              const bytes = Math.ceil((encoded.length - encoded.indexOf(',') - 1) * 3 / 4);
              if (!best || bytes < best.bytes) best = { encoded, bytes };
              if (bytes <= targetBytes) return resolve(encoded);
            }
            if (reduction <= minReduction) break;
            reduction = Math.max(minReduction, reduction * .85);
          }
          if (best && best.bytes <= maxBytes) return resolve(best.encoded);
          reject(new Error('Ảnh vùng chọn quá lớn để gửi. Hãy chọn vùng nhỏ hơn.'));
        } catch (_) { reject(new Error('Không thể cắt ảnh màn hình.')); }
      };
      image.onerror = () => reject(new Error('Không thể đọc ảnh màn hình.')); image.src = dataUrl;
    });
  }
}
globalThis.CaptureSelectionOverlay = CaptureSelectionOverlay;
if (typeof module !== 'undefined' && module.exports) module.exports = { CaptureSelectionOverlay };
