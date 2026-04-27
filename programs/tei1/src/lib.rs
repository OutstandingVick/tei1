use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("GFzfEUfDjfC1jBg2ayrMryJFnxkb41FCabrWQimpPotV");

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────
pub const PLATFORM_FEE_BPS: u64 = 200; // 2% fee on winnings
pub const BPS_DIVISOR: u64 = 10_000;
pub const MAX_TITLE_LEN: usize = 64;
pub const MAX_TEAM_LEN: usize = 32;

// ─────────────────────────────────────────────
//  Program
// ─────────────────────────────────────────────
#[program]
pub mod tei1 {
    use super::*;

    /// Initialize the global platform state (call once at deploy)
    pub fn initialize_platform(ctx: Context<InitializePlatform>) -> Result<()> {
        let platform = &mut ctx.accounts.platform;
        platform.authority = ctx.accounts.authority.key();
        platform.treasury = ctx.accounts.treasury.key();
        platform.total_markets = 0;
        platform.total_volume = 0;
        platform.bump = ctx.bumps.platform;
        msg!("FöreTrade platform initialized");
        Ok(())
    }

    /// Create a new prediction market for a football match
    pub fn create_market(
        ctx: Context<CreateMarket>,
        match_id: String,       // external ID from API-Football e.g. "1023988"
        home_team: String,      // "Arsenal"
        away_team: String,      // "Chelsea"
        title: String,          // "Arsenal vs Chelsea — Match Winner"
        market_type: MarketType,
        kickoff_time: i64,      // unix timestamp
        close_time: i64,        // when trading stops (e.g. 90 min mark)
    ) -> Result<()> {
        require!(home_team.len() <= MAX_TEAM_LEN, ForeError::StringTooLong);
        require!(away_team.len() <= MAX_TEAM_LEN, ForeError::StringTooLong);
        require!(title.len() <= MAX_TITLE_LEN, ForeError::StringTooLong);
        require!(close_time > kickoff_time, ForeError::InvalidTimes);

        let market = &mut ctx.accounts.market;
        let platform = &mut ctx.accounts.platform;

        market.match_id = match_id;
        market.home_team = home_team;
        market.away_team = away_team;
        market.title = title;
        market.market_type = market_type;
        market.kickoff_time = kickoff_time;
        market.close_time = close_time;
        market.status = MarketStatus::Open;
        market.outcome = Outcome::Undecided;
        market.authority = ctx.accounts.authority.key();
        market.usdc_mint = ctx.accounts.usdc_mint.key();
        market.vault = ctx.accounts.vault.key();

        // AMM seed liquidity pools
        // YES shares and NO shares start at equal price (50/50)
        market.yes_liquidity = 0;
        market.no_liquidity = 0;
        market.yes_shares_issued = 0;
        market.no_shares_issued = 0;
        market.total_volume = 0;
        market.bump = ctx.bumps.market;

        platform.total_markets += 1;

        emit!(MarketCreated {
            market: market.key(),
            match_id: market.match_id.clone(),
            home_team: market.home_team.clone(),
            away_team: market.away_team.clone(),
            market_type: market.market_type.clone(),
            kickoff_time,
        });

        msg!("Market created: {} vs {}", market.home_team, market.away_team);
        Ok(())
    }

