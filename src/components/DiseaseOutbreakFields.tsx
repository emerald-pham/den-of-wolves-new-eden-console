interface Props {
  disabled: boolean;
  ships: readonly { id: string; name: string }[];
  diseaseShipIds: readonly string[];
  diseaseWork: string;
  diseaseRisk: string;
  setDiseaseShipIds: (ids: string[]) => void;
  setDiseaseWork: (text: string) => void;
  setDiseaseRisk: (text: string) => void;
}

export default function DiseaseOutbreakFields({ disabled, ships, diseaseShipIds, diseaseWork, diseaseRisk, setDiseaseShipIds, setDiseaseWork, setDiseaseRisk }: Props) {
  return (
              <fieldset className="gm-disease-report" disabled={disabled}>
                <legend>Outbreak report — visible to all session members on delivery</legend>
                <p className="gm-console__hint">Record reported conditions here. Private reasoning belongs in the facilitator notes. This report does not impose quarantine or change docking permissions.</p>
                {ships.map((ship) => (
                  <label key={ship.id} className="gm-disease-report__ship">
                    <input type="checkbox" checked={diseaseShipIds.includes(ship.id)}
                      onChange={(event) => setDiseaseShipIds(event.target.checked ? [...diseaseShipIds, ship.id] : diseaseShipIds.filter(id => id !== ship.id))} />
                    {ship.name}
                  </label>
                ))}
                <label className="gm-wolf-preparation__field"><span>Reported work restrictions (public)</span>
                  <textarea rows={2} maxLength={1000} value={diseaseWork} onChange={(event) => setDiseaseWork(event.target.value)} />
                </label>
                <label className="gm-wolf-preparation__field"><span>Escalation risk (public)</span>
                  <textarea rows={2} maxLength={1000} value={diseaseRisk} onChange={(event) => setDiseaseRisk(event.target.value)} />
                </label>
              </fieldset>
  );
}
