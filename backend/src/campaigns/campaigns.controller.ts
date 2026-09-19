import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CampaignsService, CreateCampaignDto } from './campaigns.service';
import { Roles } from '../auth/roles.decorator';

function currentOrgId(req: any): string {
  const orgId = req.user?.orgId;
  if (!orgId) throw new UnauthorizedException('Organization context is missing');
  return orgId;
}

@ApiTags('Campaigns')
@ApiBearerAuth()
@Controller('api/v1/campaigns')
export class CampaignsController {
  constructor(private campaignsService: CampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'List all pCloud share campaigns for current tenant' })
  async findAll(@Request() req: any) {
    return this.campaignsService.findAll(currentOrgId(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get campaign details, recipient progress, and execution logs' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.campaignsService.findOne(id, currentOrgId(req));
  }

  @Post()
  @Roles('ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Create a new configured pCloud share campaign' })
  async create(@Body() dto: CreateCampaignDto, @Request() req: any) {
    return this.campaignsService.create(currentOrgId(req), dto);
  }

  @Post(':id/launch')
  @Roles('ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Launch campaign and begin pCloud share/transfer execution' })
  async launch(@Param('id') id: string, @Request() req: any) {
    return this.campaignsService.launch(id, currentOrgId(req));
  }

  @Post(':id/pause')
  @Roles('ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Pause campaign execution' })
  async pause(@Param('id') id: string, @Request() req: any) {
    return this.campaignsService.pause(id, currentOrgId(req));
  }

  @Post(':id/recipients/:recipientId/retry')
  @Roles('ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Retry delivery for a specific campaign recipient' })
  async retryRecipient(
    @Param('id') id: string,
    @Param('recipientId') recipientId: string,
    @Request() req: any,
  ) {
    return this.campaignsService.retryRecipient(id, recipientId, currentOrgId(req));
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a campaign' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.campaignsService.remove(id, currentOrgId(req));
  }
}
