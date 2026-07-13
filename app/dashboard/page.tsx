import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import Dashboard from "./ui";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.mustChangePassword) redirect("/change-password");
  return <Dashboard session={session} />;
}