    /// Seed initial liquidity into a market (admin only)
    /// This solves the cold-start problem — platform LPs seed both sides
    pub fn seed_liquidity(
        ctx: Context<SeedLiquidity>,
        yes_amount: u64,  // USDC (6 decimals)
        no_amount: u64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(market.status == MarketStatus::Open, ForeError::MarketNotOpen);
        require!(yes_amount > 0 && no_amount > 0, ForeError::InvalidAmount);

        // Transfer USDC from seeder to vault
        let total = yes_amount.checked_add(no_amount).ok_or(ForeError::MathOverflow)?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.seeder_usdc.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.seeder.to_account_info(),
                },
            ),
            total,
        )?;

        market.yes_liquidity = market.yes_liquidity.checked_add(yes_amount).ok_or(ForeError::MathOverflow)?;
        market.no_liquidity = market.no_liquidity.checked_add(no_amount).ok_or(ForeError::MathOverflow)?;

        msg!("Liquidity seeded: {} YES, {} NO", yes_amount, no_amount);
        Ok(())
    }

    /// Buy shares in a market outcome
    /// Uses constant-product AMM: x * y = k
    pub fn buy_shares(
        ctx: Context<BuyShares>,
        side: Side,          // YES or NO
        usdc_in: u64,        // amount of USDC to spend (6 decimals)
        min_shares_out: u64, // slippage protection
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let position = &mut ctx.accounts.position;

        require!(market.status == MarketStatus::Open, ForeError::MarketNotOpen);
        require!(usdc_in > 0, ForeError::InvalidAmount);

        let clock = Clock::get()?;
        require!(clock.unix_timestamp < market.close_time, ForeError::MarketClosed);

        // ── AMM pricing (constant product) ──────────────────────────
        // shares_out = (liquidity_side * usdc_in) / (other_liquidity + usdc_in)
        let (shares_out, new_yes_liq, new_no_liq) = match side {
            Side::Yes => {
                let shares = market.yes_liquidity
                    .checked_mul(usdc_in)
                    .ok_or(ForeError::MathOverflow)?
                    .checked_div(
                        market.no_liquidity.checked_add(usdc_in).ok_or(ForeError::MathOverflow)?
                    )
                    .ok_or(ForeError::MathOverflow)?;

                let new_yes = market.yes_liquidity.checked_sub(shares).ok_or(ForeError::MathOverflow)?;
                let new_no = market.no_liquidity.checked_add(usdc_in).ok_or(ForeError::MathOverflow)?;
                (shares, new_yes, new_no)
            }
            Side::No => {
                let shares = market.no_liquidity
                    .checked_mul(usdc_in)
                    .ok_or(ForeError::MathOverflow)?
                    .checked_div(
                        market.yes_liquidity.checked_add(usdc_in).ok_or(ForeError::MathOverflow)?
                    )
                    .ok_or(ForeError::MathOverflow)?;

                let new_yes = market.yes_liquidity.checked_add(usdc_in).ok_or(ForeError::MathOverflow)?;
                let new_no = market.no_liquidity.checked_sub(shares).ok_or(ForeError::MathOverflow)?;
                (shares, new_yes, new_no)
            }
        };

        require!(shares_out >= min_shares_out, ForeError::SlippageExceeded);

        // Transfer USDC from user to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            usdc_in,
        )?;

        // Update market state
        market.yes_liquidity = new_yes_liq;
        market.no_liquidity = new_no_liq;
        market.total_volume = market.total_volume.checked_add(usdc_in).ok_or(ForeError::MathOverflow)?;

        match side {
            Side::Yes => market.yes_shares_issued = market.yes_shares_issued.checked_add(shares_out).ok_or(ForeError::MathOverflow)?,
            Side::No => market.no_shares_issued = market.no_shares_issued.checked_add(shares_out).ok_or(ForeError::MathOverflow)?,
        }

        // Update or create user position
        if position.market == Pubkey::default() {
            position.user = ctx.accounts.user.key();
            position.market = market.key();
            position.yes_shares = 0;
            position.no_shares = 0;
            position.total_spent = 0;
            position.claimed = false;
            position.bump = ctx.bumps.position;
        }

        match side {
            Side::Yes => position.yes_shares = position.yes_shares.checked_add(shares_out).ok_or(ForeError::MathOverflow)?,
            Side::No => position.no_shares = position.no_shares.checked_add(shares_out).ok_or(ForeError::MathOverflow)?,
        }
        position.total_spent = position.total_spent.checked_add(usdc_in).ok_or(ForeError::MathOverflow)?;

        emit!(SharesBought {
            market: market.key(),
            user: ctx.accounts.user.key(),
            side: side.clone(),
            usdc_in,
            shares_out,
        });

        msg!("Bought {} shares on {:?} for {} USDC", shares_out, side, usdc_in);
        Ok(())
    }

    /// Sell shares back into the AMM (position exit / "cancel trade" path)
    /// Inverse of buy_shares under the same constant-product market maker.
    pub fn sell_shares(
        ctx: Context<SellShares>,
        side: Side,           // YES or NO shares to sell
        shares_in: u64,       // shares amount (6 decimals)
        min_usdc_out: u64,    // slippage protection
    ) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let market = &ctx.accounts.market;

        require!(market.status == MarketStatus::Open, ForeError::MarketNotOpen);
        require!(shares_in > 0, ForeError::InvalidAmount);

        let clock = Clock::get()?;
        require!(clock.unix_timestamp < market.close_time, ForeError::MarketClosed);
        require!(position.user == ctx.accounts.user.key(), ForeError::Unauthorized);

        // Ensure user actually owns the shares they are trying to sell.
        match side {
            Side::Yes => require!(position.yes_shares >= shares_in, ForeError::InsufficientShares),
            Side::No => require!(position.no_shares >= shares_in, ForeError::InsufficientShares),
        }

        // Inverse AMM pricing:
        // YES sell: usdc_out = (no_liquidity * yes_shares_in) / (yes_liquidity + yes_shares_in)
        // NO  sell: usdc_out = (yes_liquidity * no_shares_in) / (no_liquidity + no_shares_in)
        let (usdc_out, new_yes_liq, new_no_liq) = match side {
            Side::Yes => {
                let out = market.no_liquidity
                    .checked_mul(shares_in)
                    .ok_or(ForeError::MathOverflow)?
                    .checked_div(
                        market.yes_liquidity.checked_add(shares_in).ok_or(ForeError::MathOverflow)?
                    )
                    .ok_or(ForeError::MathOverflow)?;

                let new_yes = market.yes_liquidity.checked_add(shares_in).ok_or(ForeError::MathOverflow)?;
                let new_no = market.no_liquidity.checked_sub(out).ok_or(ForeError::InsufficientLiquidity)?;
                (out, new_yes, new_no)
            }
            Side::No => {
                let out = market.yes_liquidity
                    .checked_mul(shares_in)
                    .ok_or(ForeError::MathOverflow)?
                    .checked_div(
                        market.no_liquidity.checked_add(shares_in).ok_or(ForeError::MathOverflow)?
                    )
                    .ok_or(ForeError::MathOverflow)?;

                let new_yes = market.yes_liquidity.checked_sub(out).ok_or(ForeError::InsufficientLiquidity)?;
                let new_no = market.no_liquidity.checked_add(shares_in).ok_or(ForeError::MathOverflow)?;
                (out, new_yes, new_no)
            }
        };

        require!(usdc_out >= min_usdc_out, ForeError::SlippageExceeded);
        require!(ctx.accounts.vault.amount >= usdc_out, ForeError::InsufficientLiquidity);

        // Transfer USDC from vault to user using market PDA as vault authority.
        let market_key = market.key();
        let seeds = &[
            b"market",
            market.match_id.as_bytes(),
            &[market.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_usdc.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                signer_seeds,
            ),
            usdc_out,
        )?;

        // Update market accounting.
        let market = &mut ctx.accounts.market;
        market.yes_liquidity = new_yes_liq;
        market.no_liquidity = new_no_liq;
        market.total_volume = market.total_volume.checked_add(usdc_out).ok_or(ForeError::MathOverflow)?;

        match side {
            Side::Yes => {
                market.yes_shares_issued = market.yes_shares_issued.checked_sub(shares_in).ok_or(ForeError::MathOverflow)?;
                position.yes_shares = position.yes_shares.checked_sub(shares_in).ok_or(ForeError::MathOverflow)?;
            }
            Side::No => {
                market.no_shares_issued = market.no_shares_issued.checked_sub(shares_in).ok_or(ForeError::MathOverflow)?;
                position.no_shares = position.no_shares.checked_sub(shares_in).ok_or(ForeError::MathOverflow)?;
            }
        }

        // Keep a simple net-spent approximation for UI.
        position.total_spent = position.total_spent.saturating_sub(usdc_out);

        emit!(SharesSold {
            market: market_key,
            user: ctx.accounts.user.key(),
            side: side.clone(),
            shares_in,
            usdc_out,
        });

        msg!("Sold {} shares on {:?} for {} USDC", shares_in, side, usdc_out);
        Ok(())
    }

    /// Resolve a market — admin calls this with the real outcome
    /// In MUP: this is a manual button. Later: oracle-triggered.
    pub fn resolve_market(
        ctx: Context<ResolveMarket>,
        outcome: Outcome,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;

        require!(market.status == MarketStatus::Open, ForeError::MarketNotOpen);
        require!(
            ctx.accounts.authority.key() == market.authority,
            ForeError::Unauthorized
        );
        require!(outcome != Outcome::Undecided, ForeError::InvalidOutcome);

        market.outcome = outcome.clone();
        market.status = MarketStatus::Resolved;

        emit!(MarketResolved {
            market: market.key(),
            outcome: outcome.clone(),
        });

        msg!("Market resolved: {:?}", outcome);
        Ok(())
    }

    /// Claim winnings after market resolves
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;

        require!(market.status == MarketStatus::Resolved, ForeError::MarketNotResolved);
        require!(!position.claimed, ForeError::AlreadyClaimed);
        require!(position.user == ctx.accounts.user.key(), ForeError::Unauthorized);

        // Determine winning shares
        let winning_shares = match market.outcome {
            Outcome::HomeWin => position.yes_shares,   // YES = home win for match winner markets
            Outcome::AwayWin => position.no_shares,    // NO = away win
            Outcome::Draw => {
                // On draw: refund proportionally (both sides get half)
                let total_shares = position.yes_shares.checked_add(position.no_shares).ok_or(ForeError::MathOverflow)?;
                total_shares / 2
            }
            Outcome::Undecided => return err!(ForeError::MarketNotResolved),
        };

        if winning_shares == 0 {
            position.claimed = true;
            msg!("No winning shares — position closed with no payout");
            return Ok(());
        }

        // Total USDC in vault
        let vault_balance = ctx.accounts.vault.amount;

        // Total winning shares across all users
        let total_winning_shares = match market.outcome {
            Outcome::HomeWin => market.yes_shares_issued,
            Outcome::AwayWin => market.no_shares_issued,
            Outcome::Draw => market.yes_shares_issued
                .checked_add(market.no_shares_issued)
                .ok_or(ForeError::MathOverflow)?
                / 2,
            Outcome::Undecided => return err!(ForeError::MarketNotResolved),
        };

        // Gross payout = vault_balance * (user_winning_shares / total_winning_shares)
        let gross_payout = vault_balance
            .checked_mul(winning_shares)
            .ok_or(ForeError::MathOverflow)?
            .checked_div(total_winning_shares)
            .ok_or(ForeError::MathOverflow)?;

        // Deduct platform fee
        let fee = gross_payout
            .checked_mul(PLATFORM_FEE_BPS)
            .ok_or(ForeError::MathOverflow)?
            .checked_div(BPS_DIVISOR)
            .ok_or(ForeError::MathOverflow)?;

        let net_payout = gross_payout.checked_sub(fee).ok_or(ForeError::MathOverflow)?;

        // Transfer from vault to user (using PDA authority)
        let seeds = &[
            b"market",
            market.match_id.as_bytes(),
            &[market.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_usdc.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                signer_seeds,
            ),
            net_payout,
        )?;

        // Transfer fee to treasury
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                signer_seeds,
            ),
            fee,
        )?;

        position.claimed = true;

        emit!(WinningsClaimed {
            market: market.key(),
            user: ctx.accounts.user.key(),
            gross_payout,
            fee,
            net_payout,
        });

        msg!("Payout: {} USDC (fee: {})", net_payout, fee);
        Ok(())
    }
}

