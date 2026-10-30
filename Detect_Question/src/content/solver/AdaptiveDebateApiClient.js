(function registerAdaptiveDebateApiClient(scope) {
  class AdaptiveDebateApiClient {
    constructor(options = {}) {
      this.endpoint = String(options.endpoint || '').replace(/\/$/, '');
      this.token = options.token || '';
      this.fetch = options.fetch || scope.fetch?.bind(scope);
    }

    static fromRuntimeConfig() {
      const config = scope.APP_CONFIG || {};
      if (!config.ORCHESTRATOR_URL) return null;
      return new AdaptiveDebateApiClient({
        endpoint: config.ORCHESTRATOR_URL,
        // Only sync_env may populate this for a loopback URL. Remote
        // deployments keep their token in extension storage.
        token: config.ORCHESTRATOR_AUTH_TOKEN || ''
      });
    }

    async solve(question, signal, mode = 'adaptive_debate') {
      const token = await this.getAuthToken();
      if (!this.endpoint || !token || !this.fetch) throw new Error('Adaptive debate backend is not configured.');
      const requestId = typeof scope.crypto?.randomUUID === 'function'
        ? scope.crypto.randomUUID()
        : `ext-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const payload = { schemaVersion: 1, requestId, mode, question: await this.toTransportQuestion(question) };
      const body = await this.requestThroughExtension(this.endpoint, token, requestId, payload, signal);
      return this.toLegacyResult(body);
    }

    // Keep the runner's stable solver interface while routing every DOM
    // question through the local adaptive-debate backend.
    async solveQuestion(question, signal) {
      return this.solve(question, signal);
    }

    // Emergency display-only path. The server calls exactly one configured
    // forward model and explicitly labels the response unverified.
    async solveSingleModel(question, signal) {
      return this.solve(question, signal, 'single_model');
    }

    async requestThroughExtension(endpoint, token, requestId, payload, signal) {
      // Content-script fetches to localhost can be blocked by the page's CORS
      // or Private Network Access policy. Route through the extension service
      // worker, which has the declared host permission instead.
      if (scope.chrome?.runtime?.sendMessage) {
        const action = scope.MessageActions?.CALL_ADAPTIVE_DEBATE || 'CALL_ADAPTIVE_DEBATE';
        return new Promise((resolve, reject) => {
          const abort = () => reject(new Error('Adaptive debate request cancelled.'));
          signal?.addEventListener('abort', abort, { once: true });
          scope.chrome.runtime.sendMessage({ action, endpoint, token, requestId, payload }, response => {
            signal?.removeEventListener('abort', abort);
            if (scope.chrome.runtime.lastError) return reject(new Error(scope.chrome.runtime.lastError.message));
            if (response?.success && response.data) return resolve(response.data);
            return reject(new Error(response?.error || 'Adaptive debate request failed.'));
          });
        });
      }
      const response = await this.fetch(`${endpoint}/v1/solve`, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': requestId },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body) throw new Error(body?.error || `Adaptive debate request failed (${response.status}).`);
      return body;
    }

    async getAuthToken() {
      if (this.token) return this.token;
      // The packaged standalone app routes requests through its Node bridge.
      // The real bearer token deliberately stays in that process instead of
      // being exposed to every page opened in the managed browser.
      if (scope.chrome?.runtime?.__qaStandaloneBridge === true) return 'standalone-bridge';
      if (!scope.chrome?.storage?.local) return '';
      return new Promise(resolve => scope.chrome.storage.local.get(['orchestratorAuthToken'], value => resolve(value?.orchestratorAuthToken || '')));
    }

    toContractQuestion(question) {
      // A captured image supplements the DOM question; preserve its typed
      // answer schema so the result can safely target radio/text/dropdown UI.
      const type = question.type === 'image' ? 'image_vision' : question.type;
      const result = { type, title: String(question.title || ''), passage: question.passage || undefined, imageUrl: question.image || undefined };
      if (Array.isArray(question.options)) result.options = question.options.map(option => ({ key: option.key, text: option.text }));
      if (Array.isArray(question.items)) result.items = question.items.map(item => ({ key: item.key, text: item.text }));
      if (Array.isArray(question.selects)) result.selects = question.selects.map(select => ({ id: select.id, label: select.label, options: (select.options || []).map(option => ({ value: option.value ?? option.text, text: option.text })) }));
      if (Array.isArray(question.fields)) result.fields = question.fields.map(field => ({
        id: field.id,
        label: field.label,
        kind: field.kind,
        ...(field.kind === 'select' ? { options: (field.options || []).map(option => ({ value: option.value ?? option.text, text: option.text })) } : {})
      }));
      return result;
    }

    async toTransportQuestion(question) {
      const result = this.toContractQuestion(question);
      const source = result.imageUrl;
      if (!source) return result;
      const image = await this.toInlineImage(source);
      delete result.imageUrl;
      if (!image) throw new Error('Không đọc được ảnh câu hỏi; đã dừng để tránh giải thiếu hình.');
      result.image = image;
      return result;
    }

    async toInlineImage(source) {
      if (/^data:image\/svg\+xml[;,]/i.test(String(source || '').trim())) return this.rasterizeSvg(source);
      const dataUrl = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(String(source || '').trim());
      if (dataUrl) return { mimeType: dataUrl[1].toLowerCase(), data: dataUrl[2] };
      if (!/^https?:\/\//i.test(String(source || ''))) return null;

      if (scope.chrome?.runtime?.sendMessage) {
        const action = scope.MessageActions?.READ_IMAGE_AS_BASE64 || 'READ_IMAGE_AS_BASE64';
        return new Promise((resolve, reject) => {
          scope.chrome.runtime.sendMessage({ action, url: source }, response => {
            if (scope.chrome.runtime.lastError) return reject(new Error(scope.chrome.runtime.lastError.message));
            if (response?.success && response.image?.mimeType && response.image?.data) return resolve(response.image);
            reject(new Error(response?.error || 'Unable to read question image bytes.'));
          });
        });
      }

      const response = await this.fetch(source);
      if (!response?.ok) throw new Error(`Unable to fetch question image (${response?.status || 'network error'}).`);
      const mimeType = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) throw new Error('Question image has an unsupported MIME type.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 1_000_000) throw new Error('Question image must be between 1 byte and 1 MB.');
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      return { mimeType, data: btoa(binary) };
    }

    async rasterizeSvg(source) {
      if (!scope.document?.createElement || !scope.Image) throw new Error('SVG cần được chuyển thành ảnh trong trình duyệt.');
      if (source.length > 2_000_000) throw new Error('Ảnh SVG quá lớn.');
      return new Promise((resolve, reject) => {
        const image = new scope.Image();
        const timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error('Hết thời gian đọc SVG.')); }, 5000);
        image.onerror = () => { clearTimeout(timer); reject(new Error('Không đọc được ảnh SVG.')); };
        image.onload = () => {
          clearTimeout(timer);
          try {
            const width = image.naturalWidth || 1024, height = image.naturalHeight || 768;
            const scale = Math.min(1, 1800 / Math.max(width, height));
            const canvas = scope.document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
            const context = canvas.getContext('2d');
            context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const data = canvas.toDataURL('image/png').split(',')[1];
            if (!data || data.length > 1_333_332) throw new Error('Ảnh SVG sau chuyển đổi quá lớn.');
            resolve({ mimeType: 'image/png', data });
          } catch (error) { reject(error); }
        };
        image.src = source;
      });
    }

    toLegacyResult(result) {
      // Only a centrally accepted AI verification is a consensus result that
      // the runner may apply. Legacy VERIFIED remains readable for migration,
      // but never grants automatic application by itself.
      const accepted = result.status === 'AI_VERIFIED' || result.status === 'CONSENSUS_UNVERIFIED' || result.status === 'VERIFIED';
      const displayOnly = result.status === 'SINGLE_MODEL_UNVERIFIED';
      const answer = result.answer;
      const mapped = {
        consensus: accepted,
        displayOnly,
        consensusStatus: result.status,
        eligibleForAutoApply: result.finalDecision?.eligibleForAutoApply === true,
        requiresManualReview: result.finalDecision?.requiresManualReview !== false,
        diagnostics: result.provenance || [], verification: result.verification, backwardVerification: result.backwardVerification, metrics: result.metrics
      };
      if ((!accepted && !displayOnly) || answer == null) return mapped;
      if (Array.isArray(answer)) return { ...mapped, answers: answer };
      if (typeof answer === 'object') {
        if (result.questionType === 'dropdown_select') return { ...mapped, dropdownAnswers: answer };
        if (result.questionType === 'multi_input') return { ...mapped, multiInputAnswers: answer };
        return { ...mapped, answers: answer };
      }
      return { ...mapped, answer, answerText: answer };
    }
  }

  scope.AdaptiveDebateApiClient = AdaptiveDebateApiClient;
  if (typeof module !== 'undefined' && module.exports) module.exports = { AdaptiveDebateApiClient };
})(typeof globalThis !== 'undefined' ? globalThis : this);
