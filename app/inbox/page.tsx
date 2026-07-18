import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import Inbox from "./ui";

export default async function InboxPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.mustChangePassword) redirect("/change-password");
  return <Inbox session={session} />;
}
