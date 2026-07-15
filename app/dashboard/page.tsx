import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import Dashboard from "./ui";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.mustChangePassword) redirect("/change-password");
  // Only offer the Academy when it is actually wired up.
  return <Dashboard session={session} academyUrl={process.env.MOODLE_URL || ""} />;
}