// ─────────────────────────────────────────────
//  Account Structs
// ─────────────────────────────────────────────

#[account]
pub struct Platform {
    pub authority: Pubkey,      // admin wallet
    pub treasury: Pubkey,       // fee collection wallet
    pub total_markets: u64,
    pub total_volume: u64,
    pub bump: u8,
}

#[account]
pub struct Market {
    pub match_id: String,       // API-Football match ID
    pub home_team: String,
    pub away_team: String,
    pub title: String,
    pub market_type: MarketType,
    pub kickoff_time: i64,
    pub close_time: i64,
    pub status: MarketStatus,
    pub outcome: Outcome,
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub vault: Pubkey,          // USDC escrow PDA

    // AMM state
    pub yes_liquidity: u64,
    pub no_liquidity: u64,
    pub yes_shares_issued: u64,
    pub no_shares_issued: u64,
    pub total_volume: u64,
    pub bump: u8,
}

#[account]
pub struct Position {
    pub user: Pubkey,
    pub market: Pubkey,
    pub yes_shares: u64,
    pub no_shares: u64,
    pub total_spent: u64,       // total USDC spent (for UI display)
    pub claimed: bool,
    pub bump: u8,
}

// ─────────────────────────────────────────────
//  Instruction Contexts
// ─────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 8 + 8 + 1,
        seeds = [b"platform"],
        bump
    )]
    pub platform: Account<'info, Platform>,

    /// CHECK: treasury is just a USDC token account, validated by mint
    pub treasury: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(match_id: String, home_team: String, away_team: String, title: String)]
