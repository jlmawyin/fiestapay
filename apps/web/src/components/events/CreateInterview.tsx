import React, { useEffect, useRef, useState } from 'react';
import type { DraftEventProposal } from '@fiestapay/shared';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { createEventCatalog } from '../../i18n/messages/organizerCreate';
import { api } from '../../api/client';
import {
  EMPTY_INTERVIEW_ANSWERS,
  INTERVIEW_QUESTION_KEYS,
  composeInterviewSentence,
  nextInterviewQuestion,
  type InterviewAnswers,
  type InterviewQuestionKey,
} from '../../lib/create-interview';

interface CreateInterviewProps {
  onProposal: (proposal: DraftEventProposal) => void;
  onManual: () => void;
  onCancel: () => void;
}

type Stage = 'questions' | 'review';

type CreateCopy = (typeof createEventCatalog)['es'];

const questionCopy = (m: CreateCopy, key: InterviewQuestionKey) => {
  switch (key) {
    case 'occasion':
      return { question: m.interviewQ1, hint: m.interviewHint1, placeholder: m.interviewPlaceholder1 };
    case 'headcount':
      return { question: m.interviewQ2, hint: m.interviewHint2, placeholder: m.interviewPlaceholder2 };
    case 'share':
      return { question: m.interviewQ3, hint: m.interviewHint3, placeholder: m.interviewPlaceholder3 };
    case 'when':
      return { question: m.interviewQ4, hint: m.interviewHint4, placeholder: m.interviewPlaceholder4 };
  }
};

/**
 * Guided interview: one short question at a time, Skip, editable Back, and an
 * explicit "Draft with AI" click. It never posts while the person is typing.
 */
export const CreateInterview: React.FC<CreateInterviewProps> = ({ onProposal, onManual, onCancel }) => {
  const { locale } = useI18n();
  const m = useMessages(createEventCatalog);
  const [answers, setAnswers] = useState<InterviewAnswers>(EMPTY_INTERVIEW_ANSWERS);
  const [skipped, setSkipped] = useState<ReadonlySet<InterviewQuestionKey>>(new Set());
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>('questions');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastIndexRef = useRef(0);

  const key = INTERVIEW_QUESTION_KEYS[index] ?? 'occasion';
  const copy = questionCopy(m, key);
  const composed = composeInterviewSentence(answers, locale);

  useEffect(() => {
    if (stage !== 'questions') return;
    if (lastIndexRef.current === index) return;
    lastIndexRef.current = index;
    inputRef.current?.focus();
  }, [index, stage]);

  const moveTo = (nextAnswers: InterviewAnswers, nextSkipped: ReadonlySet<InterviewQuestionKey>, from: number) => {
    const next = nextInterviewQuestion(nextAnswers, from, nextSkipped);
    if (next === null) {
      setStage('review');
      setError(null);
      return;
    }
    setIndex(next);
    setStage('questions');
  };

  const handleNext = () => {
    const value = answers[key].trim();
    const nextAnswers = { ...answers, [key]: value };
    setAnswers(nextAnswers);
    moveTo(nextAnswers, skipped, index + 1);
  };

  const handleSkip = () => {
    const nextSkipped = new Set(skipped);
    nextSkipped.add(key);
    setSkipped(nextSkipped);
    moveTo(answers, nextSkipped, index + 1);
  };

  const handleBack = () => {
    setError(null);
    if (stage === 'review') {
      setStage('questions');
      return;
    }
    setIndex((current) => Math.max(0, current - 1));
  };

  const handleDraft = async () => {
    if (loading) return;
    if (composed.length < 3) {
      setError(m.interviewEmpty);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const proposal = await api.draftEvent(composed);
      onProposal(proposal);
    } catch {
      // Answers and the composed sentence stay intact for an explicit retry.
      setError(m.interviewError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="create-interview" aria-label={m.interviewAria}>
      <h3 className="create-interview__title">{m.interviewTitle}</h3>

      {stage === 'questions' ? (
        <>
          <p className="create-interview__intro">{m.interviewIntro}</p>
          <p className="create-interview__progress" aria-live="polite">
            {m.interviewProgress(index + 1, INTERVIEW_QUESTION_KEYS.length)}
          </p>
          <form
            className="create-interview__question"
            onSubmit={(event) => {
              event.preventDefault();
              handleNext();
            }}
          >
            <label className="form-label" htmlFor={`interview-${key}`}>
              {copy.question}
            </label>
            <input
              id={`interview-${key}`}
              ref={inputRef}
              className="form-input"
              value={answers[key]}
              onChange={(event) => setAnswers({ ...answers, [key]: event.target.value })}
              placeholder={copy.placeholder}
              maxLength={key === 'occasion' ? 240 : 180}
              autoComplete="off"
              aria-describedby={`interview-help-${key}`}
            />
            <span id={`interview-help-${key}`} className="form-label-desc">
              {copy.hint}
            </span>
            <div className="create-interview__actions">
              <button type="button" className="btn btn-secondary" onClick={handleBack} disabled={index === 0 || loading}>
                {m.interviewBack}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleSkip} disabled={loading}>
                {m.interviewSkip}
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {m.interviewNext}
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="create-interview__review">
          <h4 className="create-interview__review-title">{m.interviewReviewTitle}</h4>
          <p className="create-interview__intro">{m.interviewReviewHint}</p>
          <p className="form-label">{m.interviewComposedLabel}</p>
          <p className="create-interview__sentence" data-testid="interview-sentence">
            {composed}
          </p>
          {skipped.size > 0 ? <p className="form-label-desc">{m.interviewSkippedNote}</p> : null}
          <div className="create-interview__actions">
            <button type="button" className="btn btn-secondary" onClick={handleBack} disabled={loading}>
              {m.interviewEditAnswers}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void handleDraft()} disabled={loading}>
              {loading ? m.interviewDrafting : error ? m.interviewRetry : m.interviewDraft}
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="create-wizard__error">
          {error}
        </p>
      ) : null}

      <div className="create-interview__footer">
        <button type="button" className="btn btn-secondary" onClick={onManual} disabled={loading}>
          {m.interviewManual}
        </button>
        <button type="button" className="create-wizard__advanced-toggle" onClick={onCancel} disabled={loading}>
          {m.interviewExit}
        </button>
      </div>
    </section>
  );
};
