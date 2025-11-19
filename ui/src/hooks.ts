import {
  useQueries,
  useQuery,
  useQueryClient,
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

  const updateCurrentPlayer = useCallback(
    (player: Id) => {
      sessionStorage.setItem("mediaControls_lastPlayer", player);
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
};

const usePlayerImage = (image_url: string | undefined): string | null => {
  const [image, setImage] = useState<string | null>(null);

  const { data: binary } = useQuery<Uint8Array>({
    queryKey: ["/media", "/image", `/${encodeURIComponent(image_url ?? "")}`],
    enabled: image_url !== undefined && image_url !== "",
  });

  useMemo(() => {
    let url: string | null = null;
    if (binary && image_url) {
      const blob = new Blob([binary as BlobPart], {
        type: "application/octet-stream",
      });
      url = URL.createObjectURL(blob);
    }

    setImage(url);
  }, [binary, image_url]);

  return image;
};

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

export {
  usePlayersCache,
  usePlayers,
  usePlayerImage,
  useCurrentPlayer,
  useCurrentPlayerPos,
  useSse,
  usePlayerSse,
  PlayersContext,
  type Player,
  type Id,
};
