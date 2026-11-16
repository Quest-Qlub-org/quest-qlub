interface HoneypotInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * ボット対策用の非表示ハニーポット入力欄
 */
export function HoneypotInput({ id, value, onChange }: HoneypotInputProps) {
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
      }}
      aria-hidden="true"
    >
      <label htmlFor={id}>Website</label>
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
