use anchor_lang::prelude::*;

declare_id!("GFzfEUfDjfC1jBg2ayrMryJFnxkb41FCabrWQimpPotV");

#[program]
pub mod tei1 {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
