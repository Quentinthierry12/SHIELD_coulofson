import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { needsOnboarding } from "@/lib/onboarding";
import Dashboard from "./ui";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  if (await needsOnboarding(session)) redirect("/onboarding");
  // Only offer the Academy when it is actually wired up.
  return <Dashboard session={session} academyUrl={process.env.MOODLE_URL || ""} />;
}
