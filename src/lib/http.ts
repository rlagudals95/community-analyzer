import { DEFAULT_USER_AGENT } from "./common";

import type { FetchHtmlOptions } from "../types";

function buildHeaders(options: FetchHtmlOptions): Record<string, string> {
  return {
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "user-agent": options.userAgent || DEFAULT_USER_AGENT,
    ...(options.headers || {}),
  };
}

export async function fetchHtml(
  url: string,
  options: FetchHtmlOptions = {},
): Promise<string> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: buildHeaders(options),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function postForm(
  url: string,
  data: Record<string, string | number | null | undefined>,
  options: FetchHtmlOptions = {},
): Promise<string> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(data)) {
    body.set(key, value === null || value === undefined ? "" : String(value));
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      signal: controller.signal,
      body,
      headers: buildHeaders({
        ...options,
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
          ...(options.headers || {}),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}
