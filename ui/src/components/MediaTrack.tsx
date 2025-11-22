import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import {
  Slider as AriaSlider,
  type SliderProps as AriaSliderProps,
  SliderOutput,
  SliderThumb,
  SliderTrack,
} from "react-aria-components";
import { useCurrentPlayer } from "../hooks";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface SliderPropsInner {
  length: number;
  position: number;
}

type SliderProps = SliderPropsInner & PropsWithChildren<AriaSliderProps>;

export default function MediaTrack({
  length,
  position,
}: SliderProps): React.ReactElement<SliderProps> {
  const client = useQueryClient();
  const { player } = useCurrentPlayer();
  const [value, setValue] = useState(0);
  const [drag, setDrag] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [thumbOffsetX, setThumbOffsetX] = useState(0);
  const [thumbRef, setThumbRef] = useState<HTMLDivElement | null>(null);

  const maxLength = toTime(length);
  const lastDragPositon = useRef<number | null>(null);
  const r = useRef<number>(null);
  useEffect(() => {
    if (!drag && !loading) {
      if (lastDragPositon.current) {
        setValue(lastDragPositon.current);
        lastDragPositon.current = null;
      } else {
        setValue(position);
      }
    }
    if (loading) {
      r.current ??= setTimeout(() => {
        setLoading(false);
        setDrag(false);
        r.current = null;
      }, 400);
    }
  }, [drag, loading, position, value]);

  useEffect(() => {
    if (thumbRef) {
      setThumbOffsetX((_) => thumbRef.offsetLeft);
    }
  }, [thumbRef, value]);

  const setPosition = useMutation({
    mutationKey: [
      "/media",
      "/position",
      `/${encodeURIComponent(player?.id ?? "")}`,
      `?${new URLSearchParams({ track_id: player?.player.meta.track_id ?? "", position: value.toString() }).toString()}`,
    ],
    onSuccess: () => {
      setTimeout(async () => {
        await client.invalidateQueries({
          queryKey: [
            "/media",
            "/position",
            `/${encodeURIComponent(player?.id ?? "")}`,
          ],
        });
      }, 400);
    },
  });

  return (
    <AriaSlider
      defaultValue={value}
      value={value}
      maxValue={length}
      className={"mx-2 mt-1"}
      aria-label="Seek position"
      isDisabled={length === 0}
      onChange={(value) => {
        if (!drag) {
          setDrag(true);
        }

        if (Array.isArray(value)) {
          setValue(value[0] as number);
        } else {
          setValue(value);
        }
      }}
      onChangeEnd={(value) => {
        setPosition.mutate();
        setLoading(true);

        if (Array.isArray(value)) {
          setValue(value[0] as number);
          lastDragPositon.current = value[0] as number;
        } else {
          setValue(value);
          lastDragPositon.current = value;
        }
      }}
    >
      <SliderTrack className="before:drop-shadow-glassbox before:rounded-[10px] [&:before]:absolute [&:before]:block [&:before]:h-[7px] [&:before]:w-[calc(100vw-var(--spacing)*16-2px)] [&:before]:bg-slate-50/10 [&:before]:content-['']">
        <span
          className="bg-inidicator/90 drop-shadow-track-indicator absolute block h-[7px] rounded-[10px]"
          style={{
            width: `${thumbOffsetX.toString()}px`,
          }}
        ></span>
        <SliderThumb
          className="z-2 h-10 w-20 translate-y-[9%] rounded-[40px]"
          ref={setThumbRef}
        ></SliderThumb>
      </SliderTrack>
      {drag && (
        <SliderOutput
          className="text-light text-shadow-glassbox order drop-shadow-glassbox order absolute z-1 -mt-14 rounded-[40px] border-white/5 bg-white/10 px-3 py-1.5 backdrop-blur-md"
          style={{ left: thumbOffsetX }}
        >
          {(state) => {
            const value = state.state.values[0];
            return toFormattedTime(toTime(value), maxLength);
          }}
        </SliderOutput>
      )}
      <div className="flex justify-end">
        <SliderOutput className="text-light text-shadow-glassbox drop-shadow-glassbox mt-5 rounded-[40px] border-white/5 bg-white/10 px-3 py-1.5 backdrop-blur-md">
          {(state) => {
            const value = state.state.values[0];
            const max = toFormattedTime(maxLength, maxLength);
            const current = toFormattedTime(toTime(value), maxLength);
            return `${current} / ${max}`;
          }}
        </SliderOutput>
      </div>
    </AriaSlider>
  );
}

const UNITS = {
  // µs: 1,
  ms: 1000,
  s: 1000000,
  m: 60000000,
  h: 3600000000,
} as const;

function toTime(microseconds: number) {
  let remaining = microseconds;

  const hours = Math.floor(remaining / UNITS.h);
  remaining %= UNITS.h;

  const minutes = Math.floor(remaining / UNITS.m);
  remaining %= UNITS.m;

  const seconds = Math.floor(remaining / UNITS.s);
  remaining %= UNITS.s;

  // const milliseconds = Math.floor(remaining / UNITS.ms);
  // const micros = remaining % UNITS.ms;

  return {
    hours,
    minutes,
    seconds,
    // milliseconds,
    // microseconds: micros,
    // totalMicroseconds: microseconds,
  };
}

const numberFormat = new Intl.NumberFormat(undefined, {
  minimumIntegerDigits: 2,
});

function toFormattedTime(
  time: ReturnType<typeof toTime>,
  maxLength: ReturnType<typeof toTime>,
): string {
  let s = "";
  if (maxLength.hours > 0) {
    s = s + `${time.hours.toString()}:`;
  }
  s = s + `${numberFormat.format(time.minutes)}:`;
  s = s + numberFormat.format(time.seconds);

  return s;
}
