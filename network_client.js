/**
 * 网络请求客户端
 * 优先使用 fetch，失败后自动回退到 XMLHttpRequest，以兼容部分 UXP 运行时的网络差异。
 */

/**
 * 将 ArrayBuffer 解码为文本
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function decodeArrayBuffer(buffer) {
    if (!buffer) return '';

    if (typeof globalThis.TextDecoder === 'function') {
        return new globalThis.TextDecoder('utf-8').decode(buffer);
    }

    const bytes = new Uint8Array(buffer);
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes[i]);
    }
    return result;
}

/**
 * 将文本编码为 ArrayBuffer
 * @param {string} text
 * @returns {ArrayBuffer}
 */
function encodeText(text) {
    if (typeof globalThis.TextEncoder === 'function') {
        return new globalThis.TextEncoder().encode(text).buffer;
    }

    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        bytes[i] = text.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * 统一 XHR 返回值结构，使之尽量兼容 fetch Response
 */
class XhrResponse {
    constructor(xhr, responseType) {
        this.ok = xhr.status >= 200 && xhr.status < 300;
        this.status = xhr.status;
        this.statusText = xhr.statusText || '';
        this._responseType = responseType || '';
        this._headersText = xhr.getAllResponseHeaders ? xhr.getAllResponseHeaders() : '';
        this._rawBody =
            responseType === 'arraybuffer' ? xhr.response : xhr.responseText || xhr.response || '';
    }

    text() {
        if (this._rawBody instanceof ArrayBuffer) {
            return decodeArrayBuffer(this._rawBody);
        }
        return typeof this._rawBody === 'string' ? this._rawBody : String(this._rawBody || '');
    }

    json() {
        return Promise.resolve(JSON.parse(this.text()));
    }

    arrayBuffer() {
        if (this._rawBody instanceof ArrayBuffer) {
            return Promise.resolve(this._rawBody);
        }
        return Promise.resolve(encodeText(this.text()));
    }

    headers = {
        get: (name) => {
            if (!name || !this._headersText) return null;
            const lines = this._headersText.split(/\r?\n/);
            const lowerName = name.toLowerCase();
            for (const line of lines) {
                const separatorIndex = line.indexOf(':');
                if (separatorIndex === -1) continue;
                const key = line.slice(0, separatorIndex).trim().toLowerCase();
                if (key === lowerName) {
                    return line.slice(separatorIndex + 1).trim();
                }
            }
            return null;
        },
    };
}

/**
 * 使用 XHR 发送请求
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<XhrResponse>}
 */
function requestWithXhr(url, options = {}) {
    return new Promise((resolve, reject) => {
        if (typeof globalThis.XMLHttpRequest !== 'function') {
            reject(new Error('XMLHttpRequest is not available in current runtime'));
            return;
        }

        const xhr = new globalThis.XMLHttpRequest();
        const method = options.method || 'GET';
        const headers = options.headers || {};
        const timeout = options.timeout || 60000;
        const responseType = options.responseType || '';

        xhr.open(method, url, true);
        xhr.timeout = timeout;

        if (responseType === 'arraybuffer') {
            xhr.responseType = 'arraybuffer';
        }

        for (const [key, value] of Object.entries(headers)) {
            if (value === undefined || value === null) continue;
            xhr.setRequestHeader(key, value);
        }

        xhr.onload = () => resolve(new XhrResponse(xhr, responseType));
        xhr.onerror = () => reject(new Error('XHR network error'));
        xhr.ontimeout = () => reject(new Error(`XHR timeout after ${timeout}ms`));
        xhr.onabort = () => reject(new Error('XHR request aborted'));

        const body = options.body === undefined ? null : options.body;
        if (body instanceof Uint8Array) {
            xhr.send(body.buffer);
            return;
        }

        xhr.send(body);
    });
}

/**
 * 统一网络请求入口
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<Response|XhrResponse>}
 */
async function request(url, options = {}) {
    let fetchError = null;

    if (typeof fetch === 'function') {
        try {
            return await fetch(url, options);
        } catch (e) {
            fetchError = e;
            console.warn(`[Network] fetch failed for ${options.method || 'GET'} ${url}:`, e);
        }
    }

    try {
        console.warn(`[Network] retrying with XMLHttpRequest for ${options.method || 'GET'} ${url}`);
        return await requestWithXhr(url, options);
    } catch (xhrError) {
        const errorParts = [];
        if (fetchError) {
            errorParts.push(`fetch: ${fetchError.message}`);
        }
        errorParts.push(`xhr: ${xhrError.message}`);

        const combinedError = new Error(`Network request failed (${errorParts.join('; ')})`);
        combinedError.fetchError = fetchError;
        combinedError.xhrError = xhrError;
        combinedError.url = url;
        combinedError.method = options.method || 'GET';
        throw combinedError;
    }
}

async function requestAny(urls, options = {}) {
    const candidates = [...new Set((Array.isArray(urls) ? urls : [urls]).filter(Boolean))];
    const { shouldAcceptResponse, ...requestOptions } = options;
    const attempts = [];
    let lastError = null;

    for (const url of candidates) {
        try {
            const response = await request(url, requestOptions);
            if (typeof shouldAcceptResponse === 'function' && !shouldAcceptResponse(response, url)) {
                attempts.push({
                    url,
                    message: `HTTP ${response.status} ${response.statusText || ''}`.trim(),
                });
                lastError = new Error(`Rejected response from ${url}: HTTP ${response.status}`);
                continue;
            }
            return { response, url, attempts };
        } catch (error) {
            attempts.push({
                url,
                message: error && error.message ? error.message : String(error),
            });
            lastError = error;
        }
    }

    if (lastError) {
        lastError.attempts = attempts;
        throw lastError;
    }

    throw new Error('No request URL candidates available');
}

module.exports = {
    request,
    requestAny,
};
