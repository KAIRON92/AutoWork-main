import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { decryptProviderCredentials, encryptProviderCredentials } from './email.credentials';
import { EmailAdapterFactory } from './adapters/email.factory';
import { SendEmailPayload } from './adapters/email.adapter';

interface OAuthState { orgId: string; userId: string; nonce: string; exp: number }

export interface CreateCustomSmtpDto {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
  accountEmail: string;
  fromName?: string;
}

@Injectable()
export class EmailService {
  constructor(private readonly prisma: PrismaService) {}

  private secret() {
    const value = process.env.JWT_SECRET;
    if (!value) throw new Error('JWT_SECRET is required for OAuth state signing');
    return value;
  }

  private encodeState(state: OAuthState) {
    const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
    const sig = createHmac('sha256', this.secret()).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  private decodeState(value: string): OAuthState {
    const [payload, sig] = value.split('.');
    if (!payload || !sig) throw new BadRequestException('Invalid OAuth state');
    const expected = createHmac('sha256', this.secret()).update(payload).digest('base64url');
    if (sig.length !== expected.length || !Buffer.from(sig).equals(Buffer.from(expected))) throw new BadRequestException('Invalid OAuth state');
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
    if (state.exp < Date.now()) throw new BadRequestException('OAuth state expired');
    return state;
  }

  private gmailConfigured() {
    const id = process.env.GMAIL_CLIENT_ID?.trim();
    const secret = process.env.GMAIL_CLIENT_SECRET?.trim();
    const uri = process.env.GMAIL_REDIRECT_URI?.trim();
    return Boolean(id && !id.includes('@') && secret && uri);
  }

  getGmailConfigStatus() {
    const configured = this.gmailConfigured();
    const clientId = process.env.GMAIL_CLIENT_ID ? `${process.env.GMAIL_CLIENT_ID.slice(0, 16)}...` : null;
    return {
      configured,
      clientId,
      redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:4000/api/v1/email/accounts/gmail/callback',
    };
  }

  async saveGmailConfig(clientId: string, clientSecret: string, redirectUri?: string) {
    if (!clientId?.trim() || !clientSecret?.trim()) {
      throw new BadRequestException('Google Client ID and Client Secret are required.');
    }
    const cleanId = clientId.trim();
    if (cleanId.includes('@') || !cleanId.endsWith('.apps.googleusercontent.com')) {
      throw new BadRequestException('Invalid Google Client ID. It must be a Google Cloud OAuth Client ID ending with .apps.googleusercontent.com (not an email address).');
    }
    process.env.GMAIL_CLIENT_ID = cleanId;
    process.env.GMAIL_CLIENT_SECRET = clientSecret.trim();
    if (redirectUri?.trim()) {
      process.env.GMAIL_REDIRECT_URI = redirectUri.trim();
    }
    try {
      const fs = await import('fs');
      const path = await import('path');
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf8');
        if (!content.includes('GMAIL_CLIENT_ID=')) {
          content += `\nGMAIL_CLIENT_ID=${clientId.trim()}`;
        } else {
          content = content.replace(/^GMAIL_CLIENT_ID=.*$/m, `GMAIL_CLIENT_ID=${clientId.trim()}`);
        }
        if (!content.includes('GMAIL_CLIENT_SECRET=')) {
          content += `\nGMAIL_CLIENT_SECRET=${clientSecret.trim()}`;
        } else {
          content = content.replace(/^GMAIL_CLIENT_SECRET=.*$/m, `GMAIL_CLIENT_SECRET=${clientSecret.trim()}`);
        }
        if (redirectUri?.trim()) {
          content = content.replace(/^GMAIL_REDIRECT_URI=.*$/m, `GMAIL_REDIRECT_URI=${redirectUri.trim()}`);
        }
        fs.writeFileSync(envPath, content, 'utf8');
      }
    } catch (e: any) {
      console.warn('Could not persist GMAIL OAuth credentials to .env:', e.message);
    }
    return { success: true, message: 'Google OAuth credentials saved and activated! 1-Click Sign-in is now live.' };
  }

