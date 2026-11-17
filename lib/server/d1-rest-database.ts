export type D1RestConfiguration = {
  accountId: string;
  databaseId: string;
  apiToken: string;
};

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type RestQuery = {
  sql: string;
  params?: string[];
};

type CloudflareQueryResponse = {
  success?: boolean;
  result?: Array<{
    success?: boolean;
    results?: unknown[];
    meta?: D1Result["meta"];
  }>;
  errors?: Array<{ code?: number }>;
};

export function createD1RestDatabase(
  configuration: D1RestConfiguration,
  options: { fetcher?: Fetcher } = {},
): D1Database {
  return new D1RestDatabase(
    validateConfiguration(configuration),
    options.fetcher ?? fetch,
  );
}

export function normalizeD1RestQuery(
  query: string,
  values: unknown[],
): RestQuery {
  const params: string[] = [];
  let valueIndex = 0;
  let output = "";
  let state:
    | "normal"
    | "single"
    | "double"
    | "backtick"
    | "bracket"
    | "line-comment"
    | "block-comment" = "normal";

  for (let index = 0; index < query.length; index += 1) {
    const character = query[index];
    const next = query[index + 1];

    if (state === "line-comment") {
      output += character;
      if (character === "\n") state = "normal";
      continue;
    }
    if (state === "block-comment") {
      output += character;
      if (character === "*" && next === "/") {
        output += next;
        index += 1;
        state = "normal";
      }
      continue;
    }
    if (state === "single") {
      output += character;
      if (character === "'" && next === "'") {
        output += next;
        index += 1;
      } else if (character === "'") {
        state = "normal";
      }
      continue;
    }
    if (state === "double") {
      output += character;
      if (character === '"' && next === '"') {
        output += next;
        index += 1;
      } else if (character === '"') {
        state = "normal";
      }
      continue;
    }
    if (state === "backtick") {
      output += character;
      if (character === "`" && next === "`") {
        output += next;
        index += 1;
      } else if (character === "`") {
        state = "normal";
      }
      continue;
    }
    if (state === "bracket") {
      output += character;
      if (character === "]") state = "normal";
      continue;
    }

    if (character === "-" && next === "-") {
      output += `${character}${next}`;
      index += 1;
      state = "line-comment";
      continue;
    }
    if (character === "/" && next === "*") {
      output += `${character}${next}`;
      index += 1;
      state = "block-comment";
      continue;
    }
    if (character === "'") {
      output += character;
      state = "single";
      continue;
    }
    if (character === '"') {
      output += character;
      state = "double";
      continue;
    }
    if (character === "`") {
      output += character;
      state = "backtick";
      continue;
    }
    if (character === "[") {
      output += character;
      state = "bracket";
      continue;
    }
    if (character !== "?") {
      output += character;
      continue;
    }

    if (valueIndex >= values.length) {
      throw new TypeError("A SQL placeholder has no bound value.");
    }
    const value = values[valueIndex];
    valueIndex += 1;
    if (value === null) {
      output += "NULL";
      continue;
    }
    output += "?";
    params.push(toRestParameter(value));
  }

  if (valueIndex !== values.length) {
    throw new TypeError("A bound SQL value has no placeholder.");
  }
  return params.length > 0 ? { sql: output, params } : { sql: output };
}

class D1RestPreparedStatement implements D1PreparedStatement {
  readonly query: string;
  readonly values: unknown[];
  readonly database: D1RestDatabase;

  constructor(
    database: D1RestDatabase,
    query: string,
    values: unknown[] = [],
  ) {
    this.database = database;
    this.query = query;
    this.values = values;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new D1RestPreparedStatement(this.database, this.query, values);
  }

  async first<T = Record<string, unknown>>(
    column?: string,
  ): Promise<T | null> {
    const result = await this.database.execute([
      normalizeD1RestQuery(this.query, this.values),
    ]);
    const row = result[0]?.results?.[0];
    if (!row || typeof row !== "object") return null;
    if (column !== undefined) {
      return ((row as Record<string, unknown>)[column] ?? null) as T | null;
    }
    return row as T;
  }

