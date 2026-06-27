// 관계/유입 구분 — Select만(추가/수정은 설정 > 거래처 관리에서). 훅 없는 순수 컴포넌트.
//   비활성 항목은 신규 선택지에는 없지만, 기존 거래처가 그 값을 가지면 '(비활성)'으로 표시 유지.
export default function RelationshipField({
  name,
  defaultValue,
  options,
}: {
  name: string;
  defaultValue: string | null;
  options: { value: string; label: string }[];
}) {
  const current = defaultValue ?? "";
  const hasCurrent = !current || options.some((o) => o.value === current);
  return (
    <select name={name} defaultValue={current} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
      <option value="">미분류</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
      {!hasCurrent && <option value={current}>{current} (비활성)</option>}
    </select>
  );
}
