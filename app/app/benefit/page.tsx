import Link from "next/link";

const incentiveItems = [
  "$20 beta trading credits for the first 250 qualified users",
  "0% Tei protocol fees for 30 days",
  "Founding Trader badge for early market participants",
  "Early access to private beta football markets",
  "Eligibility for weekly leaderboard rewards",
];

const growthGoals = [
  "250 qualified wallet visits",
  "100+ wallet connections",
  "50+ first prediction-market trades",
  "Repeat usage from the first active trader cohort",
];

export default function BenefitPage() {
  return (
    <div className="benefit-page">
      <section className="benefit-hero">
        <div className="hero-eyebrow">theMiracle Benefit Proposal</div>
        <h1 className="hero-title">
          Claim the<br />
          <span className="hero-accent">Founding Trader Pass.</span>
        </h1>
        <p className="hero-sub">
          A wallet-native activation for Solana traders: connect to Tei, claim
          beta access, and place your first prediction-market trade on a real
          football fixture.
        </p>
        <div className="benefit-actions">
          <Link href="/" className="benefit-primary">Trade Real Fixtures</Link>
          <Link href="/infrastructure" className="benefit-secondary">View Infrastructure</Link>
        </div>
      </section>

      <section className="benefit-framework">
        <div className="benefit-card audience">
          <span className="benefit-kicker">Audience</span>
          <h2>DeFi-active Solana traders</h2>
          <p>
            Wallets with meaningful SOL or USDC balances, recent DEX/swap
            activity, DeFi protocol interactions, and repeated wallet activity
            over the last 30-90 days. Secondary cluster: sports, gaming, and
            consumer-app-adjacent Solana users.
          </p>
        </div>

        <div className="benefit-card action">
          <span className="benefit-kicker">Action</span>
          <h2>Connect, claim, trade</h2>
          <p>
            Connect wallet to Tei, claim the Founding Trader Pass, and place
            one prediction-market trade on a real football fixture.
          </p>
        </div>

        <div className="benefit-card incentive">
          <span className="benefit-kicker">Incentive</span>
          <h2>$5,000+ perceived value</h2>
          <ul>
            {incentiveItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="benefit-card value">
          <span className="benefit-kicker">Value</span>
          <h2>First access to Tei markets</h2>
          <p>
            Users get early access to live football prediction markets on Solana
            and permanent founding status in Tei&apos;s trader network.
          </p>
        </div>
      </section>

      <section className="benefit-panel">
        <div>
          <span className="benefit-kicker">Campaign structure</span>
          <h2>Simple enough to convert inside a wallet UI</h2>
          <p>
            theMiracle can place one clear activation tile in Solflare or
            MetaMask: “Claim your Founding Trader Pass.” The conversion action
            is measurable on-chain because completion ends with a wallet
            connection and a first Tei market trade.
          </p>
        </div>
        <div className="benefit-metrics">
          <div>
            <strong>250</strong>
            <span>Target qualified users</span>
          </div>
          <div>
            <strong>$20</strong>
            <span>Credit per early trader</span>
          </div>
          <div>
            <strong>$5k+</strong>
            <span>Total perceived value</span>
          </div>
        </div>
      </section>

      <section className="benefit-growth">
        <div>
          <span className="benefit-kicker">Growth context</span>
          <h2>What success looks like</h2>
        </div>
        <div className="benefit-goals">
          {growthGoals.map((goal) => (
            <div key={goal}>{goal}</div>
          ))}
        </div>
      </section>

      <section className="benefit-copy">
        <span className="benefit-kicker">Submission-ready copy</span>
        <p>
          Tei is moving from devnet demo to beta testing with real football
          fixtures. Our immediate goal is to recruit the first 100-250
          high-intent Solana traders, measure first-trade conversion, and learn
          which wallet segments become repeat prediction-market users.
        </p>
      </section>
    </div>
  );
}
