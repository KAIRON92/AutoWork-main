import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigService } from '../config/config.service';
import { getRedisConnectionOptions } from '../config/redis.config';

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);

  public pcloudShareQueue!: Queue;
  public emailDispatchQueue!: Queue;
  public importQueue!: Queue;
  public campaignQueue!: Queue;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const connection = getRedisConnectionOptions();

    this.pcloudShareQueue = new Queue('pcloud-share-queue', { connection });
    this.emailDispatchQueue = new Queue('email-dispatch-queue', { connection });
    this.importQueue = new Queue('import-queue', { connection });
    this.campaignQueue = new Queue('campaign-queue', { connection });

    try {
      await Promise.race([
        Promise.all([
          this.pcloudShareQueue.waitUntilReady(),
          this.emailDispatchQueue.waitUntilReady(),
          this.importQueue.waitUntilReady(),
          this.campaignQueue.waitUntilReady(),
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout (3s)')), 3000)),
      ]);
      this.logger.log('🚀 BullMQ queues connected to Redis (pcloud-share-queue, email-dispatch-queue, import-queue, campaign-queue)');
    } catch (err: any) {
      this.logger.warn(`⚠️ BullMQ queue notice: Redis connection delayed or offline (${err?.message}). Queues will retry automatically in background.`);
    }
  }

  async enqueuePCloudShareJob(data: any) {
    if (!this.pcloudShareQueue) throw new Error('pCloud share queue is not initialized');
    return this.pcloudShareQueue.add('pcloud-share', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });
  }

  async enqueueEmailDispatchJob(data: any) {
    if (!this.emailDispatchQueue) throw new Error('Email dispatch queue is not initialized');
    return this.emailDispatchQueue.add('email-dispatch', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });
  }

  async enqueueCampaignJob(data: any) {
    if (!this.campaignQueue) throw new Error('Campaign queue is not initialized');
    return this.campaignQueue.add('process-campaign', data, { attempts: 1 });
  }

  async enqueueImportJob(data: any) {
    if (!this.importQueue) throw new Error('Import queue is not initialized');
    return this.importQueue.add('process-import', data, { attempts: 1 });
  }
}
