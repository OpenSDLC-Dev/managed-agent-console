import { redirect } from "next/navigation";

export default function Home() {
  // The landing page, since the console grew one. It was `/agents` while the
  // nav had no entry above the surfaces.
  redirect("/dashboard");
}
