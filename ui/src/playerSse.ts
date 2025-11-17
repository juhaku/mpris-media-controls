import { useQueryClient } from "@tanstack/react-query";
import { useCurrentPlayer, usePlayersCache, useSse } from "./hooks";
import { useCallback, useEffect } from "react";
import { config } from "./config";
import type { Metadata } from "./media";

// type Listener = [player: string, (metadata: Metadata) => Promise<void>];
//
// class Subscriptions {
//   private source: EventSource | null = null;
//
//   private listeners: Listener[] = [];
//
//   static getSubscription(
//     player: string,
//     listener: (data: Metadata) => Promise<void>,
//   ): () => void {
//     const isRegistered = subscriptons.listeners.some(([p]) => p === player);
//     // console.log(
//     //   "getting subscription",
//     //   subscriptons.listeners.length,
//     //   subscriptons.listeners,
//     // );
//     if (!isRegistered) {
//       // console.log(
//       //   "player is not registered",
//       //   isRegistered,
//       //   "adding new listener",
//       //   [player, listener],
//       // );
//       subscriptons.listeners.push([player, listener]);
//     }
//
//     // console.log("source is", subscriptons.source);
//     if (subscriptons.source === null) {
//       subscriptons.source = new EventSource(
//         `${config.server}/media/player-sse/${player}`,
//       );
//
//       subscriptons.source.addEventListener("error", (event) => {
//         console.error(
//           "Error in stream, closing source",
//           event,
//           subscriptons.source,
//         );
//         subscriptons.source?.close();
//         subscriptons.source = null;
//       });
//
//       subscriptons.source.addEventListener("keepalive", (event) => {
//         // console.log("event keepalive", event.data);
//       });
//
//       subscriptons.source.addEventListener("metadata", (event) => {
//         void Promise.all(
//           subscriptons.listeners.map(async ([_, l]) => {
//             await l(JSON.parse(event.data as string) as Metadata);
//           }),
//         );
//       });
//     }
//
//     return () => {
//       const index = subscriptons.listeners.findIndex(([p]) => p === player);
//       // console.log("remove listener with index:", index, player);
//       if (index > -1) {
//         subscriptons.listeners.splice(index, 1);
//       }
//
//       // console.log("listeners", subscriptons.listeners.length);
//       // no more listeners, close the source
//       if (subscriptons.listeners.length === 0) {
//         // console.log("listeners closing source", subscriptons.listeners.length);
//
//         subscriptons.source?.close();
//         subscriptons.source = null;
//       }
//     };
//   }
// }
//
// const subscriptons = new Subscriptions();

// const usePlayerSse = () => {
//   const client = useQueryClient();
//   const cache = usePlayersCache();
//   if (cache === null) {
//     throw new Error(
//       "Cannot use Players, PlayerContext not set, did you define the <PlayerContextProvider> component",
//     );
//   }
//   const { updateMetadata } = cache;
//
//   const { player } = useCurrentPlayer();
//
//   const cb = useCallback(
//     async (metadata: Metadata) => {
//       console.log("got metadata change", metadata, player);
//
//       if (player?.id) {
//         const queryKey = ["/media", "/metadata", `/${player.id}`];
//         updateMetadata({ id: player.id, metadata });
//         client.setQueryData(queryKey, (old) => {
//           console.log("old data", old, "new", metadata);
//
//           return { ...(old as object), ...metadata };
//         });
//
//         await client.invalidateQueries({ queryKey });
//         await client.invalidateQueries({
//           queryKey: ["/media", "/status", `/${player.id}`],
//         });
//       }
//     },
//     [client, player, updateMetadata],
//   );
//
//   useEffect(() => {
//     let unsubscribe = () => {
//       // nothing
//     };
//
//     if (player) {
//       unsubscribe = Subscriptions.getSubscription(player.id, cb);
//     }
//
//     return () => {
//       // console.log("unsubscribing");
//       unsubscribe();
//     };
//   }, [cb, player]);
// };

const usePlayerSse = () => {
  const cache = usePlayersCache();
  if (cache === null) {
    throw new Error(
      "Cannot use Players, PlayerContext not set, did you define the <PlayerContextProvider> component",
    );
  }
  const { updateMetadata } = cache;
  const client = useQueryClient();
  const sse = useSse();
  if (sse === null) {
    // console.error("Did you forget to define <SseContextProvider> in dom tree");
    throw new Error(
      "Did you forget to define <SseContextProvider> in dom tree",
    );
  }
  const { connect, close } = sse;

  const { player } = useCurrentPlayer();
  const url = `${config.server}/media/player-sse/${player?.id ?? ""}`;

  const listener = useCallback(
    async (type: "metadata" | "status", data: unknown) => {
      switch (type) {
        case "metadata": {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const metadata: Metadata = JSON.parse(data as string);

          if (player?.id) {
            const queryKey = ["/media", "/metadata", `/${player.id}`];
            updateMetadata({ id: player.id, metadata });
            client.setQueryData(queryKey, (old: unknown) => {
              return { ...(old as object), ...metadata };
            });

            await client.invalidateQueries({ queryKey });
            await client.invalidateQueries({
              queryKey: ["/media", "/status", `/${player.id}`],
            });
          }
          break;
        }
        case "status": {
          if (player?.id) {
            await client.invalidateQueries({
              queryKey: ["/media", "/status", `/${player.id}`],
            });
          }
          break;
        }
      }
    },
    [client, player?.id, updateMetadata],
  );

  useEffect(() => {
    if (player?.id) {
      // console.log("use player sse 2", url);
      connect({
        event: ["metadata", "status"] as const,
        keepalive: true,
        url,
        listener,
      });
    }

    return () => {
      if (player?.id) {
        // console.log("unmout player sse 2", url);
        close(url, listener);
      }
    };
  }, [close, connect, listener, player?.id, url]);
};

export { usePlayerSse };
