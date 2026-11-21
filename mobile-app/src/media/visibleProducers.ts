import { producerTargetKey } from './consumerBudget';
import { talkTargetIdentity, type ActiveProducer, type TalkTarget } from '../protocol';

/**
 * Hear what the current production grid shows, like the web client.
 * Direct user/guest talk is still accepted: the server already scoped it to us.
 * Feeds and conferences must appear on this production's target list.
 *
 * Phone, Watch, and BLE all share MediaEngine, so this filter
 * applies to every listen path.
 */
export function producerMatchesVisibleTargets(
  producer: ActiveProducer,
  targets: readonly TalkTarget[],
): boolean {
  if (producer.route.kind === 'directUser' || producer.route.kind === 'talk' || producer.route.kind === 'guest') {
    return true;
  }
  const key = producerTargetKey(producer);
  return targets.some((target) => talkTargetIdentity(target) === key);
}

export function filterProducersToVisibleTargets(
  producers: readonly ActiveProducer[],
  targets: readonly TalkTarget[],
): ActiveProducer[] {
  return producers.filter((producer) => producerMatchesVisibleTargets(producer, targets));
}
