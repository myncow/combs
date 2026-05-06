import { redirect } from "next/navigation";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CreatePage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        qs.append(k, item);
      }
    } else {
      qs.append(k, v);
    }
  }
  const q = qs.toString();
  redirect(q ? `/?${q}` : "/");
}
