import {
  animate,
  AnimatePresence,
  cubicBezier,
  motion,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";
import { Modal, ModalOverlay } from "react-aria-components";
import { useState, type ReactElement } from "react";

// Wrap React Aria modal components so they support motion values.
const MotionModal = motion(Modal);
const MotionModalOverlay = motion(ModalOverlay);

const inertiaTransition = {
  type: "inertia" as const,
  bounceStiffness: 300,
  bounceDamping: 40,
  timeConstant: 300,
};

const staticTransition = {
  duration: 0.5,
  ease: cubicBezier(0.32, 0.72, 0, 1),
};

const SHEET_MARGIN = 400;
const SHEET_RADIUS = 12;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-non-null-assertion
const root = document.querySelector("#root")! as HTMLDivElement;

interface SheetPropsInner {
  opener: (props: { onPress: () => void }) => ReactElement;
  // isOpen: boolean;
}

type SheetProps = SheetPropsInner & React.PropsWithChildren;

let open = false;
export function Sheet({ children, opener }: SheetProps): ReactElement {
  const [isOpen, setOpen] = useState(open);

  const h = window.innerHeight - SHEET_MARGIN;
  const y = useMotionValue(h);
  const bgOpacity = useTransform(y, [0, h], [0.4, 0]);
  const bg = useMotionTemplate`rgba(0, 0, 0, ${bgOpacity})`;

  // Scale the body down and adjust the border radius when the sheet is open.
  const bodyScale = useTransform(
    y,
    [0, h],
    [(window.innerWidth - 32) / window.innerWidth, 1],
  );
  const bodyTranslate = useTransform(y, [0, h], [32 - SHEET_RADIUS, 0]);
  const bodyBorderRadius = useTransform(y, [0, h], [SHEET_RADIUS, 0]);

  useMotionValueEvent(
    bodyScale,
    "change",
    (v) => (root.style.scale = v.toString()),
  );
  useMotionValueEvent(
    bodyTranslate,
    "change",
    (v) => (root.style.translate = `0 ${v.toString()}px`),
  );
  useMotionValueEvent(
    bodyBorderRadius,
    "change",
    (v) => (root.style.borderRadius = `${v.toString()}px`),
  );

  return (
    <>
      {opener({
        onPress: () => {
          open = true;
          setOpen(true);
        },
      })}
      <AnimatePresence>
        {isOpen && (
          <MotionModalOverlay
            // Force the modal to be open when AnimatePresence renders it.
            isOpen
            onOpenChange={setOpen}
            className="fixed inset-0 z-10"
            style={{ backgroundColor: bg }}
          >
            <MotionModal
              className="absolute bottom-0 w-full rounded-t-xl bg-slate-950 shadow-lg will-change-transform"
              initial={{ y: h }}
              animate={{ y: 0 }}
              exit={{ y: h }}
              transition={staticTransition}
              style={{
                y,
                top: SHEET_MARGIN,
                // Extra padding at the bottom to account for rubber band scrolling.
                paddingBottom: window.screen.height,
              }}
              drag="y"
              dragConstraints={{ top: 0 }}
              onDragEnd={(_, { offset, velocity }) => {
                if (offset.y > window.innerHeight * 0.75 || velocity.y > 10) {
                  setOpen(false);
                  open = false;
                } else {
                  animate(y, 0, { ...inertiaTransition, min: 0, max: 0 });
                }
              }}
            >
              {/* drag affordance */}
              <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-gray-400" />
              {children}
            </MotionModal>
          </MotionModalOverlay>
        )}
      </AnimatePresence>
    </>
  );
}
