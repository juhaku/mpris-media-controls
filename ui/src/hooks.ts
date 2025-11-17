import {
  useQueries,
  useQuery,
  useSuspenseQueries,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { NameId } from "./media";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PlayersContext } from "./playersContext";
import { config } from "./config";
import { SseContext } from "./sse";

interface Player {
  name: string;
  /**
   * now playing me metadata
   */
  meta: Metadata;

  /**
   * Play status of the player
   */
  status: Status | null;
  isPlaying: () => boolean;
}

interface Metadata {
  track_id: string;
  title: string;
  art_url: string;
  url: string;
  length: number;
  artist: string[];
}

type Status = "Playing" | "Stopped" | "Paused";

/**
 * id of the player is a string
 */
type Id = string;

const usePlayersCache = () => useContext(PlayersContext);

const usePlayers = () => {
  const cache = usePlayersCache();
  if (cache === null) {
    throw new Error(
      "Cannot use Players, PlayerContext not set, did you define the <PlayerContextProvider> component",
    );
  }

  const { players, setPlayer, updateStatus, updateMetadata, getPlayer } = cache;

  const { data: nameIds } = useSuspenseQuery<NameId[]>({
    queryKey: ["/media", "/players"],
  });

  const playersAndMetadatas = useSuspenseQueries({
    queries: nameIds.map(([, id]) => ({
      queryKey: ["/media", "/metadata", `/${id}`],
    })),
    combine: (results) => {
      return {
        data: results.map((result) => result.data as Metadata),
      };
    },
  });

  useEffect(() => {
    playersAndMetadatas.data.forEach((metadata, index) => {
      const [name, id] = nameIds[index];

      const existingPlayer = getPlayer(id);
      if (existingPlayer) {
        if (JSON.stringify(existingPlayer.meta) !== JSON.stringify(metadata)) {
          updateMetadata({ id, metadata });
        }
      } else {
        setPlayer({ name, id, metadata });
      }
    });
  }, [getPlayer, nameIds, playersAndMetadatas.data, setPlayer, updateMetadata]);

  const playerStatuses = useQueries({
    queries: nameIds.map(([, id]) => ({
      queryKey: ["/media", "/status", `/${id}`],
    })),
    combine: (results) => {
      return {
        data: results.map((r) => r.data as Status),
        isPending: results.map((r) => r.isPending),
      };
    },
  });

  useEffect(() => {
    playerStatuses.data.forEach((status, index) => {
      if (!playerStatuses.isPending[index]) {
        updateStatus({ id: nameIds[index][1], status });
      }
    });
  }, [nameIds, playerStatuses.data, playerStatuses.isPending, updateStatus]);

  const value = useMemo(() => ({ players }), [players]);

  return value;
};

// let currentPlayerSingleton: Id | null = null;

interface CurrentPlayer {
  player: { id: Id; player: Player } | null;
  update: (id: Id) => void;
}

const useCurrentPlayer = (): CurrentPlayer => {
  const cache = usePlayersCache();
  if (cache === null) {
    throw new Error(
      "Cannot use Players, PlayerContext not set, did you define the <PlayerContextProvider> component",
    );
  }
  const { players, getPlayer, current: currentPlayer, setCurrent } = cache;

  // const [currentPlayer, setCurrentPlayer] = useState<Id | null>(
  //   currentPlayerSingleton,
  // );

  const updateCurrentPlayer = useCallback(
    (player: Id) => {
      // currentPlayerSingleton = player;
      sessionStorage.setItem("mediaControls_lastPlayer", player);
      // setCurrentPlayer(player);
      setCurrent({ id: player });
    },
    [setCurrent],
  );

  const selectedPlayer = useMemo(
    () => (currentPlayer !== null ? (getPlayer(currentPlayer) ?? null) : null),
    [currentPlayer, getPlayer],
  );

  useEffect(() => {
    for (const { id, player } of players) {
      if (player.isPlaying()) {
        if (currentPlayer !== id) {
          updateCurrentPlayer(id);
        }
        break;
      }
    }

    if (currentPlayer === null) {
      // try restore the last player if no other player is playing
      const lastPlayer = sessionStorage.getItem("mediaControls_lastPlayer");
      if (lastPlayer !== null) {
        updateCurrentPlayer(lastPlayer);
        return;
      }
      // last resort take the first available player and use it as current player
      if (Object.keys(players).length > 0) {
        const nextPlayer = Object.keys(players).values().next().value;
        if (nextPlayer !== undefined) {
          updateCurrentPlayer(nextPlayer);
          return;
        }
      }
    }
  }, [currentPlayer, players, selectedPlayer, updateCurrentPlayer]);

  const player = useMemo(() => {
    if (selectedPlayer && currentPlayer !== null) {
      return { id: currentPlayer, player: selectedPlayer };
    } else {
      return null;
    }
  }, [selectedPlayer, currentPlayer]);

  const value = useMemo(
    () => ({ player, update: updateCurrentPlayer }),
    [player, updateCurrentPlayer],
  );

  return value;
  // return {
  //   player: player,
  //   // update: (id: Id) => {
  //   //   setCurrentPlayerId(id);
  //   //   sessionStorage.setItem("mediaControls_lastPlayer", id);
  //   // },
  // };
};

