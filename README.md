# Tei ⚽

> Live football prediction markets on Solana. Trade match outcomes in real-time with AMM-powered pricing and instant settlement.

## How It Works

Traditional sportsbooks are principal-agent — the house takes the other side of every bet. Tei is peer-to-peer: users trade outcome shares with each other, priced continuously by a constant-product AMM. The platform just earns a 2% fee on winnings.

**Core loop:**
1. Match goes live → market opens automatically
2. User buys YES/NO shares at AMM price
3. More demand for YES → price rises, NO falls
4. Match ends → admin (MVP) or oracle (v2) resolves outcome
5. Winners claim pro-rata payout from vault

## Program Instructions

| Instruction | Who Calls It | Purpose |
|---|---|---|
| `initialize_platform` | Admin (once) | Deploy platform state |
| `create_market` | Admin | Open a new match market |
| `seed_liquidity` | Admin/LP | Solve cold-start, seed AMM |
| `buy_shares` | User | Trade an outcome |
| `resolve_market` | Admin | Set result (manual in MUP) |
| `claim_winnings` | User | Withdraw payout after resolve |

## AMM Pricing

Uses a simplified constant-product curve:

```
shares_out = (liquidity_side × usdc_in) / (other_liquidity + usdc_in)
```

At 50/50 seed liquidity, both sides start at 0.50 (50% implied probability). As users trade, prices shift to reflect crowd consensus.

**Example:**
- Seed: 1000 USDC YES, 1000 USDC NO
- User buys YES with 100 USDC
- Shares out: (1000 × 100) / (1000 + 100) = **90.9 shares**
- New YES price: ~0.52 (market slightly favors home win)

## Setup

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.29.0
avm use 0.29.0

# Install Node deps
yarn install
```

### Configure Devnet Wallet

```bash
solana-keygen new --outfile ~/.config/solana/id.json
solana config set --url devnet
solana airdrop 2
```

### Build & Test

```bash
# Build the program
anchor build

# Run tests (local validator)
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

### After Deploy

Update `declare_id!` in `programs/foretrade/src/lib.rs` and `[programs.devnet]` in `Anchor.toml` with your deployed program ID.

## Project Structure

```
foretrade/
├── programs/foretrade/src/
│   └── lib.rs              ← All program logic
├── tests/
│   └── foretrade.ts        ← Integration tests
├── app/                    ← Frontend (Next.js — coming Week 2)
├── Anchor.toml
├── Cargo.toml
└── package.json
```

## Accounts

### Platform (PDA: ["platform"])
Global state. Tracks total markets, volume, fee treasury.

### Market (PDA: ["market", match_id])
One per football match. Stores AMM state, liquidity pools, outcome.

### Position (PDA: ["position", market_pubkey, user_pubkey])
Per-user per-market. Tracks YES/NO shares and claim status.

### Vault (PDA: ["vault", market_pubkey])
USDC escrow for each market. Held by market PDA, released on claim.

## Market Types (v1)

- `MatchWinner` — Home win (YES) / Away win (NO) / Draw (special case)
- `OverUnder` — Over 2.5 goals (YES) / Under (NO)
- `BothTeamsScore` — Yes / No

## Roadmap

**Week 1 (now)** — Smart contract ✅
**Week 2** — Next.js frontend + wallet connect
**Week 3** — API-Football integration + admin resolve UI
**Post-hackathon** — Switchboard oracle, order book migration, mobile

## Why Solana

- **400ms finality** — markets settle within a match, not hours later
- **Sub-cent fees** — $1 trades are economically viable
- **Composability** — idle vault USDC can earn yield in Solana DeFi
- **SPL tokens** — native USDC support, no bridges needed

---

Built for Solana Colosseum Frontier Hackathon 2026
by @outstandingvick