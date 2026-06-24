#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    Admin,
    /// Exchange rate in basis points (10000 = 1:1) for a token pair.
    Rate(Address, Address),
}

#[contract]
pub struct SwapRouter;

#[contractimpl]
impl SwapRouter {
    /// Initialize the swap router with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Set the exchange rate for a token pair.
    /// `rate_bps` is in basis points: 10000 = 1:1, 1200 = 0.12:1.
    pub fn set_rate(env: Env, token_in: Address, token_out: Address, rate_bps: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        assert!(rate_bps > 0, "rate must be positive");
        env.storage()
            .persistent()
            .set(&DataKey::Rate(token_in, token_out), &rate_bps);
    }

    /// Calculate the output amount for a given input.
    pub fn get_amount_out(env: Env, token_in: Address, token_out: Address, amount_in: i128) -> i128 {
        let rate_bps: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Rate(token_in, token_out))
            .expect("no rate set for this pair");
        amount_in * rate_bps / 10000
    }

    /// Execute a swap: transfer `token_out` from router reserves to `recipient`.
    ///
    /// The caller must have already transferred `amount_in` of `token_in` to
    /// this contract before calling swap (the pool contract does this).
    pub fn swap(
        env: Env,
        token_in: Address,
        token_out: Address,
        amount_in: i128,
        min_amount_out: i128,
        recipient: Address,
    ) -> i128 {
        let rate_bps: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Rate(token_in, token_out.clone()))
            .expect("no rate set for this pair");

        let amount_out = amount_in * rate_bps / 10000;
        assert!(
            amount_out >= min_amount_out,
            "slippage: output below minimum"
        );

        // Transfer output token from router reserves to recipient
        let router_address = env.current_contract_address();
        token::Client::new(&env, &token_out).transfer(&router_address, &recipient, &amount_out);

        amount_out
    }
}
