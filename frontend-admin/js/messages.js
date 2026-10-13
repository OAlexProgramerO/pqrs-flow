import { AdminApiError } from './admin-api.js';
import { describeWait } from '/js/status.js';

/**
 * The text to show for a failed request. After a 429 it adds how long to wait, when the server
 * said so.
 */
export function describeFailure(error) {
  if (error instanceof AdminApiError && error.status === 429) {
    const wait = describeWait(error.retryAfter);
    return wait ? `${error.message} You can try again in ${wait}.` : error.message;
  }
  return error.message;
}
