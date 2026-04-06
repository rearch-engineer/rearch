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

interface Lesson {
  slug: string;
  title: string;
}

interface CourseOverviewProps {
  courseSlug: string;
  courseTitle: string;
  lessons: Lesson[];
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
    // corrupted — reset
  }
  return { courses: {} };
}

function saveProgress(data: LearningData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable
  }
}

// ============================================
// Component
// ============================================

export default function CourseOverview({
  courseSlug,
  courseTitle,
  lessons,
  basePath = "/docs/learning",
}: CourseOverviewProps) {
  const [progress, setProgress] = useState<LearningData>({ courses: {} });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProgress(loadProgress());
    setLoaded(true);
  }, []);

  const courseData = progress.courses[courseSlug];
  const completedLessons = courseData?.completedLessons ?? [];
  const completedCount = completedLessons.length;
  const totalLessons = lessons.length;
  const progressPercent =
    totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const isEnrolled = !!courseData;
  const allComplete = completedCount === totalLessons && totalLessons > 0;

  // Find the first incomplete lesson for "Continue" / "Start"
  const nextLesson = lessons.find((l) => !completedLessons.includes(l.slug));
  const currentLessonSlug = courseData?.currentLesson;

  const startCourse = useCallback(() => {
    const data = loadProgress();
    if (!data.courses[courseSlug]) {
      data.courses[courseSlug] = {
        currentLesson: lessons[0]?.slug ?? "",
        completedLessons: [],
        lastAccessed: new Date().toISOString(),
      };
      saveProgress(data);
      setProgress({ ...data });
    }
    // Navigate to first lesson
    window.location.href = `${basePath}/${courseSlug}/${lessons[0]?.slug}/`;
  }, [courseSlug, lessons, basePath]);

  const continueCourse = useCallback(() => {
    const target = nextLesson?.slug ?? currentLessonSlug ?? lessons[0]?.slug;
    if (target) {
      window.location.href = `${basePath}/${courseSlug}/${target}/`;
    }
  }, [courseSlug, nextLesson, currentLessonSlug, lessons, basePath]);

  const resetCourse = useCallback(() => {
    const data = loadProgress();
    delete data.courses[courseSlug];
    saveProgress(data);
    setProgress({ ...data });
  }, [courseSlug]);

  if (!loaded) return null;

  return (
    <div className="course-overview">
      {/* Header */}
      <div className="course-overview-header">
        <div>
          <div className="course-overview-stats">
            <span className="course-overview-stat">
              {totalLessons} lesson{totalLessons !== 1 ? "s" : ""}
            </span>
            {isEnrolled && (
              <span className="course-overview-stat">
                {completedCount} completed
              </span>
            )}
            {allComplete && (
              <span className="lesson-completed-badge">
                &#10003; Course Complete
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {!isEnrolled ? (
            <button
              className="learning-btn learning-btn-primary"
              onClick={startCourse}
            >
              Start Course
            </button>
          ) : allComplete ? (
            <>
              <button
                className="learning-btn learning-btn-ghost"
                onClick={resetCourse}
              >
                Reset Progress
              </button>
              <a
                href={`${basePath}/${courseSlug}/${lessons[0]?.slug}/`}
                className="learning-btn learning-btn-secondary"
              >
                Review Course
              </a>
            </>
          ) : (
            <>
              <button
                className="learning-btn learning-btn-ghost"
                onClick={resetCourse}
              >
                Reset
              </button>
              <button
                className="learning-btn learning-btn-primary"
                onClick={continueCourse}
              >
                Continue Course
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isEnrolled && (
        <div style={{ marginBottom: "1rem" }}>
          <div className="learning-progress-bar">
            <div
              className="learning-progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div
            style={{
              fontSize: "0.8rem",
              color: "var(--sl-color-gray-3)",
              marginTop: "0.35rem",
            }}
          >
            {progressPercent}% complete
          </div>
        </div>
      )}

      {/* Lesson list */}
      <ul className="lesson-list">
        {lessons.map((lesson, i) => {
          const done = completedLessons.includes(lesson.slug);
          return (
            <li key={lesson.slug}>
              <span className={`lesson-check ${done ? "completed" : ""}`}>
                {done ? "✓" : ""}
              </span>
              <a
                href={`${basePath}/${courseSlug}/${lesson.slug}/`}
                style={{
                  color: done
                    ? "var(--sl-color-gray-3)"
                    : "var(--sl-color-white)",
                  textDecoration: done ? "line-through" : "none",
                }}
              >
                {i + 1}. {lesson.title}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