  async all<T = Record<string, unknown>>(): Promise<{
    success: boolean;
    results: T[];
    meta?: D1Result["meta"];
  }> {
    const result = await this.database.execute([
      normalizeD1RestQuery(this.query, this.values),
    ]);
    return {
      success: true,
      results: (result[0]?.results ?? []) as T[],
      meta: result[0]?.meta,
    };
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    const result = await this.database.execute([
      normalizeD1RestQuery(this.query, this.values),
    ]);
    return normalizeResult<T>(result[0]);
  }

  async raw<T = unknown[]>(options?: {
    columnNames?: boolean;
  }): Promise<T[]> {
    const result = await this.database.execute([
      normalizeD1RestQuery(this.query, this.values),
    ]);
    const rows = (result[0]?.results ?? []).filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object" && !Array.isArray(row),
    );
    const columns = rows[0] ? Object.keys(rows[0]) : [];
    const rawRows = rows.map((row) =>
      columns.map((column) => row[column]),
    );
    return (options?.columnNames
      ? [columns, ...rawRows]
      : rawRows) as T[];
  }
}

class D1RestDatabase implements D1Database {
  readonly endpoint: string;
  readonly fetcher: Fetcher;
  #apiToken: string;

  constructor(configuration: D1RestConfiguration, fetcher: Fetcher) {
    this.endpoint =
      `https://api.cloudflare.com/client/v4/accounts/` +
      `${configuration.accountId}/d1/database/` +
      `${configuration.databaseId}/query`;
    this.#apiToken = configuration.apiToken;
    this.fetcher = fetcher;
  }

  prepare(query: string): D1PreparedStatement {
    if (!query.trim()) throw new TypeError("SQL query cannot be empty.");
    return new D1RestPreparedStatement(this, query);
  }

  async batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    if (statements.length === 0) return [];
    const queries = statements.map((statement) => {
      if (
        !(statement instanceof D1RestPreparedStatement) ||
        statement.database !== this
      ) {
        throw new TypeError(
          "Every batch statement must belong to this D1 REST database.",
        );
      }
      return normalizeD1RestQuery(statement.query, statement.values);
    });
    const results = await this.execute(queries);
    return results.map((result) => normalizeResult<T>(result));
  }

  async exec(query: string): Promise<unknown> {
    const results = await this.execute([{ sql: query }]);
    return {
      count: results.length,
      duration: results.reduce(
        (total, result) => total + (result.meta?.duration ?? 0),
        0,
      ),
    };
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error(
      "Database export is not available through the query adapter.",
    );
  }

  async execute(
    queries: RestQuery[],
  ): Promise<
    Array<{
      success?: boolean;
      results?: unknown[];
      meta?: D1Result["meta"];
    }>
  > {
    const body =
      queries.length === 1
        ? queries[0]
        : {
            batch: queries,
          };
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.#apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error("The durable database could not be reached.");
    }

    let payload: CloudflareQueryResponse;
    try {
      payload = (await response.json()) as CloudflareQueryResponse;
    } catch {
      throw new Error("The durable database returned an invalid response.");
    }
    if (
      !response.ok ||
      payload.success !== true ||
      !Array.isArray(payload.result) ||
      payload.result.length !== queries.length ||
      payload.result.some((result) => result.success !== true)
    ) {
      const code = payload.errors?.[0]?.code;
      throw new Error(
        `The durable database rejected the request${
          code ? ` (${code})` : ""
        }.`,
      );
    }
    return payload.result;
  }
}

function validateConfiguration(
  configuration: D1RestConfiguration,
): D1RestConfiguration {
  const accountId = configuration.accountId.trim();
  const databaseId = configuration.databaseId.trim();
  const apiToken = configuration.apiToken.trim();
  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is invalid.");
  }
  if (!/^[a-f0-9-]{36}$/i.test(databaseId)) {
    throw new Error("CLOUDFLARE_D1_DATABASE_ID is invalid.");
  }
  if (apiToken.length < 40) {
    throw new Error("CLOUDFLARE_D1_API_TOKEN is invalid.");
  }
  return { accountId, databaseId, apiToken };
}

function toRestParameter(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  throw new TypeError("This SQL binding type is not supported.");
}

function normalizeResult<T>(result: {
  success?: boolean;
  results?: unknown[];
  meta?: D1Result["meta"];
}): D1Result<T> {
  return {
    success: true,
    results: (result.results ?? []) as T[],
    meta: result.meta ?? {},
  };
}