pub struct CreateMarket<'info> {
    #[account(
        init,
        payer = authority,
        space = 8
            + 4 + 16       // match_id string
            + 4 + MAX_TEAM_LEN
            + 4 + MAX_TEAM_LEN
            + 4 + MAX_TITLE_LEN
            + 1            // market_type enum
            + 8 + 8        // kickoff/close time
            + 1 + 1        // status + outcome enums
            + 32 + 32 + 32 // authority, mint, vault
            + 8 * 5        // AMM fields
            + 1,           // bump
        seeds = [b"market", match_id.as_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"platform"],
        bump = platform.bump
    )]
    pub platform: Account<'info, Platform>,

    /// CHECK: USDC mint address
    pub usdc_mint: AccountInfo<'info>,

    /// CHECK: vault PDA — initialized separately as token account
    pub vault: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SeedLiquidity<'info> {
    #[account(mut, has_one = vault)]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub seeder_usdc: Account<'info, TokenAccount>,

    pub seeder: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BuyShares<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    #[account(mut, constraint = vault.key() == market.vault)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SellShares<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,

    #[account(mut, constraint = vault.key() == market.vault)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(has_one = vault)]
    pub market: Account<'info, Market>,

    #[account(mut, seeds = [b"position", market.key().as_ref(), user.key().as_ref()], bump = position.bump)]
    pub position: Account<'info, Position>,

    #[account(mut, constraint = vault.key() == market.vault)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,

    #[account(mut)]
    pub treasury: Account<'info, TokenAccount>,

    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ─────────────────────────────────────────────
