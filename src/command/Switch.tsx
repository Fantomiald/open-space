/** An on/off switch, for a setting that applies at once. `label`: what it turns on, read out (the row shows it). */
export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (checked: boolean) => void; label: string; id?: string }) {
  return (
    <button type="button" role="switch" id={id} className="cp-switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span className="cp-switch__thumb" aria-hidden="true" />
    </button>
  );
}
