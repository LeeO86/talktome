import type { ActiveProducer } from '../protocol/types';

export const MAX_RESUMED_CONSUMERS = 8;

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

export function producerTargetKey(producer: ActiveProducer): string {
  return producerKey(producer);
}
