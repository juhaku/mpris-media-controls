import { type PropsWithChildren, type ReactElement } from "react";
import { Button, type PressEvent } from "react-aria-components";
import {
  mutationOptions,
  QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useCurrentPlayer } from "../hooks";
import { Pause, Play, StepBack, StepForward } from "lucide-react";

interface MediaButtonProps {
  subscribeStream: () => void;
  cancelStream: () => void;
}

function seekOptions(
  currentPlayer: string,
  offset: number,
  client: QueryClient,
) {
  return mutationOptions({
    mutationKey: [
      "/media",
      "/seek",
      `/${currentPlayer}`,
      `?${new URLSearchParams({ offset: offset.toString() }).toString()}`,
    ],
    onSuccess: () => {
      setTimeout(async () => {
        await client.invalidateQueries({
          queryKey: ["/media", "/position", `/${currentPlayer}`],
        });
      }, 250); // maybe increase time, as it might not always get the changed position
    },
  });
}

export default function MediaButtons({
  subscribeStream,
  cancelStream,
}: MediaButtonProps): ReactElement<MediaButtonProps> {
  const client = useQueryClient();

  const { player } = useCurrentPlayer();
  const hasPlayer = player !== null;
  const playerId = hasPlayer ? player.id : "";
  const isPlaying = hasPlayer && player.player.isPlaying();

  const togglePlay = useMutation({
    mutationKey: ["/media", "/play_pause", `/${playerId}`],
    onSuccess: () => {
      setTimeout(async () => {
        await client.invalidateQueries({
          queryKey: ["/media", "/status", `/${playerId}`],
        });
      }, 200);
    },
  });

  const seekFwd = useMutation(seekOptions(playerId, 5, client));
  const seekRev = useMutation(seekOptions(playerId, -5, client));

  return (
    <div className="mx-4 grid grid-cols-3 items-center gap-3 py-4">
      {/* <div className="grid grid-cols-3 items-center gap-3 bg-white/50 mx-4 rounded-xl py-4"> */}
      {/* <div className="shadow-glass-box absolute h-31 w-[calc(100%-var(--spacing)*4*2)] rounded-2xl border border-white/30 bg-white/20 backdrop-blur-md backdrop-saturate-180"></div> */}
      {/* <div className="grid grid-cols-3 items-center gap-3 border-white *:border"> */}
      <div className="z-1 flex justify-end">
        <Btn
          size="size-22"
          disabled={!hasPlayer}
          onPress={() => {
            seekRev.mutate();
          }}
        >
          <StepBack className="drop-shadow-inidicator/40 size-8 drop-shadow-md" />
        </Btn>
      </div>
      <div className="z-1 flex justify-center">
        <Btn
          size="size-25"
          disabled={!hasPlayer}
          onPress={() => {
            togglePlay.mutate();
            if (isPlaying) {
              cancelStream();
            } else {
              subscribeStream();
            }
          }}
        >
          {isPlaying ? (
            <Pause className="drop-shadow-inidicator/40 size-12 drop-shadow-md" />
          ) : (
            <Play className="drop-shadow-inidicator/40 size-12 drop-shadow-md" />
          )}
        </Btn>
      </div>
      <div className="z-1 flex justify-start">
        <Btn
          size="size-22"
          disabled={!hasPlayer}
          onPress={() => {
            seekFwd.mutate();
          }}
        >
          <StepForward className="drop-shadow-inidicator/40 size-8 drop-shadow-md" />
        </Btn>
      </div>
    </div>
  );
}

interface BtnProps {
  onPress?: (e: PressEvent) => void;
  size: string;
  disabled: boolean;
}

function Btn({
  children,
  size,
  onPress,
  disabled,
}: PropsWithChildren<BtnProps>): ReactElement<BtnProps> {
  // shadow-glass-box absolute h-31 w-[calc(100%-var(--spacing)*4*2)] rounded-2xl border border-white/30 bg-white/20 backdrop-blur-md backdrop-saturate-180
  return (
    <Button
      onPress={onPress}
      isDisabled={disabled}
      className={`p4 ${size} shadow-glass-box text-light flex items-center justify-center rounded-xl border border-white/30 bg-white/10 backdrop-blur-md`}
    >
      {children}
    </Button>
  );
}
