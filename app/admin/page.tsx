import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AdminUI from "./ui";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  if (session.role !== "admin") redirect("/dashboard");
  return <AdminUI myClearance={session.clearance} myId={session.id} />;
}
