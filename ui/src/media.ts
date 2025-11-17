import { createContext, useContext } from "react";

type NameId = string[];

// const Status = {
//   Playing: "Playing",
//   Stopped: "Stopped",
//   Paused: "Paused",
// } as const;

type Status = "Playing" | "Stopped" | "Paused";

interface Media {
  /**
   * current Player id
   */
  currentPlayer: NameId;
  players: Player[];
  getPlayer: (id: string) => Player | undefined;
  currentPlayerId(): string | undefined;
  update: (
    currentPlayer: NameId | undefined,
    players: { data: Metadata[]; players: NameId[] },
  ) => void;
}

interface Player {
  nameAndId: string[];
  /**
   * now playing me metadata
   */
  meta: Metadata;
}

interface Metadata {
  track_id: string;
  title: string;
  art_url: string;
  url: string;
  length: number;
  artist: string[];
}

const defaultMedia: Media = {
  currentPlayer: [],
  players: [],
  getPlayer(id) {
    return this.players.find((player) => player.nameAndId[1] === id);
  },
  currentPlayerId(): string | undefined {
    if (Array.isArray(this.currentPlayer) && this.currentPlayer.length) {
      return this.currentPlayer[1];
    } else {
      return undefined;
    }
  },
  update(
    currentPlayer: NameId | undefined,
    playersWithMetadata: { data: Metadata[]; players: NameId[] },
  ) {
    if (currentPlayer) {
      this.currentPlayer = currentPlayer;
    }

    this.players = playersWithMetadata.data.map((metadata, index) => ({
      nameAndId: playersWithMetadata.players[index],
      meta: metadata,
    }));
  },
};

const MediaContext = createContext<Media>(defaultMedia);

const useMedia = () => useContext(MediaContext);

export {
  type NameId,
  type Media,
  type Metadata,
  MediaContext,
  useMedia,
  defaultMedia,
  type Status,
};
