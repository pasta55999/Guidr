// Presentational only: plain props, no Convex, no data fetching.
// Progress is owned by Convex; this component just renders what it is handed.

import "./ui.css";

export interface StepTrackerProps {
  stepIndex: number;
  totalSteps: number;
  stepTitleEn: string;
  stepTitleAr: string;
  lessonCompleted?: boolean;
}

export function StepTracker({
  stepIndex,
  totalSteps,
  stepTitleEn,
  stepTitleAr,
  lessonCompleted = false,
}: StepTrackerProps) {
  const done = lessonCompleted ? totalSteps : Math.min(stepIndex, totalSteps);
  const pct = totalSteps > 0 ? (done / totalSteps) * 100 : 0;

  return (
    <div className="ui-steps">
      <div className="ui-steps-head">
        <span className="ui-steps-count">
          {lessonCompleted
            ? "Lesson complete"
            : `Step ${Math.min(stepIndex + 1, totalSteps)} of ${totalSteps}`}
        </span>
        {lessonCompleted && <span className="ui-steps-done">✓</span>}
      </div>

      <div className="ui-steps-title">{stepTitleEn}</div>
      <div className="ui-steps-title-ar" lang="ar" dir="rtl">
        {stepTitleAr}
      </div>

      <div
        className="ui-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalSteps}
        aria-valuenow={done}
      >
        <span className="ui-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="ui-steps-dots" aria-hidden="true">
        {Array.from({ length: totalSteps }, (_, i) => (
          <span
            key={i}
            className={`ui-dot${i < done ? " is-done" : ""}${
              !lessonCompleted && i === stepIndex ? " is-current" : ""
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default StepTracker;
