import {
  createContext,
  useCallback,
  useMemo,
  useReducer,
  type Context,
} from "react";
import type { Id, Metadata, Player, Status } from "./hooks";

interface Players {
  players: { id: Id; player: Player }[];
  current: string | null;
  updateStatus: (action: Omit<UpdateStatus, "type">) => void;
  updateMetadata: (action: Omit<UpdateMetadata, "type">) => void;
  setPlayer: (action: Omit<SetPlayer, "type">) => void;
  setCurrent: (action: Omit<SetCurrent, "type">) => void;
  hasPlayer: (id: Id) => boolean;
  getPlayer: (id: Id) => Player | undefined;
}

type ActionType =
  | "UPDATE_METADATA"
  | "UPDATE_STATUS"
  | "SET_PLAYER"
  | "SET_CURRENT";

interface UpdateMetadata {
  type: Extract<ActionType, "UPDATE_METADATA">;
  id: Id;
  metadata: Metadata;
}

interface SetPlayer {
  type: Extract<ActionType, "SET_PLAYER">;
  id: Id;
  name: string;
  metadata: Metadata;
}

interface UpdateStatus {
  type: Extract<ActionType, "UPDATE_STATUS">;
  id: Id;
  status: Status;
}

interface SetCurrent {
  type: Extract<ActionType, "SET_CURRENT">;
  id: Id;
}

interface PlayersState {
  players: Record<Id, Player | undefined>;
  current: string | null;
}

type Actions = UpdateMetadata | SetPlayer | UpdateStatus | SetCurrent;

function reducer(state: PlayersState, action: Actions): PlayersState {
  switch (action.type) {
    case "UPDATE_METADATA": {
      const player = state.players[action.id] as Required<Player>;

      return {
        ...state,
        players: {
          ...state.players,
          [action.id]: {
            ...player,
            meta: { ...player.meta, ...action.metadata },
          },
        },
      };
    }
    case "UPDATE_STATUS": {
      return {
        ...state,
        players: {
          ...state.players,
          [action.id]: {
            ...(state.players[action.id] as Required<Player>),
            status: action.status,
          },
        },
      };
    }
    case "SET_PLAYER": {
      return {
        ...state,
        players: {
          ...state.players,
          [action.id]: {
            name: action.name,
            meta: action.metadata,
            status: null,
            isPlaying() {
               
              return this.status === "Playing";
            },
          },
        },
      };
    }
    case "SET_CURRENT": {
      return {
        ...state,
        current: action.id,
      };
    }
  }
}

const createIntialState = (): PlayersState => ({
  players: {},
  current: null,
});

const PlayersContext: Context<Players | null> = createContext<null | Players>(
  null,
);

function PlayersContextProvider({ children }: React.PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, null, createIntialState);

  const updateMetadata = useCallback(
    (metadata: Omit<UpdateMetadata, "type">) => {
      dispatch({ type: "UPDATE_METADATA", ...metadata });
    },
    [],
  );
  const updateStatus = useCallback((status: Omit<UpdateStatus, "type">) => {
    dispatch({ type: "UPDATE_STATUS", ...status });
  }, []);

  const setPlayer = useCallback((player: Omit<SetPlayer, "type">) => {
    dispatch({ type: "SET_PLAYER", ...player });
  }, []);

  const setCurrent = useCallback((current: Omit<SetCurrent, "type">) => {
    dispatch({ type: "SET_CURRENT", ...current });
  }, []);

  const hasPlayer = useCallback(
    (id: Id) => state.players[id] !== undefined,
    [state.players],
  );

  const getPlayer = useCallback((id: Id) => state.players[id], [state.players]);

  const value: Players = useMemo(
    () => ({
      updateMetadata,
      updateStatus,
      setPlayer,
      setCurrent,
      current: state.current,
      hasPlayer,
      getPlayer,
      players: Object.entries(state.players).map(([id, player]) => ({
        id,
        player: player as Required<Player>,
      })),
    }),
    [
      updateMetadata,
      updateStatus,
      setPlayer,
      setCurrent,
      state,
      hasPlayer,
      getPlayer,
    ],
  );

  return (
    <PlayersContext.Provider value={value}>{children}</PlayersContext.Provider>
  );
}

export { PlayersContext, type Players, PlayersContextProvider };
