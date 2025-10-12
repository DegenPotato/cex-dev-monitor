import { Connection, PublicKey } from '@solana/web3.js';

/**
 * Token Metadata Fetcher
 * Fetches token metadata directly from Solana blockchain using Metaplex Token Metadata Program
 */
export class TokenMetadataFetcher {
  private connection: Connection;
  private readonly METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Get Metadata PDA (Program Derived Address) for a token mint
   */
  private async getMetadataPDA(mintAddress: string): Promise<PublicKey> {
    const mint = new PublicKey(mintAddress);
    const metadataProgramId = new PublicKey(this.METADATA_PROGRAM_ID);
    
    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        metadataProgramId.toBuffer(),
        mint.toBuffer(),
      ],
      metadataProgramId
    );

    return metadataPDA;
  }

  /**
   * Fetch token metadata from blockchain
   */
  async fetchMetadata(mintAddress: string): Promise<{
    name?: string;
    symbol?: string;
    uri?: string;
    image?: string;
    description?: string;
    twitter?: string;
    telegram?: string;
    website?: string;
  } | null> {
    try {
      const metadataPDA = await this.getMetadataPDA(mintAddress);
      
      // Fetch account data
      const accountInfo = await this.connection.getAccountInfo(metadataPDA);
      
      if (!accountInfo) {
        console.log(`🔍 [Metadata] No metadata account found for ${mintAddress.slice(0, 8)}...`);
        return null;
      }

      // Parse metadata from account data
      const metadata = this.parseMetadata(accountInfo.data);
      
      // If there's a URI, fetch off-chain metadata
      if (metadata.uri) {
        try {
          const offChainData = await this.fetchOffChainMetadata(metadata.uri);
          return {
            ...metadata,
            ...offChainData
          };
        } catch (error) {
          console.warn(`⚠️ [Metadata] Failed to fetch off-chain metadata from ${metadata.uri}`);
          return metadata;
        }
      }

      return metadata;
    } catch (error: any) {
      console.error(`❌ [Metadata] Error fetching metadata for ${mintAddress.slice(0, 8)}...:`, error.message);
      return null;
    }
  }

  /**
   * Parse on-chain metadata from account data
   */
  private parseMetadata(data: Buffer): {
    name?: string;
    symbol?: string;
    uri?: string;
  } {
    try {
      // Metadata layout (simplified):
      // 1 byte - key
      // 32 bytes - update authority
      // 32 bytes - mint
      // 4 + name length - name (string)
      // 4 + symbol length - symbol (string)  
      // 4 + uri length - uri (string)
      
      let offset = 1 + 32 + 32; // Skip key, update authority, mint
      
      // Read name
      const nameLength = data.readUInt32LE(offset);
      offset += 4;
      const name = data.slice(offset, offset + nameLength).toString('utf8').replace(/\0/g, '').trim();
      offset += nameLength;
      
      // Read symbol
      const symbolLength = data.readUInt32LE(offset);
      offset += 4;
      const symbol = data.slice(offset, offset + symbolLength).toString('utf8').replace(/\0/g, '').trim();
      offset += symbolLength;
      
      // Read URI
      const uriLength = data.readUInt32LE(offset);
      offset += 4;
      const uri = data.slice(offset, offset + uriLength).toString('utf8').replace(/\0/g, '').trim();
      
      return {
        name: name || undefined,
        symbol: symbol || undefined,
        uri: uri || undefined
      };
    } catch (error) {
      console.error('❌ [Metadata] Error parsing metadata:', error);
      return {};
    }
  }

  /**
   * Fetch off-chain metadata from URI (IPFS, Arweave, HTTP)
   */
  private async fetchOffChainMetadata(uri: string): Promise<{
    image?: string;
    description?: string;
    twitter?: string;
    telegram?: string;
    website?: string;
  }> {
    try {
      // Handle IPFS URIs
      let fetchUrl = uri;
      if (uri.startsWith('ipfs://')) {
        fetchUrl = uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
      }
      
      const response = await fetch(fetchUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (!response.ok) {
        return {};
      }

      const json = await response.json();
      
      return {
        image: json.image || json.icon || undefined,
        description: json.description || undefined,
        twitter: json.twitter || json.external_url?.includes('twitter') ? json.external_url : undefined,
        telegram: json.telegram || undefined,
        website: json.website || json.external_url || undefined
      };
    } catch (error) {
      // Silently fail for off-chain metadata
      return {};
    }
  }

  /**
   * Batch fetch metadata for multiple tokens
   */
  async fetchMetadataBatch(mintAddresses: string[]): Promise<Map<string, any>> {
    const results = new Map();
    
    // Fetch in parallel with a small delay to avoid rate limits
    const promises = mintAddresses.map(async (address, index) => {
      // Stagger requests by 100ms each
      await new Promise(resolve => setTimeout(resolve, index * 100));
      
      const metadata = await this.fetchMetadata(address);
      if (metadata) {
        results.set(address, metadata);
      }
    });

    await Promise.all(promises);
    return results;
  }
}
