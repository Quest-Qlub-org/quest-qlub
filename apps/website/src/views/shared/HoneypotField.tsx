interface HoneypotFieldProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
}

/**
 * ボット対策用の不可視ハニーポット入力欄。
 */
export function HoneypotField({
  value,
  onChange,
  id = "_website_hp",
  label = "Leave this field empty",
}: HoneypotFieldProps) {
  return (
    <div
      style={{
        opacity: 0,
        position: "absolute",
        top: 0,
        left: "-9999px",
        height: 0,
        width: 0,
        overflow: "hidden",
        zIndex: -1,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        name="_hp"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
