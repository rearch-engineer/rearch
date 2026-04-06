import React, { useState, useCallback } from "react";
import {
  Card,
  Typography,
  Chip,
  Box,
  Button,
  Checkbox,
  Radio,
  RadioGroup,
  Input,
  Divider,
  Alert,
  Sheet,
} from "@mui/joy";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";

/**
 * QuestionDisplay renders an inline question form for OpenCode agent questions.
 *
 * Props:
 * - questionData: { requestId, questions, status?, answers?, tool? }
 *     questions: Array<{ question, header, options: [{label, description}], multiple?, custom? }>
 *     status: "pending" | "answered" | "rejected" (for historical rendering)
 *     answers: Array<Array<string>> (for historical rendering)
 * - onSubmit: (requestId, answers) => void  (called when user submits)
 * - onReject: (requestId) => void  (called when user dismisses)
 * - disabled: boolean (true while submitting)
 * - readOnly: boolean (true for historical questions that were already answered)
 */
const QuestionDisplay = ({
  questionData,
  onSubmit,
  onReject,
  disabled = false,
  readOnly = false,
}) => {
  const { requestId, questions, status, answers: historicalAnswers } = questionData;

  // Track selected answers for each question: { [questionIndex]: string[] }
  const [selections, setSelections] = useState(() => {
    const initial = {};
    questions.forEach((_, idx) => {
      initial[idx] = [];
    });
    return initial;
  });

  // Track custom text inputs for each question
  const [customTexts, setCustomTexts] = useState(() => {
    const initial = {};
    questions.forEach((_, idx) => {
      initial[idx] = "";
    });
    return initial;
  });

  // Confirmation step: false = editing, true = reviewing before submit
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isAnswered = status === "answered";
  const isRejected = status === "rejected";
  const isResolved = isAnswered || isRejected;

  const handleOptionToggle = useCallback((questionIdx, label, multiple) => {
    setSelections((prev) => {
      const current = prev[questionIdx] || [];
      if (multiple) {
        // Toggle checkbox
        const newSelection = current.includes(label)
          ? current.filter((l) => l !== label)
          : [...current, label];
        return { ...prev, [questionIdx]: newSelection };
      } else {
        // Radio: single select
        return { ...prev, [questionIdx]: [label] };
      }
    });
  }, []);

  const handleCustomTextChange = useCallback((questionIdx, value) => {
    setCustomTexts((prev) => ({ ...prev, [questionIdx]: value }));
  }, []);

  // Build final answers array
  const buildAnswers = useCallback(() => {
    return questions.map((q, idx) => {
      const selected = selections[idx] || [];
      const customText = (customTexts[idx] || "").trim();
      const allowCustom = q.custom !== false; // default true

      if (customText && allowCustom) {
        return [...selected, customText];
      }
      return [...selected];
    });
  }, [questions, selections, customTexts]);

  // Check if at least one answer is provided per question
  const canSubmit = useCallback(() => {
    const answers = buildAnswers();
    return answers.every((a) => a.length > 0);
  }, [buildAnswers]);

  const handleReview = () => {
    setReviewing(true);
  };

  const handleBackToEdit = () => {
    setReviewing(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const answers = buildAnswers();
      await onSubmit(requestId, answers);
    } catch (err) {
      console.error("Failed to submit question answers:", err);
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      await onReject(requestId);
    } catch (err) {
      console.error("Failed to reject question:", err);
      setSubmitting(false);
    }
  };

  // Determine the status chip
  const getStatusChip = () => {
    if (isAnswered) return <Chip size="sm" color="success" variant="soft">Answered</Chip>;
    if (isRejected) return <Chip size="sm" color="neutral" variant="soft">Dismissed</Chip>;
    if (reviewing) return <Chip size="sm" color="warning" variant="soft">Reviewing</Chip>;
    return <Chip size="sm" color="primary" variant="soft">Awaiting Answer</Chip>;
  };

  // Render a single question section (editing mode)
  const renderQuestionForm = (q, idx) => {
    const isMultiple = q.multiple === true;
    const allowCustom = q.custom !== false;

    return (
      <Box key={idx} sx={{ mb: idx < questions.length - 1 ? 2 : 0 }}>
        {questions.length > 1 && (
          <Typography level="title-sm" sx={{ mb: 0.5, color: "text.secondary" }}>
            {q.header}
          </Typography>
        )}
        <Typography level="body-sm" fontWeight="lg" sx={{ mb: 1 }}>
          {q.question}
        </Typography>

        {/* Options */}
        {isMultiple ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {q.options.map((opt) => (
              <Sheet
                key={opt.label}
                variant="outlined"
                sx={{
                  p: 1,
                  borderRadius: "sm",
                  cursor: disabled ? "default" : "pointer",
                  bgcolor: (selections[idx] || []).includes(opt.label)
                    ? "primary.softBg"
                    : "transparent",
                  borderColor: (selections[idx] || []).includes(opt.label)
                    ? "primary.outlinedBorder"
                    : "neutral.outlinedBorder",
                  "&:hover": disabled
                    ? {}
                    : { bgcolor: "neutral.softHoverBg" },
                }}
                onClick={() => !disabled && handleOptionToggle(idx, opt.label, true)}
              >
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                  <Checkbox
                    size="sm"
                    checked={(selections[idx] || []).includes(opt.label)}
                    disabled={disabled}
                    onChange={() => handleOptionToggle(idx, opt.label, true)}
                    sx={{ mt: 0.25 }}
                  />
                  <Box>
                    <Typography level="body-sm" fontWeight="md">
                      {opt.label}
                    </Typography>
                    {opt.description && (
                      <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                        {opt.description}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Sheet>
            ))}
          </Box>
        ) : (
          <RadioGroup
            value={(selections[idx] || [])[0] || ""}
            onChange={(e) => handleOptionToggle(idx, e.target.value, false)}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {q.options.map((opt) => (
                <Sheet
                  key={opt.label}
                  variant="outlined"
                  sx={{
                    p: 1,
                    borderRadius: "sm",
                    cursor: disabled ? "default" : "pointer",
                    bgcolor: (selections[idx] || []).includes(opt.label)
                      ? "primary.softBg"
                      : "transparent",
                    borderColor: (selections[idx] || []).includes(opt.label)
                      ? "primary.outlinedBorder"
                      : "neutral.outlinedBorder",
                    "&:hover": disabled
                      ? {}
                      : { bgcolor: "neutral.softHoverBg" },
                  }}
                  onClick={() => !disabled && handleOptionToggle(idx, opt.label, false)}
                >
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                    <Radio
                      size="sm"
                      value={opt.label}
                      disabled={disabled}
                      sx={{ mt: 0.25 }}
                    />
                    <Box>
                      <Typography level="body-sm" fontWeight="md">
                        {opt.label}
                      </Typography>
                      {opt.description && (
                        <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                          {opt.description}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Sheet>
              ))}
            </Box>
          </RadioGroup>
        )}

        {/* Custom text input */}
        {allowCustom && (
          <Input
            size="sm"
            placeholder="Or type a custom answer..."
            value={customTexts[idx] || ""}
            onChange={(e) => handleCustomTextChange(idx, e.target.value)}
            disabled={disabled}
            sx={{ mt: 1 }}
          />
        )}
      </Box>
    );
  };

  // Render review summary for a single question
  const renderReviewSummary = (q, idx) => {
    const answers = buildAnswers();
    const answer = answers[idx] || [];

    return (
      <Box key={idx} sx={{ mb: idx < questions.length - 1 ? 1.5 : 0 }}>
        <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
          {q.header}
        </Typography>
        <Typography level="body-sm" fontWeight="lg" sx={{ mb: 0.5 }}>
          {q.question}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {answer.length > 0 ? (
            answer.map((a, i) => (
              <Chip key={i} size="sm" color="primary" variant="solid">
                {a}
              </Chip>
            ))
          ) : (
            <Typography level="body-xs" sx={{ color: "warning.500", fontStyle: "italic" }}>
              No answer selected
            </Typography>
          )}
        </Box>
      </Box>
    );
  };

  // Render historical answered question
  const renderHistoricalAnswer = (q, idx) => {
    const answer = historicalAnswers?.[idx] || [];

    return (
      <Box key={idx} sx={{ mb: idx < questions.length - 1 ? 1.5 : 0 }}>
        {questions.length > 1 && (
          <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
            {q.header}
          </Typography>
        )}
        <Typography level="body-sm" fontWeight="lg" sx={{ mb: 0.5 }}>
          {q.question}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {answer.length > 0 ? (
            answer.map((a, i) => (
              <Chip key={i} size="sm" color="success" variant="soft">
                {a}
              </Chip>
            ))
          ) : (
            <Typography level="body-xs" sx={{ color: "text.tertiary", fontStyle: "italic" }}>
              No answer provided
            </Typography>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Card
      variant="outlined"
      sx={{
        p: 2,
        my: 1,
        borderColor: isResolved
          ? "neutral.outlinedBorder"
          : "primary.outlinedBorder",
        borderWidth: isResolved ? 1 : 2,
        bgcolor: isResolved ? "transparent" : "background.surface",
      }}
    >
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <HelpOutlineIcon
          sx={{
            fontSize: 20,
            color: isResolved ? "neutral.500" : "primary.500",
          }}
        />
        <Typography level="title-sm" fontWeight="lg">
          {questions.length === 1 ? questions[0].header : "Agent has questions"}
        </Typography>
        {getStatusChip()}
      </Box>

      {/* Rejected state */}
      {isRejected && (
        <Typography level="body-xs" sx={{ color: "text.tertiary", fontStyle: "italic" }}>
          This question was dismissed.
        </Typography>
      )}

      {/* Answered (historical) state */}
      {isAnswered && (
        <Box>
          {questions.map((q, idx) => renderHistoricalAnswer(q, idx))}
        </Box>
      )}

      {/* Pending: editing mode */}
      {!isResolved && !reviewing && (
        <Box>
          {questions.map((q, idx) => renderQuestionForm(q, idx))}

          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <Button
              size="sm"
              variant="plain"
              color="neutral"
              onClick={handleReject}
              disabled={disabled || submitting}
              startDecorator={<CloseIcon />}
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              variant="solid"
              color="primary"
              onClick={handleReview}
              disabled={disabled || submitting || !canSubmit()}
            >
              Review Answers
            </Button>
          </Box>
        </Box>
      )}

      {/* Pending: review mode */}
      {!isResolved && reviewing && (
        <Box>
          <Alert color="neutral" variant="soft" sx={{ mb: 1.5 }}>
            <Typography level="body-sm">
              Please review your answers before submitting. The agent will continue working after you submit.
            </Typography>
          </Alert>

          {questions.map((q, idx) => renderReviewSummary(q, idx))}

          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <Button
              size="sm"
              variant="plain"
              color="neutral"
              onClick={handleBackToEdit}
              disabled={submitting}
            >
              Back to Edit
            </Button>
            <Button
              size="sm"
              variant="solid"
              color="success"
              onClick={handleSubmit}
              loading={submitting}
              startDecorator={<SendIcon />}
            >
              Submit Answers
            </Button>
          </Box>
        </Box>
      )}
    </Card>
  );
};

export default QuestionDisplay;
