import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { EmailService, CreateCustomSmtpDto } from './email.service';

function context(req: any): { orgId: string; userId: string } {
  const orgId = req.user?.orgId;
  const userId = req.user?.sub;
  if (!orgId || !userId) throw new BadRequestException('Authenticated organization context is required');
  return { orgId, userId };
}

@ApiTags('Email Accounts')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('api/v1/email/accounts')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get()
  @Roles('ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'List authenticated sender accounts for current tenant' })
  async list(@Req() req: any) {
    return this.emailService.list(context(req).orgId);
  }

  @Post('smtp')
  @Roles('ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Verify and register a custom authenticated SMTP sender account' })
  async createSmtp(@Req() req: any, @Body() body: CreateCustomSmtpDto) {
    const { orgId } = context(req);
    return this.emailService.createCustomSmtp(orgId, body);
  }

  @Get('gmail/status')
  @Roles('ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Get Gmail OAuth configuration status' })
  async getGmailStatus() {
    return this.emailService.getGmailConfigStatus();
  }

  @Post('gmail/config')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Configure Google OAuth credentials for 1-Click Sign-In' })
  async configureGmail(@Body() body: { clientId: string; clientSecret: string; redirectUri?: string }) {
    return this.emailService.saveGmailConfig(body.clientId, body.clientSecret, body.redirectUri);
  }

  @Get('gmail/oauth-url')
  @Roles('ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Create an official Gmail OAuth authorization URL' })
  async gmailOAuthUrl(@Req() req: any) {
    const { orgId, userId } = context(req);
    return this.emailService.gmailAuthUrl(orgId, userId);
  }

  @Get('gmail/callback')
  @ApiOperation({ summary: 'Complete Gmail OAuth and return to the Email Accounts screen' })
  async gmailCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      await this.emailService.gmailCallback(code, state);
      const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontend}/email-accounts?connected=gmail`);
    } catch (error: any) {
      const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
      const message = encodeURIComponent(error?.message || 'Gmail connection failed');
      return res.redirect(`${frontend}/email-accounts?error=${message}`);
    }
  }

  @Post(':id/test')
  @Roles('ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Send one controlled test email using a verified sender account' })
  async test(@Param('id') id: string, @Req() req: any) {
    const { orgId } = context(req);
    const to = String(req.body?.to || '').trim();
    const subject = String(req.body?.subject || 'AutoWork sender verification').trim();
    const body = String(req.body?.body || 'AutoWork controlled sender verification message.').trim();
    if (!to || !to.includes('@')) throw new BadRequestException('A valid test recipient email is required');
    return this.emailService.sendEmail(id, orgId, { to, subject, body });
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Remove AutoWork sender account and encrypted provider credentials' })
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.emailService.remove(id, context(req).orgId);
  }
}
