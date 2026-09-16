import type { Firestore } from '../../data/types';
import type { Nickname, Round } from '../../domain/types';

export interface PhaseProps {
  readonly db: Firestore;
  readonly roundId: string;
  readonly uid: string;
  readonly round: Round;
  readonly nickname: Nickname;
}
