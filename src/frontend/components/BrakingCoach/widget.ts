import { lazyWidget } from '@irdashies/domain/lazyWidget';
import type { WidgetModule } from '@irdashies/domain';

export default {
  id: 'brakingcoach',
  component: lazyWidget(() =>
    import('./').then((module) => ({ default: module.BrakingCoach }))
  ),
} satisfies WidgetModule;
