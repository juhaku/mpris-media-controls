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

abstract class Body {
  body: unknown;

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

  const getBody = async () =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    isJson
      ? await response.json()
      : isBinary
        ? await response.bytes()
        : await response.text();

  if (!response.ok) {
    throw new ResponseError(
      `HTTP request failed to ${config.server} with: ${response.statusText}`,
      response.status,
      await getBody(),
    );
  }

  return getBody() as Promise<R>;
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
        return handleRequest(
          context.mutationKey ?? [],
          variables as Body,
          context.meta?.headers ?? {},
          "POST",
        );
      },
    },
  },
});

export { queryClient, Body };
