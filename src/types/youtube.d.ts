// YouTube IFrame API Type Declarations

declare namespace YT {
  interface Player {
    loadVideoById(videoId: string | { videoId: string }): void;
    cueVideoById(videoId: string | { videoId: string }): void;
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
    setVolume(volume: number): void;
    getVolume(): number;
    setPlaybackRate(suggestedRate: number): void;
    getPlaybackRate(): number;
    getAvailablePlaybackRates(): number[];
    setLoop(loopPlaylists: boolean): void;
    setShuffle(shufflePlaylist: boolean): void;
    getVideoLoadedFraction(): number;
    getPlayerState(): PlayerState;
    getCurrentTime(): number;
    getDuration(): number;
    getVideoUrl(): string;
    getVideoEmbedCode(): string;
    getPlaylist(): string[];
    getPlaylistIndex(): number;
    addEventListener(event: string, listener: (event: CustomEvent) => void): void;
    removeEventListener(event: string, listener: (event: CustomEvent) => void): void;
    destroy(): void;
  }

  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }

  interface PlayerEvent {
    target: Player;
  }

  interface OnStateChangeEvent {
    target: Player;
    data: PlayerState;
  }

  interface OnErrorEvent {
    target: Player;
    data: number;
  }

  interface PlayerOptions {
    height?: string | number;
    width?: string | number;
    videoId?: string;
    playerVars?: PlayerVars;
    events?: Events;
  }

  interface PlayerVars {
    autoplay?: 0 | 1;
    cc_lang_pref?: string;
    cc_load_policy?: 1;
    color?: 'red' | 'white';
    controls?: 0 | 1 | 2;
    disablekb?: 0 | 1;
    enablejsapi?: 0 | 1;
    end?: number;
    fs?: 0 | 1;
    hl?: string;
    iv_load_policy?: 1 | 3;
    list?: string;
    listType?: 'playlist' | 'search' | 'user_uploads';
    loop?: 0 | 1;
    modestbranding?: 1;
    origin?: string;
    playlist?: string;
    playsinline?: 0 | 1;
    rel?: 0 | 1;
    showinfo?: 0 | 1;
    start?: number;
    widget_referrer?: string;
  }

  interface Events {
    onReady?: (event: PlayerEvent) => void;
    onStateChange?: (event: OnStateChangeEvent) => void;
    onPlaybackQualityChange?: (event: PlayerEvent) => void;
    onPlaybackRateChange?: (event: PlayerEvent) => void;
    onError?: (event: OnErrorEvent) => void;
    onApiChange?: (event: PlayerEvent) => void;
  }

  class Player {
    constructor(id: string | Element, options?: PlayerOptions);
  }
}

// Google Identity Services (GIS) Type Declarations
declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface TokenClient {
        requestAccessToken(overrideConfig?: OverridableTokenClientConfig): void;
      }

      interface TokenResponse {
        access_token: string;
        expires_in: number;
        scope: string;
        token_type: string;
        error?: string;
        error_description?: string;
        error_uri?: string;
      }

      interface OverridableTokenClientConfig {
        scope?: string;
        hint?: string;
        state?: string;
      }

      interface TokenClientConfig extends OverridableTokenClientConfig {
        client_id: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: any) => void;
      }

      function initTokenClient(config: TokenClientConfig): TokenClient;
      function revoke(accessToken: string, done?: () => void): void;
      function hasGrantedAllScopes(tokenResponse: TokenResponse, ...scopes: string[]): boolean;
      function hasGrantedAnyScope(tokenResponse: TokenResponse, ...scopes: string[]): boolean;
    }
  }
}

interface Window {
  google: typeof google;
  onYouTubeIframeAPIReady: (() => void) | undefined;
}
