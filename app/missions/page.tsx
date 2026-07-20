import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { needsOnboarding } from "@/lib/onboarding";
import Missions from "./ui";

export default async function MissionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  if (await needsOnboarding(session)) redirect("/onboarding");
  return <Missions session={session} />;
}
