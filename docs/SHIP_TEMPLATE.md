# Capybara ship console template

Status: design specification for implementation. Capybara is the reference
for the remaining fleet ships. This template extends the shared ship console
in [AESTHETICS.md](AESTHETICS.md#ship-console-layout-and-growth); actual
shuttlecraft retain that document's shuttlecraft console parameters.

## Identity and statistics

Keep the existing return control and faction identity. Present the following
content in this order, with the statistics between the description and role:

```text
CAPYBARA
SUPPLY SHIP
Supplies the fleet with essential food, water, and materials through salvage and recycling.

Length: 600m
Tonnage: 800,000
Crew Capacity: 5,000                         ⚠
Passengers Capacity: 500                    ⚠

Your Role: Capybara Captain
```

The warning symbols above represent red outlined triangles containing an
exclamation mark. Render them next to both capacity values when the warning
condition below applies. Do not rely on the platform's emoji color. Do not
invent a unit for tonnage. The role line reflects the actual viewing role;
Capybara Captain is the captain example, not a fixed label for every viewer.

Use amber labels, cyan values and the existing mono typography, hairline rules
and square geometry. Lay the four statistics out as a compact definition list
that wraps or stacks without clipping on narrow screens.

## Census: Survivor Population

Place **Survivor Population** inside the existing **Census** category alongside
Civil Unrest, using the resource tracks' visual language. This is the number
aboard this ship, separate from the fleet-wide arrival population readout.
Players can read it but cannot directly change it. Do not add player buttons,
editable fields, draggable ticks or a continuous slider.

The supplied reference starts at **20,000**, marked with an X. The complete
ordered track is below. Read down the left column, then down the right column;
each adjacent entry is one discrete step, regardless of the numerical gap.

| First column | Second column |
|---:|---:|
| 20,000 (initial) | 5,000 — GM alert |
| 18,500 | 4,500 |
| 17,000 | 4,000 |
| 16,000 | 3,500 |
| 15,000 — GM alert | 3,000 |
| 14,000 | 2,500 |
| 13,000 | 2,000 |
| 12,000 | 1,500 |
| 11,000 | 1,250 |
| 10,000 | 1,000 |
| 9,000 | 750 |
| 8,000 | 500 |
| 7,000 | 250 |
| 6,000 | 0 — GM alert |

Use outlined square markers and an unmistakable current-step indicator.
Mark **15,000**, **5,000** and **0** in red, with an accessible text label
identifying each as a GM alert threshold. Preserve the reference's meaning
without copying its white-paper background. Red here signifies a census
emergency, an explicit extension of the aesthetic threat palette.

On small screens, a single descending sequence is acceptable; preserve the
order and every value. Always show the current population as text. The track
must remain readable at 320px width and in short landscape viewports.

## Authority and GM alerts

Population is server-authoritative shared session state. Authorized GM actions
or implemented game effects advance through the enumerated steps. Reject
off-track values and steps beyond either endpoint. Never derive a ship's
population from the changing arrival display or let a player write it directly.

When movement reaches a red step, notify GMs through the same alert-dialog and
per-GM acknowledgement pattern as Civil Unrest. Identify the ship, population
and threshold reached. Each targeted GM dismisses their own notification;
one GM's acknowledgement must not silently dismiss another's. A failed
acknowledgement leaves the alert available to retry.

For any future action spanning several steps, process intervening red steps
so no threshold is silently skipped. Re-rendering or reconnecting at an
unchanged population must not create a new alert. Entering a threshold again
after leaving it is a new event. Keep census and unrest acknowledgements
separate so acknowledging one cannot clear the other.

## Capacity warnings

Combined capacity is crew capacity plus passengers capacity: Capybara has
**5,500** places. Compare that total with the authoritative survivor count,
not each capacity separately. Both statistics show the same red exclamation
triangle when survivors exceed the total. Provide accessible explanatory text,
for example: “Survivors exceed combined crew and passenger capacity.”

The request says triangles remove when combined capacity is **higher than**
survivors. For an exact tie, retain the warnings pending an explicit rule
change; thus the specified removal condition is strictly `capacity > survivors`.
Capybara's track has no 5,500 step, so this distinction does not affect its
current states. At 6,000 both warnings show; at 5,000 both disappear. The GM
alert at 5,000 still fires independently of capacity warnings.

## Reuse and acceptance checks

For each later ship, supply its own identity, description, role, dimensions,
capacities and approved population track. Reuse the layout and behavior;
do not copy Capybara's values into ships without supplied specifications.
Preserve the persistent DRADIS, status rail and visible return navigation.

Implementation must demonstrate:

- Statistics appear after the description and before the actual role.
- Capybara starts at 20,000 and can occupy only the 28 listed steps.
- Players cannot directly change population, including through forged requests.
- Reaching 15,000, 5,000 or 0 creates the correct independent GM notifications.
- Acknowledgement, retry and reconnect do not lose or duplicate alerts.
- Both capacity warnings appear at 20,000 and 6,000 and disappear at 5,000.
- All values and navigation remain accessible on narrow, wide and short screens.

Follow the repository's test-first policy when implementing these behaviors.
