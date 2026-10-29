class DomMediaExtractor {
  static isValidImageSrc(src) {
    if (!src || typeof src !== 'string') return false;
    const lower = src.toLowerCase();
    if (lower.startsWith('chrome-extension://') || lower.startsWith('moz-extension://')) return false;
    if (lower.includes('avatar') || lower.includes('icon.php') || lower.includes('/pix/') || lower.includes('favicon') || lower.includes('logo') || lower.includes('btn_') || lower.includes('button')) return false;
    if (src.startsWith('data:image/svg+xml') || src.startsWith('data:image/png') || src.startsWith('data:image/jpeg') || src.startsWith('data:image/webp')) {
      return src.length > 80;
    }
    return src.startsWith('http://') || src.startsWith('https://');
  }

  static extractImageFromNode(node) {
    if (!node) return null;
    const checkImg = (img) => {
      if (!img) return null;
      const rect = img.getBoundingClientRect();
      const w = parseInt(img.getAttribute('width') || img.style.width || '0', 10);
      const h = parseInt(img.getAttribute('height') || img.style.height || '0', 10);
      if ((rect.width > 0 && rect.width < 15) || (rect.height > 0 && rect.height < 15) || (w > 0 && w < 15) || (h > 0 && h < 15)) {
        return null;
      }
      const src = img.currentSrc || img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src') || img.src;
      return DomMediaExtractor.isValidImageSrc(src) ? src : null;
    };

    if (node.tagName === 'IMG') {
      const s = checkImg(node);
      if (s) return s;
    }

    const directImgs = Array.from(node.querySelectorAll('img')).filter(TextUtils.isVisible);
    for (const img of directImgs) {
      const s = checkImg(img);
      if (s) return s;
    }

    const svgs = Array.from(node.querySelectorAll('svg')).filter(TextUtils.isVisible);
    for (const svg of svgs) {
      // Moodle and many React applications use inline SVGs for controls
      // (edit, flag, expand, etc.). They are not question media, and sending
      // their URL-encoded SVG data to a vision API would reject the entire
      // otherwise-valid question. Preserve substantial diagram SVGs only.
      const declaredWidth = String(svg.getAttribute('width') || '').trim().toLowerCase();
      const declaredHeight = String(svg.getAttribute('height') || '').trim().toLowerCase();
      if (svg.hasAttribute('data-icon') || svg.getAttribute('aria-hidden') === 'true' ||
        declaredWidth.endsWith('em') || declaredHeight.endsWith('em')) {
        continue;
      }
      const rect = svg.getBoundingClientRect();
      const w = parseInt(svg.getAttribute('width') || '0', 10);
      const h = parseInt(svg.getAttribute('height') || '0', 10);
      if ((rect.width > 30 && rect.height > 30) || (w > 30 || h > 30) || svg.getAttribute('viewBox')) {
        try {
          return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
        } catch (e) {}
      }
    }

    const canvases = Array.from(node.querySelectorAll('canvas')).filter(TextUtils.isVisible);
    for (const canvas of canvases) {
      if (canvas.width > 20 && canvas.height > 20) {
        try {
          return canvas.toDataURL('image/png');
        } catch (e) {}
      }
    }
    return null;
  }

  static extractImageUrl(container) {
    return DomMediaExtractor.extractImageFromNode(container);
  }

  static extractReadingPassages(scanRoot = (typeof document !== 'undefined' ? document : null)) {
    if (!scanRoot) return {};
    const passageMap = {};
    const candidateSelectors = [
      '.reading-passage', '.passage', '.stimulus', '.reading-text',
      '.reading_passage', '.yh-player-media--section', '.yh-player-media',
      '[class*="reading"]', '[class*="passage"]', '[class*="stimulus"]',
      '.section-media', '.description', '.content-description'
    ];

    try {
      const containers = Array.from(scanRoot.querySelectorAll(candidateSelectors.join(', '))).filter(TextUtils.isVisible);
      containers.forEach(el => {
        const text = TextUtils.extractRichText(el);
        if (text && text.length > 80) {
          const match = text.match(/(?:câu|question|q)\s*(\d+)\s*(?:đến|to|[\-\–])\s*(?:câu|question|q)?\s*(\d+)/i);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = parseInt(match[2], 10);
            for (let q = start; q <= end; q++) {
              passageMap[q] = text;
            }
          }
        }
      });
    } catch (e) {}
    return passageMap;
  }
}

globalThis.DomMediaExtractor = DomMediaExtractor;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DomMediaExtractor };
}