const usePlayerImage = (player: Player | null): string | null => {
  const [image, setImage] = useState<string | null>(null);

  const { data: binary } = useQuery<Uint8Array>({
    queryKey: [
      "/media",
      "/image",
      `/${encodeURIComponent(player?.meta.art_url ?? "")}`,
    ],
    enabled: player !== null && player.meta.art_url !== "",
  });

  useMemo(() => {
    let url: string | null = null;
    if (binary) {
      const blob = new Blob([binary as BlobPart], {
        type: "application/octet-stream",
      });
      url = URL.createObjectURL(blob);
    }

    setImage(url);
  }, [binary]);

  return image;
};

// interface PlayerPostion {
//   cancel: () => void;
//   subscribe: () => void;
// }

// const usePlayerPosition = (
//   player: Id,
//   onPosition: (positon: number) => void,
// ): PlayerPostion => {
//   const [source, setSource] = useState<EventSource | null>(null);
//
//   const { players } = usePlayers();
//   const isPlaying = players[player].isPlaying();
//
//   const subscribe = useCallback(() => {
//     const source = new EventSource(
//       `http://tower:4433/api/media/position-sse/${player}`,
//       // {
//       //   withCredentials: true,
//       // },
//     );
//
//     source.addEventListener("error", (event) => {
//       console.log("error", event);
//       source.close();
//     });
//     source.addEventListener("position", (event) => {
//       // console.log(event);
//       if (event.data === "EOS") {
//         source.close(); // last position reached
//       } else {
//         onPosition(event.data as number);
//       }
//     });
//
//     return source;
//   }, [onPosition, player]);
//
//   const { data: position, error } = useQuery<number>({
//     queryKey: ["/media", "/position", `/${encodeURIComponent(player)}`],
//     enabled: !isPlaying,
//   });
//
//   useMemo(() => {
//     if (!isPlaying && error) {
//       console.error("failed to fetch positon for player", player, error);
//       return;
//       // return { cancel: () => ({}) };
//     }
//     if (!isPlaying) {
//       onPosition(Number(position));
//       return;
//     }
//     // return { cancel: () => ({}) };
//   }, [error, isPlaying, onPosition, player, position]);
//
//   useMemo(() => {
//     if (isPlaying && source === null) {
//       const s = subscribe();
//       setSource(s);
//     }
//   }, [isPlaying, source, subscribe]);
//
//   // const source = new EventSource(
//   //   `http://tower:4433/api/media/position-sse/${player}`,
//   //   // {
//   //   //   withCredentials: true,
//   //   // },
//   // );
//   // source.addEventListener("error", (event) => {
//   //   console.log("error", event);
//   //   source.close();
//   // });
//   // source.addEventListener("position", (event) => {
//   //   console.log(event);
//   //   if (event.data === "EOS") {
//   //     source.close(); // last position reached
//   //   } else {
//   //     onPosition(event.data as number);
//   //   }
//   // });
//
//   return {
//     cancel: () => {
//       console.log("cancelling source", source);
//       if (source !== null) {
//         source.close();
//       }
//     },
//     subscribe: () => {
//       const s = subscribe();
//       console.log("subscribing source", s, "old", source);
//       setSource(s);
//
//       return s;
//     },
//   };
// };

