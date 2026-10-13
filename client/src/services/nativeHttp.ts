import { CapacitorHttp, type HttpHeaders, type HttpResponse } from '@capacitor/core';
import { isNativeAuthPlatform } from './nativeAuthPlatform';

const DEFAULT_TIMEOUT_MS = 15_000;

function headersToRecord(headers?: HeadersInit): HttpHeaders {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const record: HttpHeaders = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

function canUseNativeHttp(init: RequestInit): boolean {
  if (!isNativeAuthPlatform()) return false;
  const body = init.body;
  return !(
    typeof FormData !== 'undefined' && body instanceof FormData
    || typeof Blob !== 'undefined' && body instanceof Blob
    || typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer
  );
}

function requestData(body: BodyInit | null | undefined, headers: HttpHeaders): unknown {
  if (body == null || body === '') return undefined;
  if (typeof body !== 'string') return undefined;
  const contentType =
    Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1] ?? '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

function blobFromNativeData(data: unknown): Blob {
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer) return new Blob([data]);
  if (typeof data === 'string') {
    try {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes]);
    } catch {
      return new Blob([data]);
    }
  }
  return new Blob([JSON.stringify(data ?? '')]);
}

function nativeToResponse(result: HttpResponse, asBlob: boolean): Response {
  const headers = new Headers();
  for (const [key, value] of Object.entries(result.headers ?? {})) {
    if (value != null) headers.set(key, String(value));
  }
  if (result.status === 204) {
    return new Response(null, { status: 204, headers });
  }
  if (asBlob) {
    return new Response(blobFromNativeData(result.data), { status: result.status, headers });
  }
  let body: string | null = null;
  if (typeof result.data === 'string') {
    body = result.data;
  } else if (result.data != null) {
    body = JSON.stringify(result.data);
  }
  return new Response(body, { status: result.status, statusText: String(result.status), headers });
}

export type NativeHttpOptions = {
  responseType?: 'json' | 'blob' | 'text';
};

/** WebView `fetch` is subject to CORS. Native HTTP is not. */
export async function nativeAwareFetch(
  url: string,
  init: RequestInit = {},
  options: NativeHttpOptions = {}
): Promise<Response> {
  if (!canUseNativeHttp(init)) {
    return fetch(url, init);
  }

  const method = (init.method ?? 'GET').toUpperCase();
  const headers = headersToRecord(init.headers);
  const asBlob = options.responseType === 'blob';

  const result = await CapacitorHttp.request({
    url,
    method,
    headers,
    data: requestData(init.body, headers),
    connectTimeout: DEFAULT_TIMEOUT_MS,
    readTimeout: DEFAULT_TIMEOUT_MS,
    responseType: asBlob ? 'blob' : 'text'
  });

  return nativeToResponse(result, asBlob);
}
