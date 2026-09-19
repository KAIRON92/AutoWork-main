import { Injectable, NotFoundException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { createHmac, createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PCloudAdapterFactory } from '../pcloud.factory';
import { encryptPCloudCredential, decryptPCloudCredential } from '../pcloud-credentials';
import { encryptProviderCredentials } from '../../email/email.credentials';

export interface CreatePCloudAccountDto {
  name: string;
  accountEmail: string;
  provider?: 'pcloud' | 'mock_pcloud';
  accessToken?: string;
  otpCode?: string;
  dailyLimit?: number;
  folderId?: string;
}

interface PCloudLoginResult {
  token: string;
  userInfo: any;
  apiHost: string;
}

interface OAuthState {
  orgId: string;
  userId: string;
  nonce: string;
  exp: number;
  frontendOrigin?: string;
}

function getPCloudClientSecret(): string {
  let secret = (process.env.PCLOUD_CLIENT_SECRET || '').trim();
  if (!secret || secret.startsWith('lv2AO')) {
    secret = 'Iv2AO9hDCYYKaWBjwYYigJA6BJkk';
  }
  return secret;
}

@Injectable()
export class PCloudAccountsService {
  constructor(private prisma: PrismaService) {}

  private secret(): string {
    const value = process.env.JWT_SECRET || process.env.PCLOUD_CREDENTIAL_ENCRYPTION_KEY;
    if (!value) throw new Error('JWT_SECRET or PCLOUD_CREDENTIAL_ENCRYPTION_KEY is required for OAuth state signing');
    return value;
  }

  private encodeState(state: OAuthState): string {
    const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
    const sig = createHmac('sha256', this.secret()).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  private decodeState(value: string): OAuthState {
    const [payload, sig] = (value || '').split('.');
    if (!payload || !sig) throw new BadRequestException('Invalid pCloud OAuth state');
    const expected = createHmac('sha256', this.secret()).update(payload).digest('base64url');
    if (sig.length !== expected.length || !Buffer.from(sig).equals(Buffer.from(expected))) {
      throw new BadRequestException('Invalid pCloud OAuth state signature');
    }
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
    if (state.exp < Date.now()) throw new BadRequestException('pCloud OAuth state expired');
    return state;
  }

  pCloudOAuthConfigured(): boolean {
    const clientId = process.env.PCLOUD_CLIENT_ID || 'LKgngYPdexJ';
    const clientSecret = getPCloudClientSecret();
    return Boolean(clientId && clientSecret);
  }

  getOAuthAuthorizeUrl(organizationId: string, userId: string, location?: string, frontendOrigin?: string): { url: string; euUrl: string } {
    const clientId = (process.env.PCLOUD_CLIENT_ID || 'LKgngYPdexJ').trim();
    const redirectUri = (process.env.PCLOUD_REDIRECT_URI || 'http://localhost:4000/api/v1/pcloud/accounts/oauth/callback').trim();
    const state = this.encodeState({
      orgId: organizationId,
      userId,
      nonce: randomBytes(16).toString('hex'),
      exp: Date.now() + 10 * 60 * 1000,
      frontendOrigin: frontendOrigin?.trim() || undefined,
    });
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    });
    // pCloud uses https://my.pcloud.com/oauth2/authorize for all regions and returns locationid in callback
    const url = `https://my.pcloud.com/oauth2/authorize?${params.toString()}`;
    return { url, euUrl: url };
  }

  async exchangeCodeDirect(
    organizationId: string,
    code: string,
    name?: string,
    dailyLimit?: number,
    locationid?: string,
    hostname?: string,
  ): Promise<any> {
    if (!code || !code.trim()) throw new BadRequestException('Authorization code is required');
    const clientId = (process.env.PCLOUD_CLIENT_ID || 'LKgngYPdexJ').trim();
    const clientSecret = getPCloudClientSecret();

    let tokenHost = 'https://api.pcloud.com';
    if (hostname?.trim()) {
      const cleanHost = hostname.trim();
      tokenHost = cleanHost.startsWith('http') ? cleanHost : `https://${cleanHost}`;
    } else if (locationid === '2') {
      tokenHost = 'https://eapi.pcloud.com';
    }

    let tokenData: any;
    try {
      const tokenRes = await fetch(`${tokenHost}/oauth2_token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code.trim(),
        }).toString(),
      });
      tokenData = await tokenRes.json();
    } catch (err: any) {
      throw new BadRequestException(`Failed to connect to pCloud token server: ${err.message}`);
    }

    if (Number(tokenData?.result) === 2321) {
      const altHost = tokenHost.includes('eapi.pcloud.com') ? 'https://api.pcloud.com' : 'https://eapi.pcloud.com';
      try {
        const altRes = await fetch(`${altHost}/oauth2_token`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: code.trim(),
          }).toString(),
        });
        tokenData = await altRes.json();
        if (Number(tokenData?.result) === 0) {
          tokenHost = altHost;
        }
      } catch {}
    }

    if (Number(tokenData?.result) !== 0 || !tokenData?.access_token) {
      throw new BadRequestException(
        `pCloud token exchange failed: ${String(tokenData?.error || 'Invalid or expired authorization code')}`
      );
    }

    const accessToken = String(tokenData.access_token);
    const adapter = PCloudAdapterFactory.getAdapter('pcloud');
    const verifyResult = await adapter.verifyConnection(accessToken, tokenHost);

    if (!verifyResult.connected || !verifyResult.userInfo) {
      throw new BadRequestException(verifyResult.message || 'Unable to verify pCloud access token with /userinfo');
    }

    const resolvedApiHost = verifyResult.userInfo.resolvedApiHost || tokenHost;
    const accountEmail = verifyResult.userInfo.email.trim().toLowerCase();
    const credentials = encryptPCloudCredential(accessToken);

    const existing = await this.prisma.pCloudAccount.findFirst({
      where: { organizationId, accountEmail },
    });

    const accountData = {
      organizationId,
      name: name?.trim() || existing?.name || `pCloud (${accountEmail})`,
      accountEmail,
      provider: 'pcloud',
      status: 'ACTIVE' as const,
      dailyLimit: dailyLimit || existing?.dailyLimit || 500,
      sentToday: existing?.sentToday || 0,
      folderId: existing?.folderId || '0',
      credentials,
      pcloudUserId: verifyResult.userInfo.userId || String(tokenData.uid || ''),
      apiHost: resolvedApiHost,
      lastUsedAt: new Date(),
    };

    const saved = existing
      ? await this.prisma.pCloudAccount.update({ where: { id: existing.id }, data: accountData })
      : await this.prisma.pCloudAccount.create({ data: accountData });

    // Auto-register matching sender mailbox in Email Accounts
    await this.autoRegisterEmailAccount(organizationId, accountEmail, accountData.name);

    return this.sanitizeAccount(saved);
  }

  async handleOAuthCallback(
    code: string,
    stateValue: string,
    locationid?: string,
    hostname?: string
  ): Promise<any> {
    if (!code) throw new BadRequestException('Missing authorization code from pCloud');

    const state = this.decodeState(stateValue);
    const clientId = (process.env.PCLOUD_CLIENT_ID || 'LKgngYPdexJ').trim();
    const clientSecret = getPCloudClientSecret();

    console.log(`[pCloud OAuth] Callback received: code=${code.substring(0, 8)}..., locationid=${locationid}, hostname=${hostname}`);

    // Determine target host for oauth2_token exchange
    // pCloud EU accounts use eapi.pcloud.com, US accounts use api.pcloud.com
    let tokenHost = 'https://api.pcloud.com';
    if (hostname?.trim()) {
      const cleanHost = hostname.trim();
      tokenHost = cleanHost.startsWith('http') ? cleanHost : `https://${cleanHost}`;
    } else if (locationid === '2') {
      tokenHost = 'https://eapi.pcloud.com';
    }

    console.log(`[pCloud OAuth] Token exchange host: ${tokenHost}`);

    // Exchange authorization code for bearer token at /oauth2_token
    // Try the hostname-derived host first, then fallback to alternate region
    const hostsToTry = [tokenHost];
    const altHost = tokenHost.includes('eapi.pcloud.com') ? 'https://api.pcloud.com' : 'https://eapi.pcloud.com';
    hostsToTry.push(altHost);

    let tokenData: any;
    let successHost = tokenHost;

    for (const host of hostsToTry) {
      try {
        console.log(`[pCloud OAuth] Trying token exchange on ${host}...`);
        const tokenRes = await fetch(`${host}/oauth2_token`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: code.trim(),
          }).toString(),
        });
        tokenData = await tokenRes.json();
        console.log(`[pCloud OAuth] ${host} response: result=${tokenData?.result}, hasToken=${!!tokenData?.access_token}`);
        if (Number(tokenData?.result) === 0 && tokenData?.access_token) {
          successHost = host;
          break;
        }
      } catch (err: any) {
        console.warn(`[pCloud OAuth] ${host} token exchange network error: ${err.message}`);
      }
    }

    if (Number(tokenData?.result) !== 0 || !tokenData?.access_token) {
      throw new BadRequestException(
        `pCloud token exchange failed (result ${String(tokenData?.result)}): ${String(tokenData?.error || 'unknown error')}`
      );
    }

    const accessToken = String(tokenData.access_token);
    console.log(`[pCloud OAuth] Token obtained from ${successHost}, verifying with /userinfo...`);

    // Try verifyConnection on the success host, then alternate host
    const adapter = PCloudAdapterFactory.getAdapter('pcloud');
    let verifyResult = await adapter.verifyConnection(accessToken, successHost);

    if (!verifyResult.connected) {
      console.warn(`[pCloud OAuth] /userinfo failed on ${successHost}: ${verifyResult.message}, trying alternate...`);
      const verifyAltHost = successHost.includes('eapi.pcloud.com') ? 'https://api.pcloud.com' : 'https://eapi.pcloud.com';
      verifyResult = await adapter.verifyConnection(accessToken, verifyAltHost);
      if (verifyResult.connected) {
        successHost = verifyAltHost;
        console.log(`[pCloud OAuth] /userinfo succeeded on alternate host ${verifyAltHost}`);
      }
    }

    if (!verifyResult.connected || !verifyResult.userInfo) {
      throw new BadRequestException(verifyResult.message || 'Unable to verify pCloud access token with /userinfo');
    }

    const resolvedApiHost = verifyResult.userInfo.resolvedApiHost || successHost;
    const accountEmail = verifyResult.userInfo.email.trim().toLowerCase();
    const credentials = encryptPCloudCredential(accessToken);

    // Look for existing account in this organization
    const existing = await this.prisma.pCloudAccount.findFirst({
      where: { organizationId: state.orgId, accountEmail },
    });

    const accountData = {
      organizationId: state.orgId,
      name: existing?.name || `pCloud (${accountEmail})`,
      accountEmail,
      provider: 'pcloud',
      status: 'ACTIVE' as const,
      dailyLimit: existing?.dailyLimit || 500,
      sentToday: existing?.sentToday || 0,
      folderId: existing?.folderId || '0',
      credentials,
      pcloudUserId: verifyResult.userInfo.userId || String(tokenData.uid || ''),
      apiHost: resolvedApiHost,
      lastUsedAt: new Date(),
    };

    const saved = existing
      ? await this.prisma.pCloudAccount.update({ where: { id: existing.id }, data: accountData })
      : await this.prisma.pCloudAccount.create({ data: accountData });

    // Auto-register matching sender mailbox in Email Accounts
    await this.autoRegisterEmailAccount(state.orgId, accountEmail, accountData.name);

    return { ...this.sanitizeAccount(saved), frontendOrigin: state.frontendOrigin };
  }

  private sanitizeAccount(account: any) {
    if (!account) return null;
    const { credentials, ...safe } = account;
    return { ...safe, hasCredentials: !!credentials && credentials.length > 0 };
  }

  /**
   * Automatically registers/links a matching EmailAccount in the Email Accounts section
   * when a user connects or creates a pCloud account, allowing instant campaign dispatch.
   */
  private async autoRegisterEmailAccount(
    organizationId: string,
    accountEmail: string,
    displayName?: string,
    rawPassword?: string,
  ): Promise<void> {
    try {
      const cleanEmail = accountEmail.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) return;

      const domain = cleanEmail.split('@')[1];
      const isGmail = domain === 'gmail.com' || domain === 'googlemail.com';
      const isOutlook = domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com';
      const isYahoo = domain === 'yahoo.com' || domain === 'ymail.com';

      let defaultHost = `mail.${domain}`;
      if (isGmail) defaultHost = 'smtp.gmail.com';
      else if (isOutlook) defaultHost = 'smtp.office365.com';
      else if (isYahoo) defaultHost = 'smtp.mail.yahoo.com';

      const provider = isGmail ? 'gmail' : 'smtp';

      // Check if an email account for this email already exists in this org
      const existing = await this.prisma.emailAccount.findFirst({
        where: { organizationId, accountEmail: cleanEmail },
      });

      if (!existing) {
        const credsPayload: Record<string, any> = {
          host: defaultHost,
          port: 587,
          secure: false,
          user: cleanEmail,
          pass: rawPassword || '',
          accountEmail: cleanEmail,
          fromName: displayName || `pCloud Sender (${cleanEmail})`,
        };

        await this.prisma.emailAccount.create({
          data: {
            organizationId,
            provider,
            accountEmail: cleanEmail,
            displayName: displayName || cleanEmail,
            status: 'VERIFIED',
            credentials: encryptProviderCredentials(JSON.stringify(credsPayload)),
            lastVerifiedAt: new Date(),
          },
        });

        console.log(`[AutoWork] Successfully auto-registered EmailAccount for pCloud user ${cleanEmail} (provider: ${provider})`);
      } else if (rawPassword && existing.status !== 'VERIFIED') {
        try {
          const credsPayload: Record<string, any> = {
            host: defaultHost,
            port: 587,
            secure: false,
            user: cleanEmail,
            pass: rawPassword,
            accountEmail: cleanEmail,
            fromName: displayName || existing.displayName || cleanEmail,
          };
          await this.prisma.emailAccount.update({
            where: { id: existing.id },
            data: {
              status: 'VERIFIED',
              credentials: encryptProviderCredentials(JSON.stringify(credsPayload)),
              lastVerifiedAt: new Date(),
            },
          });
        } catch {}
      }
    } catch (err: any) {
      console.warn(`[AutoWork] Auto-registering EmailAccount skipped: ${err.message}`);
    }
  }

  /**
   * Discover pCloud's closest HTTP API servers. Queries BOTH the US
   * (api.pcloud.com) and EU (eapi.pcloud.com) getapiserver endpoints so that
   * accounts from either region are discovered on the first attempt.
   */
  private async discoverApiHosts(): Promise<string[]> {
    const fallback = ['https://api.pcloud.com', 'https://eapi.pcloud.com'];
    const discovered: string[] = [];

    for (const endpoint of [
      'https://api.pcloud.com/getapiserver',
      'https://eapi.pcloud.com/getapiserver',
    ]) {
      try {
        const response = await fetch(endpoint);
        const data = await response.json();
        if (Number(data.result) === 0 && Array.isArray(data.api)) {
          for (const host of data.api) {
            if (typeof host === 'string' && host.trim()) {
              const normalized = host.startsWith('http') ? host : `https://${host}`;
              if (!discovered.includes(normalized)) discovered.push(normalized);
            }
          }
        }
      } catch {
        /* continue to next endpoint */
      }
    }

    for (const fb of fallback) {
      if (!discovered.includes(fb)) discovered.push(fb);
    }
    return discovered;
  }

  /**
   * Authenticate a real pCloud account using pCloud's documented credential
   * login flow.
   *
   * Result 1022 ("Please provide 'code'") indicates pCloud requires an
   * additional verification code — either emailed to the account owner or
   * from an authenticator app.  When this result is returned by a host that
   * is the CORRECT region for this account, we STOP iterating and either
   * complete the login (if a code was supplied) or surface a verification-
   * required error to the frontend.
   *
   * Result 2297 triggers the older two-step TFA flow: /login returns a
   * challenge token, then /tfa_login exchanges that token + OTP for auth.
   *
   * Result 2321 (wrong region) causes a retry on the next candidate host.
   */  /**
   * Authenticate a real pCloud account using username and password.
   * Tests both US (api.pcloud.com) and EU (eapi.pcloud.com) regions directly.
   * If 2FA code is needed, prompts for code. If credentials succeed, returns auth token.
   */
  private async loginWithPassword(username: string, password: string, otpCode?: string): Promise<PCloudLoginResult> {
    if (!username || !password) throw new BadRequestException('pCloud email and password are required');

    const cleanUsername = username.toLowerCase().trim();
    const cleanPassword = password.trim();
    const candidateHosts = await this.discoverApiHosts();

    let lastResult: number | string | undefined;
    let lastError: string = 'pCloud authentication failed';
    let needs2fa = false;

    for (const host of candidateHosts) {
      // 1. Official pCloud /login endpoint
      try {
        const loginParams = new URLSearchParams({
          username: cleanUsername,
          password: cleanPassword,
          getauth: '1',
        });
        if (otpCode?.trim()) loginParams.set('code', otpCode.trim());

        const loginRes = await fetch(`${host}/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: loginParams.toString(),
        });
        const loginData = await loginRes.json();

        if (Number(loginData.result) === 0 && loginData.auth) {
          console.log(`[pCloud Auth] Successfully authenticated via /login on ${host}`);
          return { token: String(loginData.auth), userInfo: loginData, apiHost: host };
        }

        if (Number(loginData.result) === 2321 && loginData.hostname) {
          const redirectHost = loginData.hostname.startsWith('http') ? loginData.hostname : `https://${loginData.hostname}`;
          if (!candidateHosts.includes(redirectHost)) {
            candidateHosts.push(redirectHost);
          }
          continue;
        }

        if (Number(loginData.result) === 1022) {
          needs2fa = true;
          lastResult = loginData.result;
          lastError = loginData.error || "Please provide 'code'.";
          break;
        }

        if (Number(loginData.result) === 2297) {
          if (otpCode?.trim() && loginData.token) {
            try {
              const tfaRes = await fetch(`${host}/tfa_login`, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  token: String(loginData.token),
                  code: otpCode.trim(),
                }).toString(),
              });
              const tfaData = await tfaRes.json();
              if (Number(tfaData.result) === 0 && (tfaData.auth || tfaData.token)) {
                return { token: String(tfaData.auth || tfaData.token), userInfo: tfaData, apiHost: host };
              }
            } catch (err: any) {
              console.warn(`[pCloud Auth] /tfa_login failed on ${host}: ${err.message}`);
            }
          }
          needs2fa = true;
          lastResult = loginData.result;
          lastError = loginData.error || 'Two-factor verification required';
          break;
        }

        if (loginData.result !== undefined) {
          lastResult = loginData.result;
          lastError = loginData.error || lastError;
        }
      } catch (err: any) {
        console.warn(`[pCloud Auth] /login failed on ${host}: ${err.message}`);
      }

      // 2. Try digest authentication (sha1(password + sha1(username) + digest))
      try {
        const digestRes = await fetch(`${host}/getdigest`);
        const digestData = await digestRes.json();
        if (Number(digestData.result) === 0 && digestData.digest) {
          const sha1User = createHash('sha1').update(cleanUsername).digest('hex');
          const passwordDigest = createHash('sha1').update(cleanPassword + sha1User + digestData.digest).digest('hex');

          const digestParams = new URLSearchParams({
            username: cleanUsername,
            digest: String(digestData.digest),
            passworddigest: passwordDigest,
            getauth: '1',
          });
          if (otpCode?.trim()) digestParams.set('code', otpCode.trim());

          // Try official /userinfo method with digest
          const dUiRes = await fetch(`${host}/userinfo`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: digestParams.toString(),
          });
          const dUiData = await dUiRes.json();

          if (Number(dUiData.result) === 0 && dUiData.auth) {
            console.log(`[pCloud Auth] Successfully authenticated via digest userinfo on ${host}`);
            return { token: String(dUiData.auth), userInfo: dUiData, apiHost: host };
          }

          // Also try /login with digest
          const dLoginRes = await fetch(`${host}/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: digestParams.toString(),
          });
          const dLoginData = await dLoginRes.json();

          if (Number(dLoginData.result) === 0 && dLoginData.auth) {
            console.log(`[pCloud Auth] Successfully authenticated via digest on ${host}`);
            return { token: String(dLoginData.auth), userInfo: dLoginData, apiHost: host };
          }
        }
      } catch (err: any) {
        console.warn(`[pCloud Auth] Digest login failed on ${host}: ${err.message}`);
      }
    }

    // Handle 2FA / Email code requirement
    if (needs2fa) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: `pCloud security requires an access token or verification code for ${cleanUsername}. Enter your code below or use an Access Token / 1-Click OAuth to connect.`,
          error: 'PCLOUD_ACCESS_TOKEN_REQUIRED',
          accessTokenRequired: true,
          verificationRequired: true,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // If result was 2000 (Invalid login)
    if (Number(lastResult) === 2000) {
      throw new BadRequestException(
        'pCloud login failed: Incorrect email or password. Please verify your credentials. (Note: If your pCloud account was created with Google Sign-In, please set a password in your pCloud Account Security settings first, or connect via the 1-Click OAuth tab).'
      );
    }

    throw new BadRequestException(`pCloud authentication failed: ${lastError} (code: ${lastResult || 'unknown'})`);
  }

  async findAll(organizationId: string) {
    const accounts = await this.prisma.pCloudAccount.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
    return accounts.map((a) => this.sanitizeAccount(a));
  }

  async findOne(id: string, organizationId: string) {
    const account = await this.prisma.pCloudAccount.findFirst({ where: { id, organizationId } });
    if (!account) throw new NotFoundException(`pCloud Account ${id} not found`);
    return this.sanitizeAccount(account);
  }

  async getAccountCredentials(id: string, organizationId: string): Promise<{ credential: string; apiHost: string | null }> {
    const account = await this.prisma.pCloudAccount.findFirst({ where: { id, organizationId } });
    if (!account) throw new NotFoundException(`pCloud Account ${id} not found`);
    if (account.provider === 'mock_pcloud') {
      if (process.env.PCLOUD_ALLOW_MOCK !== 'true') {
        throw new BadRequestException('Mock pCloud accounts are disabled.');
      }
      return { credential: account.credentials, apiHost: account.apiHost };
    }
    return { credential: decryptPCloudCredential(account.credentials), apiHost: account.apiHost };
  }

  async create(organizationId: string, dto: CreatePCloudAccountDto) {
    const provider = dto.provider || process.env.PCLOUD_DEFAULT_PROVIDER || 'pcloud';
    if (provider === 'mock_pcloud' && process.env.PCLOUD_ALLOW_MOCK !== 'true') {
      throw new BadRequestException('Mock pCloud accounts are disabled. Select the Official pCloud REST API (Production) provider.');
    }
    if (provider !== 'pcloud' && provider !== 'mock_pcloud') {
      throw new BadRequestException(`Unsupported pCloud provider: ${provider}`);
    }

    const accountEmail = dto.accountEmail.trim().toLowerCase();
    const rawCredential = dto.accessToken?.trim();

    if (provider === 'mock_pcloud') {
      const credential = rawCredential || 'mock_access_token';
      const adapter = PCloudAdapterFactory.getAdapter(provider);
      const verifyResult = await adapter.verifyConnection(credential);

      const existing = this.prisma?.pCloudAccount?.findFirst
        ? await this.prisma.pCloudAccount.findFirst({ where: { organizationId, accountEmail } })
        : null;

      const accountData = {
        organizationId,
        name: dto.name || existing?.name || `Sandbox (${accountEmail})`,
        accountEmail,
        provider,
        status: (verifyResult.connected ? 'ACTIVE' : 'ERROR') as any,
        dailyLimit: dto.dailyLimit || existing?.dailyLimit || 500,
        sentToday: existing?.sentToday || 0,
        folderId: dto.folderId || existing?.folderId || '0',
        credentials: credential,
        pcloudUserId: verifyResult.userInfo?.userId || existing?.pcloudUserId || 'mock-user-1',
        lastUsedAt: new Date(),
      };

      const account = existing
        ? await this.prisma.pCloudAccount.update({ where: { id: existing.id }, data: accountData })
        : await this.prisma.pCloudAccount.create({ data: accountData });

      // Auto-register matching sender mailbox in Email Accounts
      await this.autoRegisterEmailAccount(organizationId, accountEmail, accountData.name);

      return this.sanitizeAccount(account);
    }

    if (!rawCredential) throw new BadRequestException('Provide a pCloud access token or the pCloud account password');

    const adapter = PCloudAdapterFactory.getAdapter('pcloud');
    let credentialForStorage = rawCredential;
    let verifyResult = await adapter.verifyConnection(rawCredential);
    let apiHost = verifyResult.userInfo?.resolvedApiHost || 'https://api.pcloud.com';

    if (!verifyResult.connected) {
      const login = await this.loginWithPassword(accountEmail, rawCredential, dto.otpCode);
      credentialForStorage = login.token;
      apiHost = login.apiHost;
      verifyResult = await adapter.verifyConnection(login.token, apiHost);
      if (verifyResult.userInfo?.resolvedApiHost) {
        apiHost = verifyResult.userInfo.resolvedApiHost;
      }
    }

    const credentials = encryptPCloudCredential(credentialForStorage);

    const existing = this.prisma?.pCloudAccount?.findFirst
      ? await this.prisma.pCloudAccount.findFirst({ where: { organizationId, accountEmail } })
      : null;

    const accountData = {
      organizationId,
      name: dto.name || existing?.name || `pCloud (${accountEmail})`,
      accountEmail,
      provider: 'pcloud',
      status: 'ACTIVE' as const,
      dailyLimit: dto.dailyLimit || existing?.dailyLimit || 500,
      sentToday: existing?.sentToday || 0,
      folderId: dto.folderId || existing?.folderId || '0',
      credentials,
      pcloudUserId: verifyResult.userInfo?.userId || existing?.pcloudUserId || undefined,
      apiHost,
      lastUsedAt: new Date(),
    };

    const saved = existing
      ? await this.prisma.pCloudAccount.update({ where: { id: existing.id }, data: accountData })
      : await this.prisma.pCloudAccount.create({ data: accountData });

    // Auto-register matching sender mailbox in Email Accounts
    await this.autoRegisterEmailAccount(organizationId, accountEmail, accountData.name, rawCredential);

    return this.sanitizeAccount(saved);
  }

  async testConnection(id: string, organizationId: string) {
    const account = await this.prisma.pCloudAccount.findFirst({ where: { id, organizationId } });
    if (!account) throw new NotFoundException(`pCloud Account ${id} not found`);
    if (account.provider === 'mock_pcloud' && process.env.PCLOUD_ALLOW_MOCK !== 'true') {
      throw new BadRequestException('This account uses the disabled mock provider. Disconnect it and add the account using Official pCloud REST API (Production).');
    }

    const credential = account.provider === 'mock_pcloud' ? account.credentials : decryptPCloudCredential(account.credentials);
    const adapter = PCloudAdapterFactory.getAdapter(account.provider);
    const result = await adapter.verifyConnection(credential, account.apiHost || undefined);
    const updatedApiHost = result.userInfo?.resolvedApiHost || account.apiHost;
    await this.prisma.pCloudAccount.update({
      where: { id },
      data: {
        status: result.connected ? 'ACTIVE' : 'ERROR',
        apiHost: updatedApiHost,
        lastUsedAt: result.connected ? new Date() : account.lastUsedAt,
      },
    });
    return result;
  }

  async toggleStatus(id: string, organizationId: string) {
    const account = await this.prisma.pCloudAccount.findFirst({ where: { id, organizationId } });
    if (!account) throw new NotFoundException(`pCloud Account ${id} not found`);
    const newStatus = account.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    const updated = await this.prisma.pCloudAccount.update({ where: { id }, data: { status: newStatus } });
    return this.sanitizeAccount(updated);
  }

  async remove(id: string, organizationId: string) {
    const account = await this.prisma.pCloudAccount.findFirst({ where: { id, organizationId } });
    if (!account) throw new NotFoundException(`pCloud Account ${id} not found`);

    if (this.prisma.$transaction) {
      await this.prisma.$transaction(async (tx) => {
        // 1. Delete linked share executions
        if (tx.pCloudShareExecution?.deleteMany) {
          await tx.pCloudShareExecution.deleteMany({ where: { pcloudAccountId: id } });
        }

        // 2. Cleanly delete or unlink campaigns referencing this account
        if (tx.campaign?.findMany) {
          const linkedCampaigns = await tx.campaign.findMany({
            where: { pcloudAccountId: id },
            select: { id: true },
          });
          for (const cmp of linkedCampaigns) {
            if (tx.campaignRecipient?.deleteMany) {
              await tx.campaignRecipient.deleteMany({ where: { campaignId: cmp.id } });
            }
            if (tx.pCloudShareExecution?.deleteMany) {
              await tx.pCloudShareExecution.deleteMany({ where: { campaignId: cmp.id } });
            }
            await tx.campaign.delete({ where: { id: cmp.id } });
          }
        }

        // 3. Unlink any files referencing this account
        if (tx.pCloudFile?.updateMany) {
          await tx.pCloudFile.updateMany({
            where: { pcloudAccountId: id },
            data: { pcloudAccountId: null },
          });
        }

        // 4. Delete the pCloud account record
        await tx.pCloudAccount.delete({ where: { id } });
      });
    } else {
      await this.prisma.pCloudAccount.delete({ where: { id } });
    }

    return { success: true, message: `Account "${account.name}" (${account.accountEmail}) disconnected and removed successfully` };
  }
}
