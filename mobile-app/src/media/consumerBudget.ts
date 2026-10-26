import type { ActiveProducer } from '../protocol/types';

export const MAX_RESUMED_CONSUMERS = 32;

export type ConsumerPriorityContext = {
  talkTargetKey?: string | null;
  lockedTargetKey?: string | null;
};

export type BudgetDecision = {
  resume: ActiveProducer[];
  pause: ActiveProducer[];
  overBudget: boolean;
};

function producerKey(producer: ActiveProducer): string {
  switch (producer.route.kind) {
    case 'conference':
      return `conference-${producer.route.id}`;
    case 'feed':
      return `feed-${producer.route.id}`;
    case 'directUser':
      return `user-${producer.speakerUserId ?? producer.peerId}`;
    case 'guest':
      return `guest-${producer.route.id}`;
    default:
      return `${producer.peerId}-${producer.producerId}`;
  }
}

function rank(producer: ActiveProducer, ctx: ConsumerPriorityContext): number {
  const key = producerKey(producer);
  if (ctx.talkTargetKey && key === ctx.talkTargetKey) {
    return 0;
  }
  if (ctx.lockedTargetKey && key === ctx.lockedTargetKey) {
    return 1;
  }
  if (producer.route.kind === 'directUser' || producer.route.kind === 'talk') {
    return 2;
  }
  if (producer.route.kind === 'conference') {
    return 3;
  }
  if (producer.route.kind === 'feed') {
    return 4;
  }
  return 5;
}

export function applyConsumerBudget(
  producers: ActiveProducer[],
  ctx: ConsumerPriorityContext = {},
  limit = MAX_RESUMED_CONSUMERS,
): BudgetDecision {
  const unique = new Map<string, ActiveProducer>();
  for (const producer of producers) {
    unique.set(producer.producerId, producer);
  }
  const items = [...unique.values()].sort((a, b) => rank(a, ctx) - rank(b, ctx));
  return {
    resume: items.slice(0, limit),
    pause: items.slice(limit),
    overBudget: items.length > limit,
  };
}

export function producerDeliverySignature(producer: ActiveProducer): string {
  const appData = producer.appData ?? {};
  const type = typeof appData.type === 'string' && appData.type ? appData.type : producer.route.kind;
  const id = appData.id ?? producerTargetKey(producer);
  const targetPeer = typeof appData.targetPeer === 'string' ? appData.targetPeer : '';
  return `${type}:${String(id)}:${targetPeer}`;
}

export function shouldReplaceRemoteConsumer(
  existing: { producer: ActiveProducer; closed?: boolean },
  next: ActiveProducer,
): boolean {
  if (existing.closed) {
    return true;
  }
  return producerDeliverySignature(existing.producer) !== producerDeliverySignature(next);
}

export function producerTargetKey(producer: ActiveProducer): string {
  return producerKey(producer);
}

