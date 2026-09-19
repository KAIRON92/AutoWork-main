import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Request,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { PCloudAccountsService, CreatePCloudAccountDto } from './accounts.service';
import { Roles } from '../../auth/roles.decorator';

function currentOrgId(req: any): string {
  const orgId = req.user?.orgId;
  if (!orgId) throw new UnauthorizedException('Organization context is missing');
  return orgId;
}

function currentUserId(req: any): string {
  return req.user?.sub || req.user?.id || 'admin';
}

@ApiTags('pCloud Accounts')
@ApiBearerAuth()
@Controller('api/v1/pcloud/accounts')
export class PCloudAccountsController {
  constructor(private accountsService: PCloudAccountsService) {}

  @Get('oauth/url')
  @Roles('ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Generate official pCloud OAuth 2.0 authorization URL' })
  async getOAuthUrl(@Request() req: any, @Query('location') location?: string, @Query('origin') origin?: string) {
    const orgId = currentOrgId(req);
    const userId = currentUserId(req);
    const forwardedHost = req.headers?.['x-forwarded-host'];
    const forwardedProto = req.headers?.['x-forwarded-proto'] || 'https';
    const frontendOrigin = origin?.trim() || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : undefined);
    return this.accountsService.getOAuthAuthorizeUrl(orgId, userId, location, frontendOrigin);
  }

  @Post('oauth/exchange')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Directly exchange an authorization code for a connected pCloud account' })
  async exchangeOAuthCode(
    @Body() body: { code: string; name?: string; dailyLimit?: number },
    @Request() req: any,
  ) {
    return this.accountsService.exchangeCodeDirect(
      currentOrgId(req),
      body.code,
      body.name,
      body.dailyLimit,
    );
  }

  @Get('oauth/callback')
  @ApiOperation({ summary: 'Complete pCloud OAuth 2.0 Code Flow callback and redirect to frontend' })
  async handleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('locationid') locationid: string,
    @Query('hostname') hostname: string,
    @Res() res: Response,
  ) {
    const defaultFrontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    let targetFrontend = defaultFrontend;
    try {
      const result = await this.accountsService.handleOAuthCallback(code, state, locationid, hostname);
      if (result?.frontendOrigin) {
        targetFrontend = result.frontendOrigin;
      }
      return res.redirect(`${targetFrontend}/accounts?connected=pcloud`);
    } catch (error: any) {
      const message = encodeURIComponent(error?.message || 'pCloud OAuth connection failed');
      return res.redirect(`${targetFrontend}/accounts?error=${message}`);
    }
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.accountsService.findAll(currentOrgId(req));
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.accountsService.findOne(id, currentOrgId(req));
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Connect a new pCloud account' })
  async create(@Body() dto: CreatePCloudAccountDto, @Request() req: any) {
    return this.accountsService.create(currentOrgId(req), dto);
  }

  @Post(':id/test')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Test connection for a pCloud account' })
  async testConnection(@Param('id') id: string, @Request() req: any) {
    return this.accountsService.testConnection(id, currentOrgId(req));
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Toggle status (ACTIVE / PAUSED) of a pCloud account' })
  async toggleStatus(@Param('id') id: string, @Request() req: any) {
    return this.accountsService.toggleStatus(id, currentOrgId(req));
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a connected pCloud account' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.accountsService.remove(id, currentOrgId(req));
  }
}