//  Types & Enums
// ─────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum MarketType {
    MatchWinner,    // Home / Away / Draw
    OverUnder,      // Over 2.5 goals yes/no
    BothTeamsScore, // Yes / No
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum MarketStatus {
    Open,
    Closed,     // trading stopped, awaiting resolution
    Resolved,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum Outcome {
    Undecided,
    HomeWin,
    AwayWin,
    Draw,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum Side {
    Yes,
    No,
}

// ─────────────────────────────────────────────
//  Events
// ─────────────────────────────────────────────

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub match_id: String,
    pub home_team: String,
    pub away_team: String,
    pub market_type: MarketType,
    pub kickoff_time: i64,
}

#[event]
pub struct SharesBought {
    pub market: Pubkey,
    pub user: Pubkey,
    pub side: Side,
    pub usdc_in: u64,
    pub shares_out: u64,
}

#[event]
pub struct SharesSold {
    pub market: Pubkey,
    pub user: Pubkey,
    pub side: Side,
    pub shares_in: u64,
    pub usdc_out: u64,
}

#[event]
pub struct MarketResolved {
    pub market: Pubkey,
    pub outcome: Outcome,
}

#[event]
pub struct WinningsClaimed {
    pub market: Pubkey,
    pub user: Pubkey,
    pub gross_payout: u64,
    pub fee: u64,
    pub net_payout: u64,
}

// ─────────────────────────────────────────────
//  Errors
// ─────────────────────────────────────────────

#[error_code]
pub enum ForeError {
    #[msg("Market is not open for trading")]
    MarketNotOpen,
    #[msg("Market trading window has closed")]
    MarketClosed,
    #[msg("Market has not been resolved yet")]
    MarketNotResolved,
    #[msg("Invalid amount — must be greater than zero")]
    InvalidAmount,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Winnings already claimed")]
    AlreadyClaimed,
    #[msg("Invalid outcome")]
    InvalidOutcome,
    #[msg("String field too long")]
    StringTooLong,
    #[msg("Close time must be after kickoff time")]
    InvalidTimes,
    #[msg("Insufficient shares for this action")]
    InsufficientShares,
    #[msg("Insufficient market liquidity")]
    InsufficientLiquidity,
}
