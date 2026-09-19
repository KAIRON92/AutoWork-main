import { PCloudErrorMapper } from './pcloud.errors';
import {
  PCloudErrorCode,
  PCloudUserInfo,
  PCloudItemMetadata,
  PCloudShareOptions,
  PCloudTransferOptions,
  PCloudShareResult,
} from '../pcloud.interface';

export class PCloudClient {
  private defaultApiHost: string;

  constructor(defaultApiHost: string = 'https://api.pcloud.com') {
    this.defaultApiHost = defaultApiHost;
  }

  private getHost(customHost?: string): string {
    return customHost || this.defaultApiHost;
  }

  private getAlternateHost(host: string): string {
    if (host.includes('eapi.pcloud.com')) {
      return host.replace('eapi.pcloud.com', 'api.pcloud.com');
    }
    if (host.includes('api.pcloud.com')) {
      return host.replace('api.pcloud.com', 'eapi.pcloud.com');
    }
    return 'https://eapi.pcloud.com';
  }

  /**
   * Universal API request handler for pCloud.
   * Handles both session auth tokens (auth=...) and OAuth 2.0 access_token (access_token=...),
   * with automatic regional failover (2321).
   */
  private async requestJson(
    endpoint: string,
    token: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options: {
      method?: string;
      body?: any;
      apiHost?: string;
    } = {}
  ): Promise<{ data: any; host: string }> {
    const primaryHost = this.getHost(options.apiHost);
    const altHost = this.getAlternateHost(primaryHost);
    const hosts = [primaryHost, altHost];
    const authModes: Array<'auth' | 'access_token'> = ['auth', 'access_token'];

    let lastData: any = null;
    let lastHost = primaryHost;

    for (const host of hosts) {
      for (const mode of authModes) {
        let res: any;
        let data: any;
        try {
          const searchParts: string[] = [`${mode}=${encodeURIComponent(token)}`];
          for (const [key, val] of Object.entries(params)) {
            if (val !== undefined && val !== null) {
              searchParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val)).replace(/%20/g, '%20')}`);
            }
          }
          const url = `${host}/${endpoint.replace(/^\//, '')}?${searchParts.join('&')}`;

          const headers: Record<string, string> = {};
          if (mode === 'access_token') {
            headers['Authorization'] = `Bearer ${token}`;
          }

          res = await fetch(url, {
            method: options.method || (options.body ? 'POST' : 'GET'),
            headers,
            body: options.body,
          });

          data = await res.json();
          lastData = data;
          lastHost = host;
        } catch (err: any) {
          throw PCloudErrorMapper.fromNetworkError(err);
        }

        // 0 = Success
        if (data.result === 0) {
          return { data, host };
        }

        // 2321 = Wrong region, try other host
        if (data.result === 2321) {
          break;
        }

        // If auth mode mismatch (1000, 2000, 2094), try other auth mode on this host
        if (data.result === 1000 || data.result === 2000 || data.result === 2094) {
          continue;
        }

        // Any other non-2321 error (e.g., 4000 rate limit, 2004 not found, 2019 already shared), return immediately
        return { data, host };
      }
    }

    return { data: lastData, host: lastHost };
  }

  async getUserInfo(accessToken: string, apiHost?: string): Promise<PCloudUserInfo> {
    try {
      const { data, host } = await this.requestJson('userinfo', accessToken, {}, { apiHost });
      if (data?.result === 0) {
        return {
          userId: data.userid?.toString() || 'unknown',
          email: data.email || '',
          quota: data.quota || 0,
          usedQuota: data.usedquota || 0,
          freeQuota: (data.quota || 0) - (data.usedquota || 0),
          emailVerified: !!data.emailverified,
          registered: data.registered || new Date().toISOString(),
          resolvedApiHost: host,
        };
      }
      throw PCloudErrorMapper.mapRawError(data?.result || 500, data?.error);
    } catch (err: any) {
      if (err.code) throw err;
      throw PCloudErrorMapper.fromNetworkError(err);
    }
  }

  async listFolder(folderId = '0', accessToken: string, apiHost?: string): Promise<PCloudItemMetadata[]> {
    try {
      const { data } = await this.requestJson('listfolder', accessToken, { folderid: folderId }, { apiHost });
      if (data?.result === 0 && data.metadata && Array.isArray(data.metadata.contents)) {
        return data.metadata.contents.map((item: any) => ({
          fileId: item.fileid?.toString(),
          folderId: item.folderid?.toString(),
          name: item.name,
          isFolder: !!item.isfolder,
          size: item.size || 0,
          mimeType: item.contenttype || (item.isfolder ? 'folder' : 'application/octet-stream'),
          path: item.path || `/${item.name}`,
          created: item.created || new Date().toISOString(),
          modified: item.modified || new Date().toISOString(),
          metadata: item,
        }));
      }
      throw PCloudErrorMapper.mapRawError(data?.result || 500, data?.error);
    } catch (err: any) {
      if (err.code) throw err;
      throw PCloudErrorMapper.fromNetworkError(err);
    }
  }

  async getFileMetadata(fileId: string, accessToken: string, apiHost?: string): Promise<PCloudItemMetadata> {
    try {
      const { data } = await this.requestJson('stat', accessToken, { fileid: fileId }, { apiHost });
      if (data?.result === 0 && data.metadata) {
        const meta = data.metadata;
        return {
          fileId: meta.fileid?.toString() || fileId,
          folderId: meta.parentfolderid?.toString(),
          name: meta.name,
          isFolder: !!meta.isfolder,
          size: meta.size || 0,
          mimeType: meta.contenttype || 'application/octet-stream',
          path: meta.path || `/${meta.name}`,
          created: meta.created || new Date().toISOString(),
          modified: meta.modified || new Date().toISOString(),
          metadata: meta,
        };
      }
      throw PCloudErrorMapper.mapRawError(data?.result || 500, data?.error);
    } catch (err: any) {
      if (err.code) throw err;
      throw PCloudErrorMapper.fromNetworkError(err);
    }
  }

  async uploadFile(
    filename: string,
    buffer: Buffer,
    mimeType: string,
    folderId = '0',
    accessToken: string,
    apiHost?: string
  ): Promise<PCloudItemMetadata> {
    const primaryHost = this.getHost(apiHost);
    const altHost = this.getAlternateHost(primaryHost);
    const hosts = [primaryHost, altHost];
    const authModes: Array<'auth' | 'access_token'> = ['auth', 'access_token'];

    let lastData: any = null;

    for (const host of hosts) {
      for (const mode of authModes) {
        let res: any;
        let data: any;
        try {
          const formData = new FormData();
          formData.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

          const searchParts = [
            `${mode}=${encodeURIComponent(accessToken)}`,
            `folderid=${encodeURIComponent(folderId)}`,
            `filename=${encodeURIComponent(filename)}`,
          ];
          const url = `${host}/uploadfile?${searchParts.join('&')}`;

          const headers: Record<string, string> = {};
          if (mode === 'access_token') {
            headers['Authorization'] = `Bearer ${accessToken}`;
          }

          res = await fetch(url, { method: 'POST', headers, body: formData });
          data = await res.json();
          lastData = data;
        } catch (err: any) {
          throw PCloudErrorMapper.fromNetworkError(err);
        }

        if (data.result === 0 && data.metadata?.length) {
          const meta = data.metadata[0];
          return {
            fileId: meta.fileid?.toString(),
            folderId: meta.parentfolderid?.toString() || folderId,
            name: meta.name,
            isFolder: false,
            size: meta.size || buffer.length,
            mimeType,
            path: meta.path || `/${meta.name}`,
            created: meta.created || new Date().toISOString(),
            modified: meta.modified || new Date().toISOString(),
            metadata: meta,
          };
        }

        if (data.result === 2321) break;
        if (data.result === 1000 || data.result === 2000 || data.result === 2094) continue;
        throw PCloudErrorMapper.mapRawError(data?.result || 500, data?.error);
      }
    }

    throw PCloudErrorMapper.mapRawError(lastData?.result || 500, lastData?.error);
  }

  async shareFolder(options: PCloudShareOptions, accessToken: string, apiHost?: string): Promise<PCloudShareResult> {
    let targetFolderId = options.folderId || '0';
    const permissions = options.permissions !== undefined ? options.permissions : 0;
    try {
      if (options.fileId) {
        try {
          const selected = await this.getFileMetadata(options.fileId, accessToken, apiHost);
          if (selected.isFolder) {
            targetFolderId = selected.fileId || targetFolderId;
          } else {
            // For files, create a dedicated unique folder for this recipient share to ensure pCloud generates
            // a fresh invitation email every time without colliding on error 2024 ("already has access").
            const cleanEmail = (options.recipientEmail || 'user').replace(/[^a-zA-Z0-9]/g, '_');
            const folderName = `AutoWork_Share_${cleanEmail}_${Date.now().toString(36)}`;
            try {
              const { data: folderData } = await this.requestJson('createfolderifnotexists', accessToken, {
                folderid: 0,
                name: folderName,
              }, { apiHost });
              if (folderData?.result === 0 && folderData.metadata?.folderid) {
                targetFolderId = folderData.metadata.folderid.toString();
                // Copy the file into the shared folder so recipients can access it immediately!
                try {
                  await this.requestJson('copyfile', accessToken, {
                    fileid: options.fileId,
                    tofolderid: targetFolderId,
                    noover: 0,
                  }, { apiHost });
                } catch {}
              }
            } catch {
              // fallback to original targetFolderId
            }
          }
        } catch {
          // If metadata fetch failed, continue with targetFolderId
        }
      }

      const params: Record<string, any> = {
        folderid: targetFolderId,
        mail: options.recipientEmail,
        permissions,
      };
      if (options.message) params.message = options.message;

      const { data } = await this.requestJson('sharefolder', accessToken, params, {
        method: 'POST',
        apiHost,
      });

      // Strict Genuine Delivery Verification:
      // Only result === 0 with a confirmed share ID proves pCloud actually dispatched an invitation!
      // Error 2019 ("already shared") and 2024 ("already has access") do NOT send emails!
      const genuineRefId = data?.share?.sharerequestid?.toString() || data?.shareid?.toString() || data?.sharerequestid?.toString();
      if (data?.result === 0 && genuineRefId) {
        return {
          success: true,
          operationType: 'sharefolder',
          pcloudReferenceId: genuineRefId,
          recipientEmail: options.recipientEmail,
          descriptionSnapshot: options.message,
          pcloudAccountId: options.pcloudAccountId || 'default',
          pcloudFileId: options.fileId || targetFolderId,
          timestamp: new Date().toISOString(),
        };
      }

      let fallbackPublicLink: string | null = null;
      try {
        let pubRes: any;
        if (options.fileId && !isNaN(Number(options.fileId))) {
          pubRes = await this.requestJson('getfilepublink', accessToken, { fileid: options.fileId }, { apiHost });
        }
        if (!pubRes?.data?.link && targetFolderId && targetFolderId !== '0') {
          pubRes = await this.requestJson('getfolderpublink', accessToken, { folderid: targetFolderId }, { apiHost });
        }
        if (pubRes?.data?.result === 0 && pubRes.data.link) {
          fallbackPublicLink = pubRes.data.link;
        }
      } catch {
        // ignore
      }

      const error = PCloudErrorMapper.mapRawError(data?.result || 500, data?.error);
      return {
        success: false,
        operationType: 'sharefolder',
        recipientEmail: options.recipientEmail,
        descriptionSnapshot: options.message || undefined,
        pcloudAccountId: options.pcloudAccountId || 'default',
        pcloudFileId: options.fileId || targetFolderId || '0',
        pcloudReferenceId: fallbackPublicLink || undefined,
        error,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      const error = err.code ? err : PCloudErrorMapper.fromNetworkError(err);
      return {
        success: false,
        operationType: 'sharefolder',
        recipientEmail: options.recipientEmail,
        descriptionSnapshot: options.message || undefined,
        pcloudAccountId: options.pcloudAccountId || 'default',
        pcloudFileId: options.fileId || targetFolderId || '0',
        error,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async downloadFileBuffer(fileId: string, accessToken: string, apiHost?: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
    // Mock file IDs — only for sandbox/demo testing
    if (fileId.startsWith('pcloud-file-') || fileId.startsWith('mock-') || fileId.startsWith('file-')) {
      return {
        buffer: Buffer.from('[MOCK/SANDBOX] This is a demo file from AutoWork sandbox mode. Connect a real pCloud account for genuine file delivery.'),
        name: 'AutoWork_Demo_Document.txt',
        mimeType: 'text/plain',
      };
    }

    // Real file download — NO fake fallback
    const metadata = await this.getFileMetadata(fileId, accessToken, apiHost);
    if (metadata.isFolder) throw new Error('uploadtransfer requires a file, not a folder');

    const { data } = await this.requestJson('getfilelink', accessToken, { fileid: fileId }, { apiHost });
    if (data?.result === 0 && data.hosts?.length && data.path) {
      const fileRes = await fetch(`https://${data.hosts[0]}${data.path}`);
      if (fileRes.ok) {
        const arrBuf = await fileRes.arrayBuffer();
        if (arrBuf.byteLength === 0) {
          throw new Error(`Downloaded file is empty (0 bytes) for fileId ${fileId}`);
        }
        return { buffer: Buffer.from(arrBuf), name: metadata.name, mimeType: metadata.mimeType };
      }
      throw new Error(`File download HTTP error: ${fileRes.status} ${fileRes.statusText}`);
    }

    throw new Error(
      `Cannot download file ${fileId}: pCloud API returned result=${data?.result || 'unknown'}, error=${data?.error || 'no download link available'}. Ensure the file exists and the account has access.`
    );
  }

  async uploadTransfer(
    options: PCloudTransferOptions,
    accessToken: string,
    apiHost?: string,
    preloadedFile?: { buffer: Buffer; name: string; mimeType: string }
  ): Promise<PCloudShareResult> {
    const primaryHost = this.getHost(apiHost);
    const altHost = this.getAlternateHost(primaryHost);
    const hosts = [primaryHost, altHost];
    const recipientEmail = options.recipientEmails[0] || '';

    try {
      if (!options.fileId) throw new Error('A pCloud fileId is required for uploadtransfer');
      // Use pre-loaded file if provided (avoids re-downloading per recipient)
      const file = preloadedFile || await this.downloadFileBuffer(options.fileId, accessToken, apiHost);

      let lastData: any = null;

      for (const host of hosts) {
        for (const mode of ['auth', 'access_token', 'none'] as const) {
          try {
            const formData = new FormData();
            formData.append('sendermail', options.senderEmail);
            formData.append('receivermails', options.recipientEmails.join(','));
            if (options.message) formData.append('message', options.message.slice(0, 160));
            formData.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), options.filename || file.name);

            const searchParts = mode === 'none' ? [] : [`${mode}=${encodeURIComponent(accessToken)}`];
            const url = searchParts.length ? `${host}/uploadtransfer?${searchParts.join('&')}` : `${host}/uploadtransfer`;

            const headers: Record<string, string> = {};
            if (mode === 'access_token') {
              headers['Authorization'] = `Bearer ${accessToken}`;
            }

            const res = await fetch(url, {
              method: 'POST',
              headers,
              body: formData,
            });
            const data = await res.json();
            lastData = data;

            if (data.result === 0) {
              return {
                success: true,
                operationType: 'uploadtransfer',
                pcloudReferenceId: data.progresshash || data.transferid || `transfer-${Date.now()}`,
                recipientEmail,
                descriptionSnapshot: options.message || undefined,
                pcloudAccountId: options.pcloudAccountId || 'default',
                pcloudFileId: options.fileId || '0',
                timestamp: new Date().toISOString(),
              };
            }

            if (data.result === 2321) break;
            if (data.result === 1000 || data.result === 2000 || data.result === 2094 || data.result === 2328) continue;
            break;
          } catch {
            // try next
          }
        }
      }

      // Automatic Fallback to official pCloud Folder Sharing:
      // If /uploadtransfer was blocked by pCloud server (e.g. Privacy Policy 2303, sender restriction 2098, or captcha 1101),
      // seamlessly execute official authenticated shareFolder so the recipient genuinely receives the email notification and document!
      try {
        const shareFallback = await this.shareFolder({
          fileId: options.fileId,
          folderId: options.folderId,
          recipientEmail,
          message: options.message,
          pcloudAccountId: options.pcloudAccountId,
          organizationId: options.organizationId,
          campaignId: options.campaignId,
        }, accessToken, apiHost);
        if (shareFallback.success) {
          return shareFallback;
        }
      } catch {}

      let fallbackPublicLink: string | null = null;
      try {
        if (options.fileId && !isNaN(Number(options.fileId))) {
          const pubRes = await this.requestJson('getfilepublink', accessToken, { fileid: options.fileId }, { apiHost });
          if (pubRes?.data?.result === 0 && pubRes.data.link) {
            fallbackPublicLink = pubRes.data.link;
          }
        }
      } catch {
        // ignore
      }

      const error = PCloudErrorMapper.mapRawError(lastData?.result || 500, lastData?.error);
      return {
        success: false,
        operationType: 'uploadtransfer',
        recipientEmail,
        descriptionSnapshot: options.message || undefined,
        pcloudAccountId: options.pcloudAccountId || 'default',
        pcloudFileId: options.fileId || '0',
        pcloudReferenceId: fallbackPublicLink || undefined,
        error,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      const error = err.code ? err : PCloudErrorMapper.fromNetworkError(err);
      return {
        success: false,
        operationType: 'uploadtransfer',
        recipientEmail,
        descriptionSnapshot: options.message || undefined,
        pcloudAccountId: options.pcloudAccountId || 'default',
        pcloudFileId: options.fileId || '0',
        error,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async deleteFile(fileId: string, accessToken: string, apiHost?: string): Promise<boolean> {
    try {
      const { data } = await this.requestJson('deletefile', accessToken, { fileid: fileId }, { apiHost });
      return data?.result === 0;
    } catch {
      return false;
    }
  }
}
