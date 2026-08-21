import { Tabs } from "@/components/Tabs";

/**
 * The local-business tab still runs locally against SQLite.
 *
 * Saying so plainly beats showing an empty board that looks broken. It moves
 * here once the startup tab has proved the deployment.
 */
export default function Gigs() {
  return (
    <div className="shell">
      <Tabs active="gigs" />
      <div className="empty">
        <p><strong>Local gigs still run on your machine.</strong></p>
        <p>
          This tab holds phone numbers and email addresses for ~1,200 Bangalore
          businesses. It stays on local SQLite until the deployment is proven,
          so nothing about them is uploaded before it has to be.
        </p>
        <p>Run it the way you always have:</p>
        <p><code>gigpull run --region bangalore</code> then <code>gigpull web</code></p>
      </div>
    </div>
  );
}
