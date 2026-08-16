import { Shell } from "@/components/console/nav";
import { NotFoundView } from "@/components/console/states";

// Unmatched URLs render inside the console shell so the sidebar stays a way out.
export default function NotFound() {
  return (
    <Shell>
      <NotFoundView />
    </Shell>
  );
}
