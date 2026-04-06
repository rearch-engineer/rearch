import { useState, useEffect, useCallback } from "react";

// ============================================
// Types
// ============================================

interface CourseProgress {
  currentLesson: string;
  completedLessons: string[];
  lastAccessed: string;
}

interface LearningData {
  courses: Record<string, CourseProgress>;
}

interface LearningProgressProps {
  courseSlug: string;
  lessonSlug: string;
  totalLessons: number;
  lessonOrder: number;
  nextLessonSlug?: string;
  nextLessonTitle?: string;
  prevLessonSlug?: string;
  prevLessonTitle?: string;
  courseTitle: string;
  basePath?: string;
}

// ============================================
// localStorage helpers
// ============================================

const STORAGE_KEY = "rearch-learning-progress";

function loadProgress(): LearningData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted data — reset
  }
  return { courses: {} };
}

function saveProgress(data: LearningData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable
  }
}

// ============================================
// Component
// ============================================

export default function LearningProgress({
  courseSlug,
  lessonSlug,
  totalLessons,
  lessonOrder,
  nextLessonSlug,
  nextLessonTitle,
  prevLessonSlug,
  prevLessonTitle,
  courseTitle,
  basePath = "/docs/learning",
}: LearningProgressProps) {
  const [progress, setProgress] = useState<LearningData>({ courses: {} });
  const [loaded, setLoaded] = useState(false);

  // Load on mount
  useEffect(() => {
    const data = loadProgress();
    // Track that user is on this lesson
    if (!data.courses[courseSlug]) {
      data.courses[courseSlug] = {
        currentLesson: lessonSlug,
        completedLessons: [],
        lastAccessed: new Date().toISOString(),
      };
    } else {
      data.courses[courseSlug].currentLesson = lessonSlug;
      data.courses[courseSlug].lastAccessed = new Date().toISOString();
    }
    saveProgress(data);
    setProgress(data);
    setLoaded(true);
  }, [courseSlug, lessonSlug]);

  const courseData = progress.courses[courseSlug];
  const isCompleted =
    courseData?.completedLessons?.includes(lessonSlug) ?? false;
  const completedCount = courseData?.completedLessons?.length ?? 0;
  const progressPercent =
    totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const markComplete = useCallback(() => {
    const data = loadProgress();
    if (!data.courses[courseSlug]) {
      data.courses[courseSlug] = {
        currentLesson: lessonSlug,
        completedLessons: [],
        lastAccessed: new Date().toISOString(),
      };
    }
    const course = data.courses[courseSlug];
    if (!course.completedLessons.includes(lessonSlug)) {
      course.completedLessons.push(lessonSlug);
    }
    course.lastAccessed = new Date().toISOString();
    saveProgress(data);
    setProgress({ ...data });
  }, [courseSlug, lessonSlug]);

  const markIncomplete = useCallback(() => {
    const data = loadProgress();
    if (data.courses[courseSlug]) {
      data.courses[courseSlug].completedLessons = data.courses[
        courseSlug
      ].completedLessons.filter((s) => s !== lessonSlug);
      data.courses[courseSlug].lastAccessed = new Date().toISOString();
      saveProgress(data);
      setProgress({ ...data });
    }
  }, [courseSlug, lessonSlug]);

  if (!loaded) return null;

  return (
    <div className="lesson-progress">
      {/* Header: progress info */}
      <div className="lesson-progress-header">
        <span>
          {courseTitle} — Lesson {lessonOrder} of {totalLessons}
        </span>
        <span style={{ fontWeight: 400, color: "var(--sl-color-gray-3)" }}>
          {completedCount} of {totalLessons} completed ({progressPercent}%)
        </span>
      </div>

      {/* Progress bar */}
      <div className="learning-progress-bar">
        <div
          className="learning-progress-bar-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Actions */}
      <div className="lesson-progress-actions" style={{ marginTop: "1rem" }}>
        {/* Prev lesson */}
        {prevLessonSlug && (
          <a
            href={`${basePath}/${courseSlug}/${prevLessonSlug}/`}
            className="learning-btn learning-btn-ghost"
          >
            &larr; {prevLessonTitle || "Previous"}
          </a>
        )}

        {/* Mark complete / completed */}
        {isCompleted ? (
          <span
            className="lesson-completed-badge"
            style={{ cursor: "pointer" }}
            onClick={markIncomplete}
            title="Click to mark as incomplete"
          >
            &#10003; Completed
          </span>
        ) : (
          <button
            className="learning-btn learning-btn-success"
            onClick={markComplete}
          >
            &#10003; Mark as Complete
          </button>
        )}

        {/* Next lesson */}
        {nextLessonSlug ? (
          <a
            href={`${basePath}/${courseSlug}/${nextLessonSlug}/`}
            className="learning-btn learning-btn-primary"
          >
            {nextLessonTitle || "Next"} &rarr;
          </a>
        ) : (
          <a
            href={`${basePath}/${courseSlug}/`}
            className="learning-btn learning-btn-secondary"
          >
            Back to Course Overview
          </a>
        )}
      </div>
    </div>
  );
}
