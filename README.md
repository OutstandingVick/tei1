# Tei

Live football prediction markets on Solana.

Tei lets users trade football match outcomes in real time. Instead of a sportsbook taking the other side of every bet, Tei uses peer-to-peer outcome shares priced by an on-chain AMM. Users buy, sell, and claim directly through Solana transactions while match odds update from on-chain market state.

Built for the Solana Colosseum Frontier Hackathon 2026 and designed for the Eitherway sidetrack.

## Why Tei Exists

Traditional live sports markets are intentionally fragile for users:

- markets are suspended when odds move quickly
- profitable bettors get limited or banned
- price updates are controlled by the house
- settlement can be slow and opaque

Tei replaces that model with transparent Solana markets:

- every market has an on-chain vault
- prices move according to AMM liquidity, not bookmaker discretion
- users hold outcome shares in their own wallet
- winners claim from escrow after resolution
- the protocol earns a fee on winnings instead of profiting from user losses

## Current Product Status

Working today:

- Anchor program deployed on Solana devnet
- Next.js trading interface
- Phantom wallet connection
- mock USDC mint for beta trading
- buy shares
- sell shares / exit position before resolution
- portfolio page
- live odds chart with 10m, 20m, and 30m views
- admin resolve panel for MVP settlement
- claim winnings flow
- API-Football integration path for real fixtures
- fixture sync script for creating real match markets on-chain

In progress before final submission:

- Quicknode RPC/WebSocket integration for real-time market data
- mainnet-beta deployment plan
- Eitherway-hosted public deployment
- capped beta with real football fixtures

## Hackathon Track Strategy

Primary target: **Eitherway Track - Quicknode integration**.

Tei's core product depends on fast Solana reads and live account updates. Quicknode is planned as the production data layer for:

- low-latency RPC reads for market accounts
- WebSocket subscriptions for odds and volume updates
- reliable transaction confirmation UX
- scalable data access during beta testing
- live chart and portfolio refreshes without slow public RPC polling

## How It Works

1. A football fixture is pulled from API-Football.
2. An admin sync script creates a matching Solana market.
3. Initial liquidity is seeded into YES and NO pools.
4. Users buy YES or NO outcome shares.
5. AMM liquidity changes update implied odds.
6. Users can sell shares back into the AMM while the market is open.
7. After full time, the market is resolved manually in the MVP.
8. Winning users claim their pro-rata payout from the market vault.

For `MatchWinner` markets:

- YES = home team wins
- NO = away team wins
- Draw = special settlement path

## Program Instructions

| Instruction | Caller | Purpose |
|---|---|---|
| `initialize_platform` | Admin | Creates global platform state |
| `create_market` | Admin | Opens a new match market |
| `seed_liquidity` | Admin / LP | Seeds AMM liquidity |
| `buy_shares` | User | Buys YES or NO outcome shares |
| `sell_shares` | User | Sells open shares back into the AMM |
| `resolve_market` | Admin | Sets final outcome in the MVP |
| `claim_winnings` | User | Claims payout after resolution |

## AMM Pricing

Tei uses a simplified constant-product style curve:

```text
shares_out = (liquidity_side * usdc_in) / (other_liquidity + usdc_in)
```

Implied probability is derived from liquidity balance:

```text
yes_price = no_liquidity / (yes_liquidity + no_liquidity)
no_price  = yes_liquidity / (yes_liquidity + no_liquidity)
```

At equal seed liquidity, both outcomes start near 50%. As users buy one side, that side becomes more expensive and the opposite side becomes cheaper.

## Architecture

```text
tei1/
├── programs/tei1/src/lib.rs          # Anchor program
├── tests/tei1.ts                     # Anchor integration tests
├── scripts/
│   ├── seed-devnet.ts                # Create mock USDC + demo markets
│   ├── sync-api-football-markets.ts  # Create real fixture markets
│   ├── mint-usdc.ts                  # Mint test USDC to beta wallets
│   └── inspect-market.ts             # Debug market state
├── app/
│   ├── app/                          # Next.js App Router pages
│   ├── components/                   # Wallet, cards, charts, trading UI
│   └── lib/                          # IDL, PDAs, market data helpers
├── Anchor.toml
├── Cargo.toml
└── package.json
```

## On-Chain Accounts

### Platform

PDA: `['platform']`

