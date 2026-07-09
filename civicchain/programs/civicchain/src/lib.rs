use anchor_lang::prelude::*;

declare_id!("12D76ecL7prNejn2PgyAebvrF5FrKpnY7ABNW5Zm2Qrm");

const MAX_TITLE_LEN: usize = 100;
const MAX_DESCRIPTION_LEN: usize = 300;
const MAX_LOCATION_LEN: usize = 100;
const MAX_PROOF_HASH_LEN: usize = 128;
const AI_CONFIDENCE_THRESHOLD: u8 = 85;

#[program]
pub mod civicchain {
    use super::*;

    pub fn submit_complaint(
        ctx: Context<SubmitComplaint>,
        title: String,
        description: String,
        location: String,
    ) -> Result<()> {
        require!(title.as_bytes().len() <= MAX_TITLE_LEN, CivicError::TitleTooLong);
        require!(
            description.as_bytes().len() <= MAX_DESCRIPTION_LEN,
            CivicError::DescriptionTooLong
        );
        require!(
            location.as_bytes().len() <= MAX_LOCATION_LEN,
            CivicError::LocationTooLong
        );

        let complaint = &mut ctx.accounts.complaint;
        complaint.owner = ctx.accounts.citizen.key();
        complaint.title = title;
        complaint.description = description;
        complaint.location = location;
        complaint.status = ComplaintStatus::Open;
        complaint.ai_confidence = 0;
        complaint.verification_proof_hash = String::new();
        complaint.verified_at = 0;
        complaint.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn place_bid(
        ctx: Context<PlaceBid>,
        amount: u64,
    ) -> Result<()> {
        require!(
            ctx.accounts.complaint.status == ComplaintStatus::Open,
            CivicError::ComplaintNotOpen
        );
        require!(amount > 0, CivicError::InvalidBidAmount);

        let bid = &mut ctx.accounts.bid;
        bid.contractor = ctx.accounts.contractor.key();
        bid.complaint = ctx.accounts.complaint.key();
        bid.amount = amount;
        bid.status = BidStatus::Pending;

        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.contractor.key(),
            &ctx.accounts.escrow.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.contractor.to_account_info(),
                ctx.accounts.escrow.to_account_info(),
            ],
        )?;

        Ok(())
    }

    pub fn accept_bid(ctx: Context<AcceptBid>) -> Result<()> {
        let complaint = &mut ctx.accounts.complaint;
        let bid = &mut ctx.accounts.bid;

        require!(
            complaint.owner == ctx.accounts.citizen.key(),
            CivicError::Unauthorized
        );
        require!(
            bid.status == BidStatus::Pending,
            CivicError::BidNotPending
        );
        require!(
            bid.complaint == complaint.key(),
            CivicError::ComplaintMismatch
        );

        bid.status = BidStatus::Accepted;
        complaint.status = ComplaintStatus::Assigned;

        Ok(())
    }

    pub fn verify_work(
        ctx: Context<VerifyWork>,
        ai_confidence: u8,
        proof_hash: String,
    ) -> Result<()> {
        let complaint = &mut ctx.accounts.complaint;

        require!(
            complaint.owner == ctx.accounts.citizen.key(),
            CivicError::Unauthorized
        );
        require!(
            complaint.status == ComplaintStatus::Assigned
                || complaint.status == ComplaintStatus::Verified,
            CivicError::WorkNotSubmitted
        );
        require!(
            ai_confidence >= AI_CONFIDENCE_THRESHOLD,
            CivicError::ConfidenceTooLow
        );
        require!(
            proof_hash.as_bytes().len() <= MAX_PROOF_HASH_LEN,
            CivicError::ProofHashTooLong
        );

        complaint.status = ComplaintStatus::Verified;
        complaint.ai_confidence = ai_confidence;
        complaint.verification_proof_hash = proof_hash;
        complaint.verified_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn release_payment(ctx: Context<ReleasePayment>) -> Result<()> {
        let bid = &mut ctx.accounts.bid;
        let complaint = &mut ctx.accounts.complaint;

        require!(
            complaint.owner == ctx.accounts.citizen.key(),
            CivicError::Unauthorized
        );
        require!(
            complaint.status == ComplaintStatus::Verified,
            CivicError::NotVerified
        );
        require!(
            bid.status == BidStatus::Accepted,
            CivicError::BidNotAccepted
        );
        require!(
            bid.complaint == complaint.key(),
            CivicError::ComplaintMismatch
        );
        require!(
            bid.contractor == ctx.accounts.contractor.key(),
            CivicError::ContractorMismatch
        );

        bid.status = BidStatus::Released;
        complaint.status = ComplaintStatus::Completed;

        **ctx.accounts.escrow.try_borrow_mut_lamports()? -= bid.amount;
        **ctx.accounts.contractor.try_borrow_mut_lamports()? += bid.amount;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct SubmitComplaint<'info> {
    #[account(init, payer = citizen, space = 8 + Complaint::LEN)]
    pub complaint: Account<'info, Complaint>,
    #[account(mut)]
    pub citizen: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(init, payer = contractor, space = 8 + Bid::LEN)]
    pub bid: Account<'info, Bid>,
    #[account(mut)]
    pub complaint: Account<'info, Complaint>,
    #[account(mut)]
    pub contractor: Signer<'info>,
    /// CHECK: escrow account to hold funds
    #[account(mut)]
    pub escrow: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptBid<'info> {
    #[account(mut)]
    pub complaint: Account<'info, Complaint>,
    #[account(mut)]
    pub bid: Account<'info, Bid>,
    pub citizen: Signer<'info>,
}

