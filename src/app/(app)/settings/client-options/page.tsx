import Link from "next/link";
import { listCategories, listAllOptions, type ClientOption } from "@/lib/db/client-options";
import OptionsManager from "./OptionsManager";

export const dynamic = "force-dynamic";

export default async function ClientOptionsPage() {
  const categories = await listCategories();
  const byCat: Record<string, ClientOption[]> = {};
  await Promise.all(
    categories.map(async (c) => {
      byCat[c.key] = await listAllOptions(c.key);
    }),
  );

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full max-w-4xl">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-slate-400 hover:text-slate-900">←</Link>
        <h1 className="text-lg font-semibold">거래처 항목 관리</h1>
      </div>
      <p className="text-sm text-slate-500">
        거래처 화면에서 쓰는 선택 항목(관계/유입·결제방식·역할 등)을 직접 추가/수정/비활성화합니다.
        삭제는 불가하며, 사용 중인 항목도 비활성화만 됩니다. 모든 변경은 이력에 기록됩니다.
      </p>
      <OptionsManager categories={categories} byCat={byCat} />
    </div>
  );
}
