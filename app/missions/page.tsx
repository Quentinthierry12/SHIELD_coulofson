import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import Missions from "./ui";

export default async function MissionsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.mustChangePassword) redirect("/change-password");
  return <Missions session={session} />;
}