// interface Source {
//   source: EventSource | null;
//   listeners: Set<(position: number) => void>;
//   subscribe: (player: Id, onData: (position: number) => void) => () => void;
// }

// const source: Source = {
//   source: null,
//   listeners: new Set(),
//   subscribe: (player: Id, onData: (position: number) => void) => {
//     source.listeners.add(onData);
//     if (!source.source) {
//       source.source = new EventSource(
//         `http://tower:4433/api/media/position-sse/${player}`,
//       );
//
//       source.source.addEventListener("error", (event) => {
//         console.log("error", event);
//         source.source?.close();
//       });
//       source.source.addEventListener("position", (event) => {
//         // console.log(event);
//         if (event.data === "EOS") {
//           source.source?.close(); // last position reached
//         } else {
//           console.log("got pos", event.data);
//           source.listeners.forEach((callback) => {
//             callback(event.data as number);
//           });
//         }
//       });
//     }
//
//     return () => {
//       source.listeners.delete(onData);
//     };
//   },
// };

// const useCurrentPlayerPosition = (onPosition: (positon: number) => void) => {
//   const { player } = useCurrentPlayer();
//
//   const { data } = useQuery<number>({
//     queryKey: [
//       "/media",
//       "/position",
//       `/${encodeURIComponent(player?.id ?? "")}`,
//     ],
//     enabled: player !== null && !player.player.isPlaying(),
//   });
//
//   const subscribe = useCallback(
//     (player: Id) => {
//       const source = new EventSource(
//         `http://tower:4433/api/media/position-sse/${player}`,
//       );
//
//       source.addEventListener("error", (event) => {
//         console.log("error", event);
//         source.close();
//       });
//       source.addEventListener("position", (event) => {
//         if (event.data === "EOS") {
//           source.close(); // last position reached
//         } else {
//           onPosition(event.data as number);
//         }
//       });
//
//       return source;
//     },
//     [onPosition],
//   );
//
//   const source = useRef<EventSource | null>(null);
//   useEffect(() => {
//     if (!player?.player.isPlaying() && data) {
//       onPosition(data);
//     } else if (player?.id) {
//       console.log("should subscribe to player");
//       source.current = subscribe(player.id);
//       return () => {
//         source.current?.close();
//       };
//       // return source.subscribe(player.id, setPosition);
//     }
//   }, [data, onPosition, player, subscribe]);
//
//   const cancel = useCallback(() => {
//     console.log("close player positoin source, onCancel");
//     source.current?.close();
//     // source?.close();
//     // source = null;
//   }, []);
//
//   const value = useMemo(() => ({ cancel }), [cancel]);
//
//   return value;
// };

const useSse = () => useContext(SseContext);

const useCurrentPlayerPos = () => {
  const [position, setPosition] = useState(0);

  const sse = useSse();
  if (sse === null) {
    throw new Error(
      "Did you forget to define <SseContextProvider> in dom tree",
    );
  }
  const { connect, close } = sse;

  const { player } = useCurrentPlayer();
  const url = `${config.server}/media/position-sse/${player?.id ?? ""}`;

  const { data } = useQuery<number>({
    queryKey: [
      "/media",
      "/position",
      `/${encodeURIComponent(player?.id ?? "")}`,
    ],
    enabled: player !== null && !player.player.isPlaying(),
  });

  useEffect(() => {
    if (data && !player?.player.isPlaying()) {
      setPosition(data);
    }
  }, [data, player?.player]);

  const listener = useCallback((_: "position", data: unknown) => {
    if (data !== "EOS") {
      setPosition(Number(data));
    } else {
      console.log("reached end of stream");
    }
  }, []);

  useEffect(() => {
    if (player?.player.isPlaying()) {
      connect({
        event: "position",
        keepalive: false,
        url,
        listener,
      });
    } else {
      close(url, listener);
    }

    return () => {
      close(url, listener);
    };
  }, [close, connect, listener, player?.player, url]);

  return position;
};

export {
  usePlayersCache,
  usePlayers,
  usePlayerImage,
  useCurrentPlayer,
  useCurrentPlayerPos,
  // usePlayerPosition,
  // useCurrentPlayerPosition,
  useSse,
  PlayersContext,
  type Player,
  type Id,
};
