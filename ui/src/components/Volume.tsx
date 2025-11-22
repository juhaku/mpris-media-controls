import { Volume1, Volume2, VolumeOff } from "lucide-react";
import {
  SliderThumb,
  SliderTrack,
  Slider,
  Button,
} from "react-aria-components";
import GlassBox from "./GlassBox";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Body } from "../queryClient";

export default function Volume() {
  const [volume, setVolume] = useState(0);
  const previousVolume = useRef(volume);
  const [initial, setInitial] = useState(true);

  const adjustVolume = useMutation<unknown, Error, Body>({
    mutationKey: ["/volume"],
  });

  // experiment with mode, e.g. to get offline first, now fetches every render
  const { data } = useQuery<number>({
    queryKey: ["/volume"],
  });

  useEffect(() => {
    if (data) {
      setVolume(data);
    }
    if (initial && data) {
      setInitial(false);
      previousVolume.current = data;
    }
  }, [data, initial]);

  const updateVolume = useCallback(
    (volume: number) => {
      setVolume(volume);
      adjustVolume.mutate(Body.form({ percent: volume }));
    },
    [adjustVolume],
  );

  const renderVolumeIcon = () => {
    switch (true) {
      case volume === 0:
        return (
          <VolumeOff className="drop-shadow-glassbox text-light my-4 ml-3" />
        );
      case volume < 50:
        return (
          <Volume1 className="drop-shadow-glassbox text-light my-4 ml-3" />
        );
      default:
        return (
          <Volume2 className="drop-shadow-glassbox text-light my-4 ml-3" />
        );
    }
  };

  return (
    <GlassBox className="flex grow justify-baseline rounded-[40px]">
      <Button
        onPress={(_) => {
          if (volume !== 0) {
            updateVolume(0);
          } else {
            updateVolume(previousVolume.current);
          }
        }}
      >
        {renderVolumeIcon()}
      </Button>
      <VolumeSlider
        volume={volume}
        onChange={(volume) => {
          updateVolume(volume);
          previousVolume.current = volume;
        }}
      />
    </GlassBox>
  );
}

interface VolumeSliderProps {
  onChange: (volume: number) => void;
  volume: number;
}

function VolumeSlider({
  volume,
  onChange,
}: VolumeSliderProps): React.ReactElement {
  const [thumbOffsetX, setThumbOffsetX] = useState(0);
  const [thumbRef, setThumbRef] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (thumbRef) {
      setThumbOffsetX((_) => thumbRef.offsetLeft);
    }
  }, [thumbRef, volume]);

  return (
    <Slider
      defaultValue={volume}
      value={volume}
      maxValue={100}
      // step={5} // somehow the step does not work correctly with all volumes, especially when volume is 59 thumb somehow renders at the end
      className={"mx-5 my-[24px] block grow gap-1"}
      aria-label="Adjust volume"
      onChange={(volume) => {
        if (Array.isArray(volume)) {
          onChange(volume[0] as number);
        } else {
          onChange(volume);
        }
      }}
    >
      <SliderTrack className="col-span-2 before:rounded-[10px] [&:before]:absolute [&:before]:block [&:before]:h-[7px] [&:before]:w-[calc(100vw-var(--spacing)*16-24px-var(--spacing)*3-16px*2-24px-24px-28px)] [&:before]:bg-slate-50/10 [&:before]:content-['']">
        <span
          className={`bg-light/70 absolute block h-[7px] rounded-[10px] shadow-slate-50`}
          style={{
            width: `${thumbOffsetX.toString()}px`,
          }}
        ></span>
        <SliderThumb
          ref={setThumbRef}
          className="mt-[3px] h-9 w-9 rounded-[40px] bg-slate-50/0"
        ></SliderThumb>
      </SliderTrack>
    </Slider>
  );
}