#[derive(Accounts)]
pub struct VerifyWork<'info> {
    #[account(mut)]
    pub complaint: Account<'info, Complaint>,
    pub citizen: Signer<'info>,
}

#[derive(Accounts)]
pub struct ReleasePayment<'info> {
    #[account(mut)]
    pub complaint: Account<'info, Complaint>,
    #[account(mut)]
    pub bid: Account<'info, Bid>,
    /// CHECK: escrow account
    #[account(mut)]
    pub escrow: UncheckedAccount<'info>,
    /// CHECK: contractor receiving payment
    #[account(mut)]
    pub contractor: UncheckedAccount<'info>,
    pub citizen: Signer<'info>,
}

#[account]
pub struct Complaint {
    pub owner: Pubkey,
    pub title: String,
    pub description: String,
    pub location: String,
    pub status: ComplaintStatus,
    pub ai_confidence: u8,
    pub verification_proof_hash: String,
    pub verified_at: i64,
    pub created_at: i64,
}

impl Complaint {
    const LEN: usize = 32
        + 4 + MAX_TITLE_LEN
        + 4 + MAX_DESCRIPTION_LEN
        + 4 + MAX_LOCATION_LEN
        + 1
        + 1
        + 4 + MAX_PROOF_HASH_LEN
        + 8
        + 8;
}

#[account]
pub struct Bid {
    pub contractor: Pubkey,
    pub complaint: Pubkey,
    pub amount: u64,
    pub status: BidStatus,
}

impl Bid {
    const LEN: usize = 32 + 32 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum ComplaintStatus {
    Open,
    Assigned,
    Completed,
    Verified,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum BidStatus {
    Pending,
    Accepted,
    Rejected,
    Released,
}

#[error_code]
pub enum CivicError {
    #[msg("You are not authorized to perform this action")]
    Unauthorized,
    #[msg("Bid is not in pending state")]
    BidNotPending,
    #[msg("Work not verified yet")]
    NotVerified,
    #[msg("Complaint is not open for bidding")]
    ComplaintNotOpen,
    #[msg("Bid amount must be greater than zero")]
    InvalidBidAmount,
    #[msg("Accepted bid does not belong to this complaint")]
    ComplaintMismatch,
    #[msg("Bid is not accepted")]
    BidNotAccepted,
    #[msg("Contractor does not match the accepted bid")]
    ContractorMismatch,
    #[msg("Work has not been submitted for verification")]
    WorkNotSubmitted,
    #[msg("AI confidence is below the verification threshold")]
    ConfidenceTooLow,
    #[msg("Verification proof hash is too long")]
    ProofHashTooLong,
    #[msg("Complaint title is too long")]
    TitleTooLong,
    #[msg("Complaint description is too long")]
    DescriptionTooLong,
    #[msg("Complaint location is too long")]
    LocationTooLong,
}
