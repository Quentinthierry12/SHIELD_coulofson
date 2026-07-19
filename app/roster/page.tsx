import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { needsOnboarding } from "@/lib/onboarding";
import Roster from "./ui";

export default async function RosterPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.mustChangePassword) redirect("/change-password");
  if (await needsOnboarding(session)) redirect("/onboarding");
  return <Roster isAdmin={session.role === "admin"} />;
}
