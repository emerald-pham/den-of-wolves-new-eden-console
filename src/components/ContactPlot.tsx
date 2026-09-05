import { useEffect, useState, type CSSProperties } from 'react';

/**
 * The threat board behind the launcher.
 *
 * A spherical scan is not a flat sweep on a floor: it is a two-dimensional
 * circle turning through a three-dimensional volume. So the board is a
 * wireframe sphere -- meridians and parallels -- with two discs turning
 * through it on different axes at different rates, and contacts hung anywhere
 * inside that volume rather than pinned to one plane. Perspective does the
 * depth work: a contact behind the centre is genuinely further from the camera
 * and paints smaller.
 *
 * Assume the board is on screen at all times. A route chooses how prominent it
 * is -- full-bleed behind everything, or inset at whatever size suits the
 * screen -- never whether it is there at all.
 *
 * Every moving part is a CSS animation. There is no render loop, no canvas and
 * no timer, so an idle console costs nothing on the main thread and a
 * reduced-motion preference stops the whole board by flipping one attribute.
 */

type Track = {
  readonly tag: string;
  /** Degrees clockwise around the vertical axis. */
  readonly bearing: number;
  /** Degrees above (positive) or below the equator. */
  readonly elevation: number;
  /** Distance out from us: 0 at the centre of the sphere, 1 at its skin. */
  readonly range: number;
  readonly color?: string;
};

export interface PlotContact {
  readonly tag: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: string;
}

/** Hand-placed rather than random, so the board is composed and never flickers
 *  into a new arrangement on re-render. */
const CONTACTS: readonly Track[] = [
  { tag: 'TRK 01', bearing: 18, elevation: 22, range: 0.72 },
  { tag: 'TRK 02', bearing: 63, elevation: -14, range: 0.44 },
  { tag: 'UNKN', bearing: 107, elevation: 41, range: 0.86 },
  { tag: 'TRK 04', bearing: 152, elevation: -33, range: 0.61 },
  { tag: 'TRK 05', bearing: 198, elevation: 8, range: 0.93 },
  { tag: 'UNKN', bearing: 241, elevation: -52, range: 0.55 },
  { tag: 'TRK 07', bearing: 286, elevation: 29, range: 0.78 },
  { tag: 'TRK 08', bearing: 331, elevation: -6, range: 0.38 },
];

/**
 * What the hack puts on the board. These are not contacts -- they are returns
 * injected by whatever is inside the console with us, and while the hack is
 * running the board has no way to tell them from the real ones, so they are
 * tagged like ordinary tracks. It is only once the intrusion ends that the
 * system works out they were never there.
 */
const SPOOFED: readonly Track[] = [
  { tag: 'TRK 09', bearing: 41, elevation: 12, range: 0.99 },
  { tag: 'UNKN', bearing: 128, elevation: -25, range: 0.95 },
  { tag: 'TRK 11', bearing: 214, elevation: 37, range: 0.97 },
  { tag: 'TRK 12', bearing: 269, elevation: -9, range: 0.92 },
  { tag: 'UNKN', bearing: 349, elevation: 19, range: 0.98 },
];

/** What a spoofed track is called once the board knows better. */
const EXPOSED = 'FALSE';

/** How long the hostile tracks stay on the board after the intrusion clears,
 *  going to pieces. Long enough for the slowest of them to finish; the CSS
 *  carries the same budget across its duration and its delay. */
export const SPASM_MS = 2200;

const MERIDIANS = [0, 30, 60, 90, 120, 150];
const PARALLELS = [-60, -30, 0, 30, 60];

/** Custom properties are how the geometry reaches the stylesheet. */
type PlotStyle = CSSProperties & Record<`--${string}`, string | number>;

const round = (value: number): number => Math.round(value * 1e4) / 1e4;
const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Spherical coordinates to the offsets CSS translates a contact by. */
function place({ bearing, elevation, range }: Track): PlotStyle {
  const a = radians(bearing);
  const e = radians(elevation);
  const x = range * Math.cos(e) * Math.sin(a);
  const y = -range * Math.sin(e);
  const z = range * Math.cos(e) * Math.cos(a);

  return {
    '--bearing': `${bearing}deg`,
    '--x': round(x),
    '--y': round(y),
    '--z': round(z),
    // Depth, 0 at the far skin and 1 at the near one: contacts on the far side
    // of the sphere have to read as further away than perspective alone shows.
    '--depth': round((z + 1) / 2),
    // The drop line hangs from the contact to the equatorial plane, which is
    // downward for anything above it and upward for anything below.
    '--drop': round(Math.abs(y)),
    '--flip': y < 0 ? 1 : -1,
    // The sweep disc is a plane, so it crosses a given bearing twice a turn.
    '--phase': round((((bearing % 180) + 180) % 180) / 180),
  };
}

