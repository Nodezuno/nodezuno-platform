type D1Result<T = unknown> = {
  success: boolean;
  results?: T[];
  meta: {
    changes?: number;
    duration?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
  };
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{
    success: boolean;
    results: T[];
    meta?: D1Result["meta"];
  }>;
  run<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<unknown>;
  dump(): Promise<ArrayBuffer>;
};

type Fetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type R2Object = {
  etag: string;
  version: string;
  size: number;
  checksums: {
    sha256?: ArrayBuffer | ArrayBufferView;
  };
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
  customMetadata?: Record<string, string>;
};

type R2ObjectBody = R2Object & { body?: ReadableStream<Uint8Array> };

type R2Bucket = {
  put(
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | string,
    options?: {
      sha256?: ArrayBuffer | ArrayBufferView;
      onlyIf?: { etagDoesNotMatch?: string };
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<R2Object | null>;
  head(key: string): Promise<R2Object | null>;
  get(
    key: string,
    options?: { onlyIf?: { etagMatches?: string } },
  ): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
};

type ScheduledController = {
  cron: string;
  scheduledTime: number;
};

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    DELIVERABLES?: R2Bucket;
    ASSETS?: Fetcher;
    RATE_LIMIT_SECRET?: string;
    API_KEY_PEPPER?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    ZOHO_SMTP_HOST?: string;
    ZOHO_SMTP_PASSWORD?: string;
    PUBLIC_ORIGIN?: string;
    RATE_LIMIT_SECRET?: string;
    REVIEW_CAPABILITY_SECRET?: string;
    NODEZUNO_ADMIN_EMAILS?: string;
    NODEZUNO_ENABLE_LEGACY_HOSTING_IDENTITY?: string;
    NODEZUNO_LEGAL_LAUNCH_APPROVED?: string;
    NODEZUNO_PUBLIC_INDEXING?: string;
    NODEZUNO_RPC_UPSTREAMS_JSON?: string;
    NODEZUNO_RPC_HOURLY_CALL_QUOTA?: string;
    NODEZUNO_RPC_WORKSPACE_HOURLY_CALL_QUOTA?: string;
    NODEZUNO_GRPC_AUTH_SECRET?: string;
    NODEZUNO_GRPC_PUBLIC_ENDPOINT?: string;
  };
}

declare module "cloudflare:sockets" {
  export type Socket = {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    opened: Promise<unknown>;
    close(): Promise<void>;
  };
  export function connect(
    address: { hostname: string; port: number },
    options?: { secureTransport?: "off" | "on" | "starttls" },
  ): Socket;
}
