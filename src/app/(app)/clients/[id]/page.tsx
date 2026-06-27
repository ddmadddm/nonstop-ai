import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClient,
  listClients,
  listContacts,
  listAddresses,
  getClientConsultations,
  listCandidatesForClient,
} from "@/lib/db/clients";
import { getClientKnowledge } from "@/lib/db/knowledge";
import { getPricingPolicy, listRules } from "@/lib/db/client-policy";
import { listRateSheets, listRateItems } from "@/lib/db/pricing";
import { listDispatches, listSettlements, listDocuments } from "@/lib/db/client-records";
import { listClientDrafts } from "@/lib/db/assistant";
import { listOptions } from "@/lib/db/client-options";
import ClientDetail from "./ClientDetail";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const [
    contacts, addresses, consultations, candidates, all, knowledge, pricing, rules, drafts,
    dispatches, settlements, documents,
  ] = await Promise.all([
    listContacts(id),
    listAddresses(id),
    getClientConsultations(id),
    listCandidatesForClient(id),
    listClients(),
    getClientKnowledge(id),
    getPricingPolicy(id),
    listRules(id),
    listClientDrafts(id),
    listDispatches(id),
    listSettlements(id),
    listDocuments(id),
  ]);
  const relOptions = (await listOptions("relationship")).map((o) => ({ value: o.value, label: o.label }));
  const rateSheets = await listRateSheets(id);
  const rateItems: Record<string, Awaited<ReturnType<typeof listRateItems>>> = {};
  await Promise.all(rateSheets.map(async (s) => { rateItems[s.id] = await listRateItems(s.id); }));
  const clientOptions = all.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full max-w-none">
      <div className="flex items-center gap-2">
        <Link href="/clients" className="text-slate-400 hover:text-slate-900">
          ←
        </Link>
        <span className="text-lg font-semibold">{client.name}</span>
      </div>
      <ClientDetail
        client={client}
        contacts={contacts}
        addresses={addresses}
        consultations={consultations}
        candidates={candidates}
        clientOptions={clientOptions}
        knowledge={knowledge}
        pricing={pricing}
        rules={rules}
        drafts={drafts}
        dispatches={dispatches}
        settlements={settlements}
        documents={documents}
        relationshipOptions={relOptions}
        rateSheets={rateSheets}
        rateItems={rateItems}
      />
    </div>
  );
}
