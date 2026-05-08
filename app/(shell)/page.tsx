import { NewMapHome } from "@/components/new-map-home";
import { getPageByKey } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const content = await getPageByKey("home");
  return <NewMapHome content={content?.key === "home" ? content : null} />;
}
