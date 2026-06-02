import { categoryColor, categoryName } from "@/lib/categories";
import type { ConversationStatus, DispatchStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";
import { cx } from "@/lib/utils";

export function CategoryBadge({ categoryKey }: { categoryKey: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        categoryColor(categoryKey),
      )}
    >
      {categoryName(categoryKey)}
    </span>
  );
}

const STATUS_COLOR: Record<ConversationStatus, string> = {
  open: "bg-blue-100 text-blue-700",
  pending: "bg-amber-100 text-amber-700",
  closed: "bg-slate-100 text-slate-500",
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_COLOR[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const DISPATCH_COLOR: Record<DispatchStatus, string> = {
  배차중: "bg-amber-100 text-amber-700",
  배차완료: "bg-emerald-100 text-emerald-700",
  재배차: "bg-rose-100 text-rose-700",
  운행: "bg-blue-100 text-blue-700",
  완료: "bg-slate-100 text-slate-500",
  취소: "bg-slate-200 text-slate-500",
};

export function DispatchBadge({ status }: { status: DispatchStatus }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        DISPATCH_COLOR[status],
      )}
    >
      {status}
    </span>
  );
}