Stores platform authority, treasury, total markets, and total volume.

### Market

PDA: `['market', match_id]`

Stores teams, kickoff/close time, market status, outcome, vault address, liquidity, issued shares, and volume.

### Position

PDA: `['position', market_pubkey, user_pubkey]`

Stores a user's YES shares, NO shares, total spent, and claim status for a market.

### Vault

Associated token account owned by the market PDA.

Holds USDC escrow for liquidity, trades, and winner payouts.

## Tech Stack

- Solana + Anchor 0.32.1
- Rust smart contract
- Next.js 16 App Router
- TypeScript
- Solana Wallet Adapter
- Phantom wallet support
- SPL Token mock USDC for devnet beta
- API-Football for real fixture data
- Quicknode planned for production RPC/WebSocket infrastructure

## Setup

### Prerequisites

- Rust + Cargo
- Solana CLI
- Anchor CLI 0.32.1
- Node.js 18+
- npm or yarn
- Phantom wallet

### Install

```bash
git clone <repo-url>
cd tei1
npm install
cd app
npm install
cd ..
```

### Configure Devnet

```bash
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/id.json
solana airdrop 2
```

If the public faucet is rate-limited, use a Solana devnet faucet and send SOL to your CLI wallet address.

### Environment Variables

Root `.env.local`:

```bash
API_FOOTBALL_KEY=
API_FOOTBALL_LEAGUES=39,140,135,2
API_FOOTBALL_SEASON=2025
API_FOOTBALL_DAYS_AHEAD=7
MARKET_SEED_USDC=100
```

Frontend `app/.env.local`:

```bash
API_FOOTBALL_KEY=
API_FOOTBALL_LEAGUES=39,140,135,2
API_FOOTBALL_SEASON=2025
API_FOOTBALL_DAYS_AHEAD=7
```

Do not commit real API keys. `.env.local` is ignored.

## Build And Test

```bash
anchor build
anchor test
```

Run frontend type-check:

```bash
cd app
npx tsc --noEmit --incremental false
```

## Devnet Workflow

Seed demo markets and mock USDC:

```bash
npx ts-node scripts/seed-devnet.ts
```

Mint test USDC to a wallet:

```bash
npx ts-node scripts/mint-usdc.ts
```

Preview real football fixture sync:

```bash
npm run sync:fixtures:dry
```

Create missing real fixture markets on devnet:

```bash
npm run sync:fixtures
```

Run the app:

```bash
cd app
npm run dev
```

Open `http://localhost:3000`.

## Deployment Notes

Current devnet program ID:

```text
GFzfEUfDjfC1jBg2ayrMryJFnxkb41FCabrWQimpPotV
```

Current devnet mock USDC mint:

```text
9UCkswA3eMayys4Uk1a7KSFEYWZVG2UnMcANQwLVR7ZN
```

After deploying a new program, update:

- `programs/tei1/src/lib.rs`
- `Anchor.toml`
- `app/lib/program.ts`
- `app/lib/idl.json`

## Mainnet Readiness Checklist

Before public mainnet-beta launch:

- deploy program to mainnet-beta
- configure Quicknode mainnet RPC and WebSocket endpoints
- use a production-safe token strategy
- cap beta markets and liquidity
- restrict admin actions to the authority wallet
- document market risks clearly in the UI
- replace manual resolution with an oracle or audited operational process
- run a security review on settlement, vault, and sell-share paths

## Roadmap

Near term:

- Quicknode-powered live subscriptions
- real fixture market sync for beta testers
- Eitherway public deployment
- integration documentation and demo video
- mainnet-beta pilot markets

Post-hackathon:

- oracle-based match resolution
- LP program for third-party liquidity
- portfolio analytics and PnL
- additional markets such as over/under and both-teams-score
- mobile-first wallet onboarding

## Why Solana

- sub-second confirmations for live markets
- low fees for small trade sizes
- PDA-owned vaults for transparent escrow
- composability with Solana wallets, tokens, and DeFi
- real-time account subscriptions for odds and position updates

## Disclaimer

Tei is experimental hackathon software. It is not financial advice. Prediction markets and sports-related products may be regulated depending on jurisdiction. The current beta should be treated as a capped technical pilot, not an unrestricted public wagering product.

## Author

Built by Outstandingvick for Solana Colosseum Frontier Hackathon 2026.