function placeCartesian({ x, y, z, color }: PlotContact): PlotStyle {
  const range = Math.hypot(x, y, z);
  const bearing = Math.atan2(x, z) * 180 / Math.PI;
  return {
    '--bearing': `${round(bearing)}deg`,
    '--x': round(x),
    '--y': round(y),
    '--z': round(z),
    '--depth': round((z + 1) / 2),
    '--drop': round(Math.abs(y)),
    '--flip': y < 0 ? 1 : -1,
    '--phase': round(((((bearing % 180) + 180) % 180) / 180)),
    '--contact-ink': color,
    '--contact-range': round(range),
  };
}

/** A parallel is a smaller circle lifted off the equator. */
function ring(latitude: number): PlotStyle {
  const e = radians(latitude);
  return { '--girth': round(Math.cos(e)), '--lift': round(Math.sin(e)) };
}

export default function ContactPlot({
  hostile = false,
  placement = 'field',
  size,
  contacts,
  centerLabel,
}: {
  hostile?: boolean;
  /** `field` fills the viewport behind everything; `inset` fills a positioned
   *  parent instead, for a board that sits inside a panel. */
  placement?: 'field' | 'inset' | 'widget';
  /** Any CSS length. Overrides the placement's default diameter. */
  size?: string | undefined;
  contacts?: readonly PlotContact[] | undefined;
  centerLabel?: string | undefined;
}) {
  const [still, setStill] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setStill(true);
    };
    preference?.addEventListener('change', onChange);
    return () => preference?.removeEventListener('change', onChange);
  }, []);

  // The hostile tracks outlive the intrusion by exactly as long as it takes
  // them to break up. Unmounting them the instant the threat clears would cut
  // the departure off at the first frame.
  const [departing, setDeparting] = useState(false);

  useEffect(() => {
    if (hostile) {
      setDeparting(true);
      return;
    }
    if (!departing) return;
    const gone = window.setTimeout(() => setDeparting(false), SPASM_MS);
    return () => window.clearTimeout(gone);
  }, [hostile, departing]);

  // Spoofed returns outlive the intrusion by exactly as long as it takes them
  // to break up. Dropping them the instant the hack ends would cut the reveal
  // off at its first frame.
  const exposed = departing && !hostile;
  const baseTracks: readonly { track: Track | PlotContact; spoof: boolean; cartesian: boolean }[] =
    contacts
      ? contacts.map((track) => ({ track, spoof: false, cartesian: true }))
      : CONTACTS.map((track) => ({ track, spoof: false, cartesian: false }));
  const tracks = [
    ...baseTracks,
    ...(hostile || departing ? SPOOFED.map((track) => ({ track, spoof: true })) : []),
  ];

  return (
    <div
      className="contact-plot"
      aria-hidden="true"
      data-hostile={String(hostile)}
      data-placement={placement}
      data-still={String(still)}
      style={size ? ({ '--plot-size': size } as PlotStyle) : undefined}
    >
      <div className="contact-plot__rig">
        {MERIDIANS.map((turn) => (
          <span
            className="contact-plot__meridian"
            key={`meridian-${turn}`}
            style={{ '--turn': `${turn}deg` } as PlotStyle}
          />
        ))}
        {PARALLELS.map((latitude) => (
          <span
            className="contact-plot__parallel"
            key={`parallel-${latitude}`}
            style={ring(latitude)}
          />
        ))}
        <span className="contact-plot__limb" />
        {centerLabel ? <span className="contact-plot__origin">{centerLabel}</span> : null}
        <div className="contact-plot__boost">
          <div className="contact-plot__sweep" />
          <div className="contact-plot__sweep contact-plot__sweep--polar" />
        </div>
        {tracks.map(({ track, spoof }, index) => (
          <div
            className="contact-plot__contact"
            key={`${track.tag}-${index}`}
            data-spoof={String(spoof)}
            data-departing={String(spoof && exposed)}
            style={'x' in track ? placeCartesian(track) : place(track)}
          >
            <div className="contact-plot__jitter">
              <span className="contact-plot__drop" />
              <span className="contact-plot__blip" />
              <span className="contact-plot__tag">
                {spoof && exposed ? EXPOSED : track.tag}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
