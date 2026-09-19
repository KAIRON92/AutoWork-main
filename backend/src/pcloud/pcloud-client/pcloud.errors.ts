import { PCloudError, PCloudErrorCode } from '../pcloud.interface';

export class PCloudErrorMapper {
  static mapRawError(rawResult: number, rawErrorMsg?: string): PCloudError {
    const msg = rawErrorMsg || 'Unknown pCloud API Error';

    switch (rawResult) {
      case 1000:
      case 2000:
        return { code: PCloudErrorCode.PCLOUD_AUTH_FAILED, rawCode: rawResult, message: `pCloud Authentication Failed: ${msg}`, isTransient: false, timestamp: new Date().toISOString() };
      case 2003:
      case 2016:
      case 2076:
        return { code: PCloudErrorCode.PCLOUD_PERMISSION_DENIED, rawCode: rawResult, message: `pCloud Permission Denied (${rawResult}): ${msg}. The file/folder sharing fallback will generate a public link instead.`, isTransient: false, timestamp: new Date().toISOString() };
      case 2005:
      case 2009:
        return { code: PCloudErrorCode.PCLOUD_FILE_NOT_FOUND, rawCode: rawResult, message: `pCloud File or Folder Not Found: ${msg}`, isTransient: false, timestamp: new Date().toISOString() };
      case 2010:
      case 2018:
        return { code: PCloudErrorCode.PCLOUD_INVALID_RECIPIENT, rawCode: rawResult, message: `pCloud Invalid Recipient Email: ${msg}`, isTransient: false, timestamp: new Date().toISOString() };
      case 2019:
      case 2024:
        return { code: PCloudErrorCode.PCLOUD_SHARE_EXISTS, rawCode: rawResult, message: `pCloud Share Already Exists: ${msg}`, isTransient: false, timestamp: new Date().toISOString() };
      case 2004:
      case 2097:
        return { code: PCloudErrorCode.PCLOUD_QUOTA_EXCEEDED, rawCode: rawResult, message: `pCloud Transfer/Storage Quota Exceeded: ${msg}`, isTransient: false, timestamp: new Date().toISOString() };
      case 2014:
        return { code: PCloudErrorCode.PCLOUD_VERIFICATION_REQUIRED, rawCode: rawResult, message: `pCloud Verification Required: ${msg}`, isTransient: false, timestamp: new Date().toISOString() };
      case 2088:
        return { code: PCloudErrorCode.PCLOUD_FILE_SHARE_UNSUPPORTED, rawCode: rawResult, message: `pCloud transfer requires an uploaded file payload: ${msg}`, isTransient: false, timestamp: new Date().toISOString() };
      case 2303:
        return { code: PCloudErrorCode.PCLOUD_PERMISSION_DENIED, rawCode: rawResult, message: `pCloud Privacy Policy restriction (${rawResult}): ${msg}. Will fallback to public link delivery.`, isTransient: false, timestamp: new Date().toISOString() };
      case 2321:
        return { code: PCloudErrorCode.PCLOUD_WRONG_REGION, rawCode: rawResult, message: `pCloud wrong region — the API host does not match this account's data location. Re-discover the correct host: ${msg}`, isTransient: true, timestamp: new Date().toISOString() };
      case 4000:
        return { code: PCloudErrorCode.PCLOUD_RATE_LIMITED, rawCode: rawResult, message: `pCloud Rate Limit Exceeded: ${msg}`, isTransient: true, timestamp: new Date().toISOString() };
      case 2041:
      case 5000:
      case 5001:
      case 500:
      case 502:
      case 503:
      case 504:
        return { code: PCloudErrorCode.PCLOUD_TEMPORARY_ERROR, rawCode: rawResult, message: `pCloud Temporary/Transfer Error: ${msg}`, isTransient: true, timestamp: new Date().toISOString() };
      default:
        return { code: PCloudErrorCode.PCLOUD_UNKNOWN_ERROR, rawCode: rawResult, message: `pCloud Unknown Error (${rawResult}): ${msg}`, isTransient: false, timestamp: new Date().toISOString() };
    }
  }

  static fromNetworkError(err: Error): PCloudError {
    return {
      code: PCloudErrorCode.PCLOUD_TEMPORARY_ERROR,
      message: `Network Error contacting pCloud API: ${err.message}`,
      isTransient: true,
      timestamp: new Date().toISOString(),
    };
  }
}
