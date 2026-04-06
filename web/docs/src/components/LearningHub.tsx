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

interface Course {
  slug: string;
  title: string;
  description: string;
  lessonCount: number;
  lessonSlugs: string[];
}

interface LearningHubProps {
  courses: Course[];
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

export default function LearningHub({
  courses,
  basePath = "/docs/learning",
}: LearningHubProps) {
  const [progress, setProgress] = useState<LearningData>({ courses: {} });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProgress(loadProgress());
    setLoaded(true);
  }, []);

  const enroll = useCallback(
    (courseSlug: string, firstLessonSlug: string) => {
      const data = loadProgress();
      if (!data.courses[courseSlug]) {
        data.courses[courseSlug] = {
          currentLesson: firstLessonSlug,
          completedLessons: [],
          lastAccessed: new Date().toISOString(),
        };
        saveProgress(data);
        setProgress({ ...data });
      }
      window.location.href = `${basePath}/${courseSlug}/${firstLessonSlug}/`;
    },
    [basePath],
  );

  if (!loaded) return null;

  const enrolledCourses = courses.filter(
    (c) => !!progress.courses[c.slug],
  );
  const hasEnrolled = enrolledCourses.length > 0;

  return (
    <div>
      {/* Enrolled courses section */}
      {hasEnrolled && (
        <div className="hub-enrolled-section">
          <h3 className="hub-section-title">My Courses</h3>
          <div className="hub-enrolled-list">
            {enrolledCourses.map((course) => {
              const courseData = progress.courses[course.slug];
              const completedCount =
                courseData?.completedLessons?.length ?? 0;
              const total = course.lessonCount;
              const percent =
                total > 0
                  ? Math.round((completedCount / total) * 100)
                  : 0;
              const allDone = completedCount === total && total > 0;
              const nextLesson = course.lessonSlugs.find(
                (s) => !courseData.completedLessons.includes(s),
              );

              return (
                <div key={course.slug} className="hub-enrolled-item">
                  <div className="hub-enrolled-info">
                    <a
                      href={`${basePath}/${course.slug}/`}
                      className="hub-enrolled-title"
                    >
                      {course.title}
                    </a>
                    <div className="hub-enrolled-meta">
                      {completedCount}/{total} lessons
                      {allDone && (
                        <span className="lesson-completed-badge">
                          &#10003; Complete
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="hub-enrolled-right">
                    <div className="learning-progress-bar" style={{ width: "120px" }}>
                      <div
                        className="learning-progress-bar-fill"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    {!allDone && nextLesson ? (
                      <a
                        href={`${basePath}/${course.slug}/${nextLesson}/`}
                        className="learning-btn learning-btn-primary learning-btn-sm"
                      >
                        Continue
                      </a>
                    ) : allDone ? (
                      <a
                        href={`${basePath}/${course.slug}/${course.lessonSlugs[0]}/`}
                        className="learning-btn learning-btn-secondary learning-btn-sm"
                      >
                        Review
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All courses grid */}
      <h3 className="hub-section-title">
        {hasEnrolled ? "All Courses" : "Courses"}
      </h3>
      <div className="hub-grid">
        {courses.map((course) => {
          const isEnrolled = !!progress.courses[course.slug];
          const courseData = progress.courses[course.slug];
          const completedCount =
            courseData?.completedLessons?.length ?? 0;
          const total = course.lessonCount;
          const percent =
            total > 0
              ? Math.round((completedCount / total) * 100)
              : 0;

          return (
            <div key={course.slug} className="hub-card">
              <div className="hub-card-body">
                <h4 className="hub-card-title">{course.title}</h4>
                <p className="hub-card-desc">{course.description}</p>
              </div>
              <div className="hub-card-footer">
                <span className="hub-card-meta">
                  {total} lesson{total !== 1 ? "s" : ""}
                </span>
                {isEnrolled ? (
                  <div className="hub-card-enrolled-info">
                    <div
                      className="learning-progress-bar"
                      style={{ width: "80px" }}
                    >
                      <div
                        className="learning-progress-bar-fill"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <a
                      href={`${basePath}/${course.slug}/`}
                      className="learning-btn learning-btn-secondary learning-btn-sm"
                    >
                      Open
                    </a>
                  </div>
                ) : total > 0 ? (
                  <button
                    className="learning-btn learning-btn-primary learning-btn-sm"
                    onClick={() =>
                      enroll(course.slug, course.lessonSlugs[0])
                    }
                  >
                    Enroll
                  </button>
                ) : (
                  <span className="hub-card-coming-soon">Coming soon</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
