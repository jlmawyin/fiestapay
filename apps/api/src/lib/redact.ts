/** Request log shape. Query strings and credential headers never enter the log. */
export function redactRequest(request: { method?: string; url?: string; headers?: unknown }): {
  method: string;
  url: string;
} {
  const raw = typeof request.url === 'string' ? request.url : '';
  return {
    method: typeof request.method === 'string' ? request.method : '',
    url: raw.split('?')[0] ?? '',
  };
}

export const requestLogger = {
  serializers: {
    req: redactRequest,
  },
};
