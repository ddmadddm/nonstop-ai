import { CategoryBadge } from "@/components/badges";
import { getFaqs } from "@/lib/data";

export default async function FaqsPage() {
  const faqs = await getFaqs();

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          상담 데이터에서 자주 묻는 질문을 정리합니다. (2차 목표: 상담이 쌓이면
          AI가 FAQ 후보를 자동 생성)
        </p>
        <button
          className="rounded-lg bg-slate-900 text-white text-sm font-medium px-3 py-2 shrink-0 disabled:opacity-50"
          disabled
          title="목업 모드"
        >
          + FAQ 추가
        </button>
      </div>

      <div className="space-y-3">
        {faqs.map((f) => (
          <div
            key={f.id}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start gap-2">
              <CategoryBadge categoryKey={f.categoryKey} />
              <div className="ml-auto text-xs text-slate-400">{f.updatedAt}</div>
            </div>
            <div className="mt-2 font-medium">Q. {f.question}</div>
            <div className="mt-1 text-sm text-slate-600 preline">
              A. {f.answer}
            </div>
            {f.keywords.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {f.keywords.map((k) => (
                  <span
                    key={k}
                    className="text-xs rounded bg-slate-100 text-slate-500 px-1.5 py-0.5"
                  >
                    #{k}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