  private microsoftConfigured() {
    return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_REDIRECT_URI);
  }

  async list(organizationId: string) {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return accounts.map(({ credentials, ...safe }) => ({ ...safe, hasCredentials: Boolean(credentials) }));
  }

  async findVerified(id: string, organizationId: string) {
    const account = await this.prisma.emailAccount.findFirst({
      where: { id, organizationId, status: 'VERIFIED' },
    });
    if (!account) throw new NotFoundException(`Verified email sender ${id} not found`);
    return account;
  }

  async remove(id: string, organizationId: string) {
    const account = await this.prisma.emailAccount.findFirst({ where: { id, organizationId } });
    if (!account) throw new NotFoundException('Email account not found');
    await this.prisma.emailAccount.delete({ where: { id } });
    return { success: true };
  }

  async createCustomSmtp(organizationId: string, dto: CreateCustomSmtpDto) {
    const adapter = EmailAdapterFactory.getAdapter('smtp');
    const validation = await adapter.validateAccount(dto);
    if (!validation.valid) {
      throw new BadRequestException(`SMTP verification failed: ${validation.message}`);
    }

    const normalizedEmail = dto.accountEmail.trim().toLowerCase();
    const existing = await this.prisma.emailAccount.findFirst({
      where: { organizationId, accountEmail: normalizedEmail, provider: 'smtp' },
    });

    const encrypted = encryptProviderCredentials(JSON.stringify({
      host: dto.host.trim(),
      port: Number(dto.port) || 587,
      secure: dto.secure,
      user: dto.user.trim(),
      pass: dto.pass,
      accountEmail: normalizedEmail,
      fromName: dto.fromName?.trim(),
    }));

    const data = {
      organizationId,
      provider: 'smtp',
      accountEmail: normalizedEmail,
      displayName: dto.fromName?.trim() || normalizedEmail,
      status: 'VERIFIED',
      credentials: encrypted,
      lastVerifiedAt: new Date(),
    };

    const account = existing
      ? await this.prisma.emailAccount.update({ where: { id: existing.id }, data })
      : await this.prisma.emailAccount.create({ data });

    return {
      id: account.id,
      accountEmail: account.accountEmail,
      displayName: account.displayName,
      provider: account.provider,
      status: account.status,
      lastVerifiedAt: account.lastVerifiedAt,
    };
  }

  async gmailAuthUrl(organizationId: string, userId: string) {
    if (!this.gmailConfigured()) throw new BadRequestException('Gmail OAuth is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REDIRECT_URI.');
    const state = this.encodeState({ orgId: organizationId, userId, nonce: randomBytes(16).toString('hex'), exp: Date.now() + 10 * 60 * 1000 });
    const params = new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      redirect_uri: process.env.GMAIL_REDIRECT_URI!,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'select_account consent',
      scope: 'openid email profile https://www.googleapis.com/auth/gmail.send',
      state,
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  }

  async gmailCallback(code: string, stateValue: string) {
    if (!this.gmailConfigured()) throw new BadRequestException('Gmail OAuth is not configured');
    if (!code) throw new BadRequestException('Missing OAuth code');
    const state = this.decodeState(stateValue);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GMAIL_CLIENT_ID!,
        client_secret: process.env.GMAIL_CLIENT_SECRET!,
        redirect_uri: process.env.GMAIL_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) throw new BadRequestException('Gmail OAuth token exchange failed');

    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.email) throw new BadRequestException('Unable to verify Gmail mailbox identity');

    const normalizedEmail = String(profile.email).toLowerCase();
    const existing = await this.prisma.emailAccount.findFirst({ where: { organizationId: state.orgId, accountEmail: normalizedEmail, provider: 'gmail' } });
    const encrypted = encryptProviderCredentials(JSON.stringify({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
      scope: token.scope,
      tokenType: token.token_type,
      accountEmail: normalizedEmail,
    }));

    const data = {
      organizationId: state.orgId,
      provider: 'gmail',
      accountEmail: normalizedEmail,
      displayName: profile.name || profile.email,
      status: 'VERIFIED',
      credentials: encrypted,
      scopes: token.scope || 'https://www.googleapis.com/auth/gmail.send',
      externalAccountId: profile.sub || null,
      lastVerifiedAt: new Date(),
    };

    const account = existing
      ? await this.prisma.emailAccount.update({ where: { id: existing.id }, data })
      : await this.prisma.emailAccount.create({ data });

    return { accountId: account.id, email: account.accountEmail, provider: account.provider, status: account.status };
  }

  async sendEmail(id: string, organizationId: string, payload: { to: string; subject: string; body: string; attachments?: any[] }) {
    const account = await this.prisma.emailAccount.findFirst({ where: { id, organizationId, status: 'VERIFIED' } });
    if (!account) throw new NotFoundException('Verified email sender account not found');
    const credentials = JSON.parse(decryptProviderCredentials(account.credentials));

    const adapter = EmailAdapterFactory.getAdapter(account.provider);
    const sendPayload: SendEmailPayload = {
      to: { email: payload.to },
      subject: payload.subject,
      body: payload.body,
      attachments: payload.attachments,
      accountCredentials: credentials,
    };

    const result = await adapter.sendEmail(sendPayload);
    if (!result.success) {
      throw new BadRequestException(result.error?.message || result.responseMessage || 'Email delivery failed');
    }

    // If OAuth token was refreshed during sending, persist updated credentials
    if (sendPayload.accountCredentials && JSON.stringify(sendPayload.accountCredentials) !== JSON.stringify(credentials)) {
      await this.prisma.emailAccount.update({
        where: { id },
        data: {
          credentials: encryptProviderCredentials(JSON.stringify(sendPayload.accountCredentials)),
          lastVerifiedAt: new Date(),
        },
      });
    }

    return { success: true, provider: account.provider, messageId: result.messageId };
  }
}
