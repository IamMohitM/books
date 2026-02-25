import fetch, { RequestInit } from 'node-fetch';

const API_REQUEST_TIMEOUT_MS = 20_000;

function isSyncRpc(endpoint: string) {
  return (
    endpoint.includes('/rpc/apply_sync_event') ||
    endpoint.includes('/rpc/fetch_sync_changes') ||
    endpoint.includes('/rpc/fetch_sync_snapshot')
  );
}

export async function sendAPIRequest(
  endpoint: string,
  options: RequestInit | undefined
) {
  const shouldLog = isSyncRpc(endpoint);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

  if (shouldLog) {
    console.log(`[cloud-sync-api] request -> ${endpoint}`);
  }

  try {
    const response = await fetch(endpoint, {
      ...(options ?? {}),
      signal: controller.signal,
    });

    const responseText = await response.text();
    if (shouldLog) {
      console.log(
        `[cloud-sync-api] response <- ${endpoint} status=${
          response.status
        } in ${Date.now() - startedAt}ms`
      );
    }

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}: ${responseText}`
      );
    }

    if (!responseText.trim()) {
      return null as unknown as {
        [key: string]: string | number | boolean;
      }[];
    }

    try {
      return JSON.parse(responseText) as {
        [key: string]: string | number | boolean;
      }[];
    } catch {
      throw new Error(`Invalid JSON response: ${responseText.slice(0, 300)}`);
    }
  } catch (error) {
    if (shouldLog) {
      console.error(
        `[cloud-sync-api] error !! ${endpoint} after ${
          Date.now() - startedAt
        }ms: ${(error as Error).message}`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
