import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { needsOnboarding } from "@/lib/onboarding";
import Inbox from "./ui";

export default async function InboxPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  if (await needsOnboarding(session)) redirect("/onboarding");
  return <Inbox session={session} />;
}
