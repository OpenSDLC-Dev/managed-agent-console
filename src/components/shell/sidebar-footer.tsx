import { ConnectionStatus } from "@/components/shell/connection-status";
import { SignedInAs } from "@/components/shell/signed-in-as";

/**
 * The bottom of the sidebar: who is signed in, and whether the platform answers.
 *
 * It exists to own the rule above it. That rule used to be on each block, so
 * the number of dividers the sidebar ended in was however many blocks happened
 * to render — one on a password-gated deployment, two where identity is
 * configured ([#107](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/107)),
 * which is a difference nobody chose and only the configuration that could not
 * be shot until #99 could show. Owned by the group, the rule says the same
 * thing whatever is inside it, and a third block joining cannot add a third
 * line.
 *
 * That the footer is ruled off at all is the divergence, and a deliberate one
 * recorded in docs/design-reference.md: the reference console's footer draws
 * none, because its account block is an inset button that carries its own edges.
 */
export function SidebarFooter() {
  return (
    <div className="border-t border-sidebar-border">
      <SignedInAs />
      <ConnectionStatus />
    </div>
  );
}
