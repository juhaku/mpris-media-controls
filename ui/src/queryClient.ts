import { QueryClient } from "@tanstack/react-query";
import { config } from "./config";

class ResponseError extends Error {
  message: string;
  status: number;
  body: unknown;

  constructor(mesage: string, status: number, body: unknown) {
    super(mesage);
    this.message = mesage;
    this.status = status;
    this.body = body;
  }
}

type Method = "GET" | "POST";

abstract class Body implements Parameters {
  body: unknown;
  value: unknown;

  static json(body: unknown) {
    const b = new Json();
    b.body = body;

    return b;
  }

  static form(body: unknown) {
    const b = new Form();
    b.body = body;

    return b;
  }

  abstract headers(): Record<string, string>;

  abstract toString(): string;
}

class Json extends Body {
  headers(): Record<string, string> {
    return { "content-type": "application/json" };
  }

  toString(): string {
    return JSON.stringify(this.body);
  }
}

class Form extends Body {
  headers(): Record<string, string> {
    return {
      "content-type": "application/x-www-form-urlencoded",
    };
  }

  toString(): string {
    return new URLSearchParams(
      Object.entries(this.body as Record<string, unknown>).reduce(
        (o, [key, value]) => {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          const urlEcondedValue = encodeURIComponent(`${value}`);

          return { ...o, [key]: urlEcondedValue };
        },
        {},
      ),
    ).toString();
  }
}

interface Parameters<T = unknown> {
  value: T;
}

class Query<T = Record<string, string>> implements Parameters {
  value: T;
  constructor(value: T) {
    this.value = value;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isQuery(value: any): value is Query {
  return (
    value !== null &&
    value !== undefined &&
    "value" in value &&
    !("body" in value)
  );
}

async function handleRequest<R>(
  requestKeys: readonly unknown[],
  body?: Body,
  headers = {},
  defaultMethod: Method = "GET",
): Promise<R> {
  const response = await fetch(`${config.server}${requestKeys.join("")}`, {
    method: defaultMethod,
    body: body?.toString(),
    headers: { ...headers, ...body?.headers() },
  });

  const contentType = response.headers.get("content-type");
  const isJson = "application/json" === contentType;
  const isBinary = "application/octet-stream" == contentType;

  const getBody: () => Promise<R> = async (): Promise<R> => {
    switch (true) {
      case isJson: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return await response.json();
      }
      case isBinary: {
        return (await response.bytes()) as R;
      }
      default: {
        return (await response.text()) as R;
      }
    }
  };

  if (!response.ok) {
    throw new ResponseError(
      `HTTP request failed to ${config.server} with: ${response.statusText}`,
      response.status,
      await getBody(),
    );
  }

  return await getBody();
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        return handleRequest(queryKey);
      },
    },
    mutations: {
      mutationFn: (variables, context) => {
        let key = context.mutationKey ?? [];
        let body: Body | undefined = variables as Body;
        if (isQuery(variables)) {
          const query = new URLSearchParams(variables.value).toString();
          key = [...key, `?${query}`];
          body = undefined;
        }
        return handleRequest(key, body, context.meta?.headers ?? {}, "POST");
      },
    },
  },
});

export { queryClient, Body, Query };
