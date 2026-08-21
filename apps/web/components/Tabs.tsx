import Link from "next/link";

export function Tabs({ active }: { active: "startups" | "gigs" }) {
  return (
    <header className="topbar">
      <div className="brand">gigpull<span>Bangalore</span></div>
      <nav className="tabs">
        <Link className="tab" data-active={active === "gigs"} href="/gigs">Local gigs</Link>
        <Link className="tab" data-active={active === "startups"} href="/startups">Startups</Link>
      </nav>
    </header>
  );
}
