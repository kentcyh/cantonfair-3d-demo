/** Wash → dry → fold. Durations are booth-length, not a real cycle. */
export const WASH_END_SECONDS = 3;
export const DRY_END_SECONDS = 6;
export const FOLD_END_SECONDS = 9.2;

const IDLE_PHASE = { step: 0, wash: 0, dry: 0, fold: 0 };

function bellEnvelope(time, start, end) {
  const span = end - start;
  if (span <= 0) return 0;
  const unit = (time - start) / span;
  if (unit <= 0 || unit >= 1) return 0;
  return Math.sin(unit * Math.PI);
}

export function phaseFromTime(time) {
  if (time <= 0) return IDLE_PHASE;
  if (time < WASH_END_SECONDS) {
    return {
      step: 1,
      wash: bellEnvelope(time, 0, WASH_END_SECONDS),
      dry: 0,
      fold: 0,
    };
  }
  if (time < DRY_END_SECONDS) {
    return {
      step: 2,
      wash: 0,
      dry: bellEnvelope(time, WASH_END_SECONDS, DRY_END_SECONDS),
      fold: 0,
    };
  }
  const foldSpan = FOLD_END_SECONDS - DRY_END_SECONDS;
  const fold = Math.min(1, Math.max(0, (time - DRY_END_SECONDS) / foldSpan));
  return { step: 3, wash: 0, dry: 0, fold };
}

/** Chips highlight only while the sequence is running. */
export function chipStep(playing, time) {
  if (!playing) return 0;
  return phaseFromTime(time).step;
}
