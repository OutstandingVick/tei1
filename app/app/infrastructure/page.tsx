import {
  IS_QUICKNODE_RPC,
  SOLANA_NETWORK,
  SOLANA_RPC_PROVIDER,
  SOLANA_WS_ENABLED,
  SOLANA_WS_ENDPOINT,
} from "@/lib/solanaRpc";

export default function InfrastructurePage() {
  return (
    <div className="infra-page">
      <section className="infra-hero">
        <span className="hero-eyebrow">Infrastructure</span>
        <h1 className="hero-title">
          Real-time markets need<br />
          <span className="hero-accent">real-time Solana data.</span>
        </h1>
        <p className="hero-sub">
          Tei is being prepared for the Eitherway Quicknode track. Quicknode is
          the production RPC and WebSocket layer for low-latency odds, portfolio
          reads, and transaction confirmation.
        </p>
      </section>

      <section className="infra-grid">
        <div className="infra-card">
          <span className="match-stat-label">Primary Provider</span>
          <strong>{SOLANA_RPC_PROVIDER}</strong>
          <p>
            {IS_QUICKNODE_RPC
              ? "Quicknode is configured as the active Solana endpoint."
              : "Set NEXT_PUBLIC_SOLANA_RPC_PROVIDER=Quicknode and provide Quicknode endpoints for production demos."}
          </p>
        </div>

        <div className="infra-card">
          <span className="match-stat-label">Cluster</span>
          <strong>{SOLANA_NETWORK}</strong>
          <p>Devnet during beta development, mainnet-beta for final submission.</p>
        </div>

        <div className="infra-card">
          <span className="match-stat-label">Live Updates</span>
          <strong>{SOLANA_WS_ENABLED ? "WebSocket enabled" : "Polling fallback"}</strong>
          <p>
            Market accounts subscribe over WebSockets when configured, with
            polling retained as a resilient fallback.
          </p>
        </div>

        <div className="infra-card">
          <span className="match-stat-label">Transaction Landing</span>
          <strong>Priority fee aware</strong>
          <p>
            Trading transactions estimate compute-unit pricing through
            Quicknode&apos;s Priority Fee API when the add-on is available.
          </p>
        </div>
      </section>

      <section className="infra-panel">
        <h2>How Quicknode strengthens Tei</h2>
        <div className="infra-list">
          <div>
            <strong>Odds updates</strong>
            <span>Market account subscriptions update prices as AMM liquidity changes.</span>
          </div>
          <div>
            <strong>Portfolio reads</strong>
            <span>Position and market accounts load through a dedicated RPC endpoint.</span>
          </div>
          <div>
            <strong>Trading UX</strong>
            <span>Simulation, send, and confirmation flows avoid overloaded public RPC.</span>
          </div>
          <div>
            <strong>Priority fees</strong>
            <span>Buy, sell, claim, and resolve flows can add Quicknode-recommended compute-unit pricing.</span>
          </div>
          <div>
            <strong>Beta analytics</strong>
            <span>Stable infrastructure gives testers a product-grade first trading session.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
