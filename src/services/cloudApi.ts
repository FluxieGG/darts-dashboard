import { UserManager, UserManagerSettings, User } from 'oidc-client-ts';

export interface CloudAuthConfig {
  clientId?: string;
  redirectUri?: string;
  authority?: string;
  apiBaseUrl?: string;
}

export class AutodartsCloudService {
  private userManager: UserManager | null = null;
  private config: CloudAuthConfig;
  private currentUser: User | null = null;

  constructor(config: CloudAuthConfig = {}) {
    this.config = {
      authority: config.authority || 'https://api.autodarts.io',
      clientId: config.clientId || (import.meta.env.VITE_AUTODARTS_CLIENT_ID as string) || '',
      redirectUri:
        config.redirectUri ||
        (import.meta.env.VITE_AUTODARTS_REDIRECT_URI as string) ||
        `${window.location.origin}/auth/callback`,
      apiBaseUrl: config.apiBaseUrl || '/api/autodarts',
    };

    if (this.config.clientId) {
      this.initOidc();
    }
  }

  private initOidc(): void {
    if (!this.config.clientId) return;

    const settings: UserManagerSettings = {
      authority: this.config.authority!,
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri!,
      response_type: 'code',
      scope: 'openid profile email autodarts:api',
      post_logout_redirect_uri: window.location.origin,
      automaticSilentRenew: true,
      loadUserInfo: true,
    };

    this.userManager = new UserManager(settings);

    this.userManager.events.addUserLoaded((user) => {
      this.currentUser = user;
    });

    this.userManager.events.addUserUnloaded(() => {
      this.currentUser = null;
    });
  }

  public isConfigured(): boolean {
    return Boolean(this.config.clientId && this.config.clientId.trim().length > 0);
  }

  public async login(): Promise<void> {
    if (!this.userManager) {
      throw new Error('Autodarts Cloud Client ID is not configured in .env or Settings.');
    }
    await this.userManager.signinRedirect();
  }

  public async handleCallback(): Promise<User | null> {
    if (!this.userManager) return null;
    const user = await this.userManager.signinRedirectCallback();
    this.currentUser = user;
    return user;
  }

  public async logout(): Promise<void> {
    if (!this.userManager) return;
    await this.userManager.signoutRedirect();
    this.currentUser = null;
  }

  public async getUser(): Promise<User | null> {
    if (!this.userManager) return null;
    if (this.currentUser) return this.currentUser;
    this.currentUser = await this.userManager.getUser();
    return this.currentUser;
  }

  public getAccessToken(): string | null {
    return this.currentUser?.access_token || null;
  }

  /**
   * Authenticated fetch helper pointing to proxied Autodarts Cloud API
   */
  public async apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.config.apiBaseUrl}${cleanEndpoint}`;

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      throw new Error(`Autodarts API error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  public async getUserStats(userId: string): Promise<unknown> {
    return this.apiFetch(`/as/v0/users/${encodeURIComponent(userId)}`);
  }

  public async getMatchStats(matchId: string): Promise<unknown> {
    return this.apiFetch(`/as/v0/matches/${encodeURIComponent(matchId)}/stats`);
  }
}

export const cloudService = new AutodartsCloudService();
