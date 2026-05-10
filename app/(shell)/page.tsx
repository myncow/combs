import { NewMapHome } from "@/components/new-map-home";
import { getPageByKey } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const content = await getPageByKey("home");
  if (content?.key !== "home") {
    throw new Error("Home page content is missing.");
  }
  return <NewMapHome content={content} />;
}
