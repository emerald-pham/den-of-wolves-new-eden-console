import './onboarding.css';

/** Source-backed shared orientation shown after the private assignment. */
export function PlayerOnboardingGuide() {
  return (
    <div className="onboarding-guide">
      <section className="onboarding-panel" aria-label="Table ground rules">
        <p className="onboarding-eyebrow">Before the first cycle</p>
        <h2>Table ground rules</h2>
        <ul>
          <li>Keep your own role and loyalty information private. Do not show another player your brief or read theirs.</li>
          <li>Do not use phones to message other players during play. Do not photograph game components to share with other players.</li>
          <li>Resources are tracked with tokens or resource sheets: strytium ore, strytium fuel, food, water, and material.</li>
          <li>Continue to follow the Code of Conduct acknowledged at session entry.</li>
        </ul>
      </section>

      <section className="onboarding-panel" aria-label="Core game loop">
        <p className="onboarding-eyebrow">One cycle at a time</p>
        <h2>Core game loop</h2>
        <ol>
          <li><strong>Team Phase.</strong> Stay at your ship’s table and run its maintenance cycle.</li>
          <li><strong>Coordination Phase.</strong> Move and communicate freely, operate shuttles, trigger jumps, run away missions, or respond to Wolf attacks.</li>
          <li><strong>Pursuit.</strong> Track the pursuit counter; pursuit reaches 10 and the fleet’s run fails.</li>
          <li><strong>Jump and docking.</strong> When ready, use the ship’s Jump card to announce the jump. During a Wolf attack, shuttles dock with the nearest ship; armed players go to the Battle Table.</li>
          <li><strong>Away missions.</strong> A new destination can open one mission. Assign one Mission Leader to coordinate its team.</li>
        </ol>
      </section>
    </div>
  );
}
