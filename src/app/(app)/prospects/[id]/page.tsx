import Link from "next/link";
import { notFound } from "next/navigation";
import { getProspect } from "@/lib/db/prospects";
import { listClients } from "@/lib/db/clients";
import ProspectDetail from "./ProspectDetail";

export const dynamic = "force-dynamic";

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [prospect, all] = await Promise.all([getProspect(id), listClients()]);
  if (!prospect) notFound();
  const clientOptions = all.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Link href="/prospects" className="text-slate-400 hover:text-slate-900">
          ←
        </Link>
        <span className="text-lg font-semibold">
          {prospect.name ?? "(거래처명 미상)"}
        </span>
      </div>
      <ProspectDetail prospect={prospect} clientOptions={clientOptions} />
    </div>
  );
}
