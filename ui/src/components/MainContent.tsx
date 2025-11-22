import { useSettings } from "../settings";
import GlassBox from "./GlassBox";
import MediaButtons from "./MediaButtons";
import MediaTrack from "./MediaTrack";
import {
  useCurrentPlayer,
  useCurrentPlayerPos,
  usePlayerImage,
  usePlayers,
  usePlayerSse,
  type Player,
} from "../hooks";
import {
  useCallback,
  type CSSProperties,
  type PropsWithChildren,
  type ReactElement,
} from "react";
import {
  Button,
  Dialog,
  Heading,
  ListBox,
  ListBoxItem,
} from "react-aria-components";
import Volume from "./Volume";
import { Check, Settings } from "lucide-react";
import { Sheet } from "./Sheet";

export default function MainContent() {
  const settings = useSettings();
  const players = usePlayers();
  usePlayerSse();
  const { player, update } = useCurrentPlayer();

  const trimTitle = (title: string): string => {
    if (title.length > 50) {
      return `${title.substring(0, 50)}...`;
    } else {
      return title;
    }
  };

  const renderArtist = (artist: string[]) => {
    const artistStr = artist.join(", ");
    if (artistStr.length > 0) {
      return `${artistStr} - `;
    } else {
      return "";
    }
  };

  const renderPlayerInfo = () => {
    return (
      <GlassBox className="mx-6 mb-14 p-4">
        {player ? (
          <>
            <span className="text-light text-shadow-glassbox font-bold">
              {player.player.name}
            </span>
            <p className="text-light text-shadow-glassbox">
              {renderArtist(player.player.meta.artist)}
              {trimTitle(player.player.meta.title)}
            </p>
          </>
        ) : (
          <p className="text-light text-shadow-glassbox">No Player available</p>
        )}
      </GlassBox>
    );
  };

  return (
    <Main>
      <h1 className="text-light text-center text-2xl">Media Controls</h1>
      <div className="flex h-[calc(100vh-var(--text-2xl)-var(--spacing)*2)] flex-col justify-end text-white">
        {renderPlayerInfo()}
        {<Controls />}
        <div className="mx-6 mt-16 flex pb-10">
          <Volume />
          <Sheet
            opener={(props) => (
              <Button
                {...props}
                className={`p4 shadow-glass-box ml-6 rounded-[50%] border border-white/30 bg-white/10 p-4 backdrop-blur-md`}
              >
                <Settings className="text-light" />
              </Button>
            )}
          >
            <Dialog className="text-light p-6">
              <Heading slot="title" className="m-3 text-lg">
                Select Player
              </Heading>
              <ListBox
                aria-label="Available Players"
                selectionMode="single"
                className="rounded-xl"
              >
                {players.players.map(({ id, player: p }) => {
                  return (
                    <ListBoxItem
                      key={id}
                      className="m-1 rounded-md border border-white/30 px-3 py-3"
                      textValue={p.name}
                      onPress={(_) => {
                        update(id);
                      }}
                    >
                      <span className="flex">
                        <span className="grow">{p.name}</span>
                        {id === player?.id && <Check className="justify-end" />}
                      </span>
                    </ListBoxItem>
                  );
                })}
              </ListBox>
            </Dialog>
          </Sheet>
        </div>
      </div>
      {settings.showDebugInfo && (
        <span className="absolute bottom-0 h-24 text-white/15">
          h: {window.outerHeight.toString()} w: {window.outerWidth.toString()}{" "}
          user-agent: {navigator.userAgent}
        </span>
      )}
    </Main>
  );
}

function Main({
  children,
}: PropsWithChildren &
  React.HtmlHTMLAttributes<HTMLElement>): React.ReactElement {
  const { player } = useCurrentPlayer();

  const renderMain = useCallback(
    (styles: CSSProperties) => (
      <main
        className={`bg-dark from-dark via-darkrose/70 to-dark h-dvh w-dvw bg-linear-to-bl from-40% via-70% to-95% bg-cover bg-center bg-no-repeat`}
        style={{ ...styles }}
      >
        <div className="from-black-transparent to-black-transparent via-black-light-transparent bg-linear-to-b via-50%">
          {children}
        </div>
      </main>
    ),
    [children],
  );

  const WithBg = ({ player }: { player: Player }) => {
    const imageUrl = usePlayerImage(player.meta.art_url);
    return renderMain(
      imageUrl !== null
        ? {
            backgroundImage: `url(${imageUrl})`,
          }
        : {},
    );
  };

  const WithoutBg = () => {
    return renderMain({});
  };

  return player !== null ? <WithBg player={player.player} /> : <WithoutBg />;
}

function Controls(): ReactElement {
  const position = useCurrentPlayerPos();
  const { player } = useCurrentPlayer();

  return (
    <div>
      <MediaButtons />
      <div className="mx-6">
        <MediaTrack
          length={player?.player.meta.length ?? 0}
          position={position}
        />
      </div>
    </div>
  );
}
