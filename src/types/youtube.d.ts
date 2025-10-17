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

// Google API Type Declarations
declare namespace gapi {
  namespace client {
    function init(config: {
      clientId: string;
      scope: string;
      discoveryDocs?: string[];
    }): Promise<void>;
  }

  namespace auth2 {
    interface GoogleAuth {
      isSignedIn: {
        get(): boolean;
        listen(callback: (isSignedIn: boolean) => void): void;
      };
      currentUser: {
        get(): GoogleUser;
        listen(callback: (user: GoogleUser) => void): void;
      };
      signIn(options?: SignInOptions): Promise<GoogleUser>;
      signOut(): Promise<void>;
      disconnect(): void;
    }

    interface GoogleUser {
      getId(): string;
      isSignedIn(): boolean;
      getHostedDomain(): string;
      getGrantedScopes(): string;
      getBasicProfile(): BasicProfile;
      getAuthResponse(includeAuthorizationData?: boolean): AuthResponse;
      reloadAuthResponse(): Promise<AuthResponse>;
      hasGrantedScopes(scopes: string): boolean;
      grant(options: { scope: string }): Promise<GoogleUser>;
      grantOfflineAccess(options: { scope: string }): Promise<{ code: string }>;
    }

    interface BasicProfile {
      getId(): string;
      getName(): string;
      getGivenName(): string;
      getFamilyName(): string;
      getImageUrl(): string;
      getEmail(): string;
    }

    interface AuthResponse {
      access_token: string;
      id_token: string;
      scope: string;
      expires_in: number;
      first_issued_at: number;
      expires_at: number;
    }

    interface SignInOptions {
      scope?: string;
      prompt?: 'consent' | 'select_account';
      ux_mode?: 'popup' | 'redirect';
      redirect_uri?: string;
    }

    function getAuthInstance(): GoogleAuth;
    function init(config: {
      client_id: string;
      cookiepolicy?: string;
      scope?: string;
      hosted_domain?: string;
      ux_mode?: 'popup' | 'redirect';
      redirect_uri?: string;
    }): void;
  }

  function load(apiName: string, callback: () => void): void;
}

interface Window {
  gapi: typeof gapi;
  onYouTubeIframeAPIReady: (() => void) | undefined;
}
