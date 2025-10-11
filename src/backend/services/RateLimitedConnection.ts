import { Connection, ConnectionConfig, PublicKey, TransactionSignature, TransactionConfirmationStrategy, ParsedTransactionWithMeta, GetVersionedTransactionConfig } from '@solana/web3.js';
import { globalRateLimiter } from './RateLimiter.js';

/**
 * Rate-Limited Solana Connection Wrapper
 * Wraps all RPC method calls with rate limiting
 */
export class RateLimitedConnection extends Connection {
  private _rateLimitEnabled: boolean = false;

  constructor(endpoint: string, config?: ConnectionConfig) {
    super(endpoint, config);
  }

  /**
   * Enable rate limiting for this connection
   */
  enableRateLimiting(): void {
    this._rateLimitEnabled = true;
  }

  /**
   * Disable rate limiting for this connection
   */
  disableRateLimiting(): void {
    this._rateLimitEnabled = false;
  }

  /**
   * Override getSignaturesForAddress with rate limiting
   */
  override async getSignaturesForAddress(
    address: PublicKey,
    options?: any,
    commitment?: any
  ): Promise<Array<any>> {
    if (this._rateLimitEnabled) {
      return await globalRateLimiter.execute(
        () => super.getSignaturesForAddress(address, options, commitment),
        'getSignaturesForAddress'
      );
    }
    return await super.getSignaturesForAddress(address, options, commitment);
  }

  /**
   * Override getTransaction with rate limiting
   */
  override async getTransaction(
    signature: string,
    options?: GetVersionedTransactionConfig
  ) {
    if (this._rateLimitEnabled) {
      return await globalRateLimiter.execute(
        () => super.getTransaction(signature, options),
        'getTransaction'
      );
    }
    return await super.getTransaction(signature, options);
  }

  /**
   * Override getParsedTransaction with rate limiting
   */
  override async getParsedTransaction(
    signature: TransactionSignature,
    commitmentOrConfig?: any
  ): Promise<ParsedTransactionWithMeta | null> {
    if (this._rateLimitEnabled) {
      return await globalRateLimiter.execute(
        () => super.getParsedTransaction(signature, commitmentOrConfig),
        'getParsedTransaction'
      );
    }
    return await super.getParsedTransaction(signature, commitmentOrConfig);
  }

  /**
   * Override getBalance with rate limiting
   */
  override async getBalance(
    publicKey: PublicKey,
    commitmentOrConfig?: any
  ): Promise<number> {
    if (this._rateLimitEnabled) {
      return await globalRateLimiter.execute(
        () => super.getBalance(publicKey, commitmentOrConfig),
        'getBalance'
      );
    }
    return await super.getBalance(publicKey, commitmentOrConfig);
  }

  /**
   * Override getAccountInfo with rate limiting
   */
  override async getAccountInfo(
    publicKey: PublicKey,
    commitmentOrConfig?: any
  ): Promise<any> {
    if (this._rateLimitEnabled) {
      return await globalRateLimiter.execute(
        () => super.getAccountInfo(publicKey, commitmentOrConfig),
        'getAccountInfo'
      );
    }
    return await super.getAccountInfo(publicKey, commitmentOrConfig);
  }

  /**
   * Override getParsedAccountInfo with rate limiting
   */
  override async getParsedAccountInfo(
    publicKey: PublicKey,
    commitmentOrConfig?: any
  ): Promise<any> {
    if (this._rateLimitEnabled) {
      return await globalRateLimiter.execute(
        () => super.getParsedAccountInfo(publicKey, commitmentOrConfig),
        'getParsedAccountInfo'
      );
    }
    return await super.getParsedAccountInfo(publicKey, commitmentOrConfig);
  }

  /**
   * Override getMultipleAccountsInfo with rate limiting
   */
  override async getMultipleAccountsInfo(
    publicKeys: PublicKey[],
    commitmentOrConfig?: any
  ): Promise<any> {
    if (this._rateLimitEnabled) {
      return await globalRateLimiter.execute(
        () => super.getMultipleAccountsInfo(publicKeys, commitmentOrConfig),
        'getMultipleAccountsInfo'
      );
    }
    return await super.getMultipleAccountsInfo(publicKeys, commitmentOrConfig);
  }

  /**
   * Override getTokenAccountBalance with rate limiting
   */
  override async getTokenAccountBalance(
    tokenAddress: PublicKey,
    commitment?: any
  ): Promise<any> {
    if (this._rateLimitEnabled) {
      return await globalRateLimiter.execute(
        () => super.getTokenAccountBalance(tokenAddress, commitment),
        'getTokenAccountBalance'
      );
    }
    return await super.getTokenAccountBalance(tokenAddress, commitment);
  }

  /**
   * Override confirmTransaction with rate limiting
   */
  override async confirmTransaction(
    strategy: TransactionConfirmationStrategy | TransactionSignature,
    commitment?: any
  ) {
    if (this._rateLimitEnabled) {
      return await globalRateLimiter.execute(
        () => super.confirmTransaction(strategy as any, commitment),
        'confirmTransaction'
      );
    }
    return await super.confirmTransaction(strategy as any, commitment);
  }

  /**
   * Override getLatestBlockhash with rate limiting
   */
  override async getLatestBlockhash(commitment?: any): Promise<any> {
    if (this._rateLimitEnabled) {
      return await globalRateLimiter.execute(
        () => super.getLatestBlockhash(commitment),
        'getLatestBlockhash'
      );
    }
    return await super.getLatestBlockhash(commitment);
  }

  /**
   * Override getSlot with rate limiting
   */
  override async getSlot(commitment?: any): Promise<number> {
    if (this._rateLimitEnabled) {
      return await globalRateLimiter.execute(
        () => super.getSlot(commitment),
        'getSlot'
      );
    }
    return await super.getSlot(commitment);
  }

  /**
   * Override getBlock with rate limiting
   */
  override async getBlock(slot: number, opts?: any): Promise<any> {
    if (this._rateLimitEnabled) {
      return await globalRateLimiter.execute(
        () => super.getBlock(slot, opts),
        'getBlock'
      );
    }
    return await super.getBlock(slot, opts);
  }
}
