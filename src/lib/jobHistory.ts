import type { Job } from './types';

export function jobRelation(job: Job, currentHash: string) {
  if ((job.options.source_document_hash || job.document_hash) === currentHash)
    return 'current';
  if (job.application?.document_hash === currentHash) return 'applied';
  return 'other';
}

export function requesterName(
  job: { requester?: Job['requester']; requested_by?: string },
  userId?: string,
) {
  const actor = job.requester;
  return actor
    ? `${actor.display_name}${actor.id === userId ? ' (나)' : ''}`
    : job.requested_by === userId && userId
      ? '나'
      : '요청자 정보 없음';
}
