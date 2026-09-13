/** Fixed display orientation, shared by DRADIS and the ship navigation map. */
export default function GalacticOrientationCompass({ className = '' }: { readonly className?: string }) {
  return (
    <div
      className={`ship-plot__compass ${className}`.trim()}
      role="img"
      aria-label="3D galactic orientation compass: north, south, east, west"
    >
      <span className="ship-plot__compass-title">Galactic orientation // locked</span>
      <span className="ship-plot__compass-rig" aria-hidden="true">
        <span className="ship-plot__compass-ring" />
        <span className="ship-plot__compass-ring ship-plot__compass-ring--vertical" />
        <span className="ship-plot__compass-axis ship-plot__compass-axis--north-south" />
        <span className="ship-plot__compass-axis ship-plot__compass-axis--east-west" />
        <span className="ship-plot__compass-north">North</span>
        <span className="ship-plot__compass-west">West</span>
        <span className="ship-plot__compass-origin">+</span>
        <span className="ship-plot__compass-east">East</span>
        <span className="ship-plot__compass-south">South</span>
      </span>
    </div>
  );
}
