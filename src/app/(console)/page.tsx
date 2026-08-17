import { redirect } from "next/navigation";
import { LANDING_ROUTE } from "@/lib/routes";

export default function Home() {
  // The landing page, since the console grew one. It was `/agents` while the
  // nav had no entry above the surfaces. Signing in lands on the same route,
  // by the same constant — a sign-in never passes through here.
  redirect(LANDING_ROUTE);
}
