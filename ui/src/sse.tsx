import {
  createContext,
  useCallback,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";
import type { Id } from "./hooks";

type Sources = Record<Id, EventSource | null>;

type SourceType = "PlayerStatus" | "PlayerPosition";

type EventType = string | string[];

interface SSeContextProps {
  sources: Sources;
  listeners: Map<string, Set<Listener<EventType>>>;
  connect: <E extends EventType>(opts: ConnectOpts<E>) => void;
  close: <E extends EventType>(
    url: string,
    listener: Listener<Union<E>>,
  ) => void;
}

const SseContext = createContext<SSeContextProps | null>(null);

type Union<T> = T extends readonly (infer Item)[] ? Item : T;

interface ConnectOpts<E extends EventType> {
  event: E;
  url: string;
  keepalive: boolean;
  listener: Listener<Union<E>>;
}

type Listener<E extends EventType> = E extends readonly string[]
  ? (type: E[number], data: unknown) => void | Promise<void>
  : E extends string
    ? (type: E, data: unknown) => void | Promise<void>
    : never;
// type Listener = (type: string, data: unknown) => void | Promise<void>;

function SseContextProvider({ children }: PropsWithChildren) {
  const sources = useRef<Sources>({});
  const listeners = useRef<
    Map<string, Set<ConnectOpts<EventType>["listener"]>>
  >(new Map());

  const broadcast = useCallback((url: string, type: string, data: unknown) => {
    listeners.current.get(url)?.forEach((listener) => {
      void listener(type, data);
    });
  }, []);

  const connect: <E extends EventType>(opts: ConnectOpts<E>) => void =
    useCallback(
      ({ event, url, keepalive, listener }) => {
        // console.log(
        //   "connectin to:",
        //   url,
        //   "existing source",
        //   sources.current[url],
        // );
        if (!sources.current[url]) {
          const source = new EventSource(url);
          if (Array.isArray(event)) {
            event.forEach((type) => {
              source.addEventListener(type, (event) => {
                broadcast(url, type, event.data);
              });
            });
          } else {
            source.addEventListener(event, (e) => {
              broadcast(url, event, e.data);
            });
          }
          if (keepalive) {
            source.addEventListener("keepalive", (_) => {
              // console.log("keepalive", event, url);
            });
          }
          sources.current[url] = source;
        }
        const l = listeners.current.get(url) ?? new Set();
        l.add(listener);
        listeners.current.set(url, l);
      },
      [broadcast],
    );

  const close: <E extends EventType>(
    url: string,
    listener: Listener<Union<E>>,
  ) => void = useCallback((url, listener) => {
    // console.log("closing listener", listener);

    listeners.current.get(url)?.delete(listener);
    if (listeners.current.get(url)?.size === 0) {
      // console.log("last listener remove, closing the source");
      sources.current[url]?.close();
      sources.current[url] = null;
    }
  }, []);

  const value: SSeContextProps = useMemo(
    () => ({
      sources: sources.current,
      listeners: listeners.current,
      connect: connect,
      close,
    }),
    [close, connect],
  );

  return <SseContext.Provider value={value}>{children}</SseContext.Provider>;
}

export { SseContextProvider, type SourceType, SseContext };
