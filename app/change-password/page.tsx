import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import ChangePassword from "./ui";

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ChangePassword codename={session.codename} matricule={session.matricule} />;
}
