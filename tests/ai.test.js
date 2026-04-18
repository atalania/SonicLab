import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeSound, dialog, getNextQuestion } from '../js/ai.js';

function mockOpenAIResponse(content) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getNextQuestion', () => {
  it('returns a string from the bank for difficulty 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const q = getNextQuestion(1);
    expect(typeof q).toBe('string');
    expect(q.length).toBeGreaterThan(0);
  });
});

describe('analyzeSound (integration)', () => {
  it('handles empty frequency snapshots via conservative metrics', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockOpenAIResponse(
        JSON.stringify({
          summary: 'Empty bins',
          what_it_means: 'Meaning',
          try_this: 'Try',
          vocab: { term: 't', definition: 'd' },
        }),
      ),
    );
    const result = await analyzeSound({ word: 'x', frequencies: [] });
    expect(result.metrics.dominant_hz).toBe(0);
    expect(result.report.summary).toBe('Empty bins');
  });

  it('parses strict JSON from the proxy and returns structured analysis', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockOpenAIResponse(
        JSON.stringify({
          summary: 'Test summary',
          what_it_means: 'Test meaning',
          try_this: 'Try again',
          vocab: { term: 'FFT', definition: 'Discrete frequency bins.' },
        }),
      ),
    );

    const result = await analyzeSound({
      word: 'hello',
      frequencies: [10, 20, 30],
      sampleRate: 44100,
      fftSize: 1024,
    });

    expect(result.report.summary).toBe('Test summary');
    expect(result.analysis).toContain('Test summary');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/ai/openai',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses deterministic fallback when model output is not valid JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockOpenAIResponse('```json\nnot valid json\n```'),
    );

    const result = await analyzeSound({
      word: 'x',
      frequencies: [255, 1, 0],
      estimatedPitchHz: 0,
      pitchClarity: 0,
    });

    expect(result.report.summary).toMatch(/spectrum|energy|pitch/i);
    expect(result.report.vocab).toBeDefined();
  });

  it('parses JSON wrapped in markdown code fences', async () => {
    const inner = JSON.stringify({
      summary: 'Fence summary',
      what_it_means: 'Fence meaning',
      try_this: 'Fence try',
      vocab: { term: 'Hz', definition: 'Cycles per second.' },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockOpenAIResponse(`\`\`\`json\n${inner}\n\`\`\``),
    );

    const result = await analyzeSound({
      word: 'ok',
      frequencies: [5, 5, 5],
    });

    expect(result.report.summary).toBe('Fence summary');
  });

  it('uses fallback when choices array is empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    });

    const result = await analyzeSound({
      word: 'z',
      frequencies: [10, 0, 0],
    });

    expect(result.report.summary.length).toBeGreaterThan(10);
    expect(result.report.try_this || result.report.summary).toBeTruthy();
  });

  it('propagates errors when fetch rejects', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(
      analyzeSound({ word: 'a', frequencies: [1, 2, 3] }),
    ).rejects.toThrow('network down');
  });
});

describe('dialog (integration)', () => {
  it('throws when Whisper proxy is not OK', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
    });

    const blob = new Blob(['fake-audio'], { type: 'audio/webm' });
    await expect(
      dialog(blob, {
        difficulty: 1,
        points: 0,
        targetWord: 'HELLO',
        analysisText: '',
        currentQuestion: 'What is amplitude?',
        fft: [1, 2, 3],
        history: [],
      }),
    ).rejects.toThrow('Transcription failed');
  });

  it('completes normal quiz flow when Whisper and chat succeed', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Energy is mostly in the low bins.' }),
      })
      .mockResolvedValueOnce(
        mockOpenAIResponse(
          JSON.stringify({
            reply: 'Correct: You mentioned energy.\nMissing: Be more specific.\nNext step: Name a band.',
            score: 0.8,
            newDifficulty: 2,
            nextQuestion: 'What is spectral centroid?',
          }),
        ),
      );

    const blob = new Blob(['x'], { type: 'audio/webm' });
    const out = await dialog(blob, {
      difficulty: 2,
      points: 10,
      targetWord: 'TEST',
      analysisText: 'prior analysis',
      currentQuestion: 'Describe this spectrum.',
      fft: new Array(50).fill(0.1),
      history: [],
    });

    expect(out.transcript).toContain('Energy');
    expect(out.reply).toContain('Correct:');
    expect(out.totalPoints).toBeGreaterThanOrEqual(10);
    expect(out.nextQuestion).toBeTruthy();
  });

  it('enters teaching path when transcript is IDK', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "I don't know" }),
      })
      .mockResolvedValueOnce(
        mockOpenAIResponse(
          JSON.stringify({
            reply: 'Step 1: Q\nStep 2: A\nStep 3: E\nStep 4: R\nStep 5: ?',
            score: 0.1,
            newDifficulty: 1,
            nextQuestion: 'Follow-up?',
          }),
        ),
      );

    vi.spyOn(Math, 'random').mockReturnValue(0);

    const blob = new Blob(['y'], { type: 'audio/webm' });
    const out = await dialog(blob, {
      difficulty: 2,
      points: 5,
      targetWord: 'VOWEL',
      analysisText: '',
      currentQuestion: 'What is resonance?',
      fft: null,
      history: [],
    });

    expect(out.pointsEarned).toBe(0);
    expect(out.reply).toContain('Step 1:');
    expect(out.difficulty).toBeLessThanOrEqual(2);
  });

  it('uses static IDK teaching payload when second model response is not JSON', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'idk' }),
      })
      .mockResolvedValueOnce(mockOpenAIResponse('not json at all'));

    vi.spyOn(Math, 'random').mockReturnValue(0);

    const blob = new Blob(['z'], { type: 'audio/webm' });
    const out = await dialog(blob, {
      difficulty: 3,
      points: 1,
      targetWord: 'X',
      analysisText: '',
      currentQuestion: 'Why FFT bins?',
      fft: null,
      history: [],
    });

    expect(out.reply).toContain('Step 1:');
    expect(out.reply).toContain('Rule of thumb');
    expect(out.difficulty).toBeLessThanOrEqual(3);
  });

  it('uses static quiz payload when evaluation JSON is invalid', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Harmonics stack on the fundamental.' }),
      })
      .mockResolvedValueOnce(mockOpenAIResponse('```\nbroken\n```'));

    vi.spyOn(Math, 'random').mockReturnValue(0);

    const blob = new Blob(['a'], { type: 'audio/webm' });
    const out = await dialog(blob, {
      difficulty: 2,
      points: 0,
      targetWord: 'NOTE',
      analysisText: '',
      currentQuestion: 'What is a harmonic?',
      fft: [0.1, 0.2],
      history: [],
    });

    expect(out.reply).toContain('Correct:');
    expect(out.score).toBeCloseTo(0.5, 5);
    expect(out.nextQuestion.length).toBeGreaterThan(0);
  });

  it('includes recent dialog history in messages sent to the model', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Amplitude is loudness mostly.' }),
      })
      .mockResolvedValueOnce(mockOpenAIResponse(
        JSON.stringify({
          reply: 'Correct: Good.\nMissing: None.\nNext step: Done.',
          score: 0.9,
          newDifficulty: 2,
          nextQuestion: 'Next Q?',
        }),
      ));

    globalThis.fetch = fetchMock;

    const blob = new Blob(['b'], { type: 'audio/webm' });
    await dialog(blob, {
      difficulty: 1,
      points: 0,
      targetWord: 'T',
      analysisText: 'analysis',
      currentQuestion: 'Q1',
      fft: null,
      history: [
        { role: 'user', content: 'Earlier student turn' },
        { role: 'assistant', content: 'Earlier tutor turn' },
        { role: 'mentor', content: 'Should map to assistant' },
      ],
    });

    const chatCall = fetchMock.mock.calls.find(
      c => c[0] === '/api/ai/openai' && typeof c[1]?.body === 'string',
    );
    expect(chatCall).toBeDefined();
    const body = JSON.parse(chatCall[1].body);
    const transcript = body.messages.map(m => `${m.role}:${m.content}`).join('\n');
    expect(transcript).toContain('Earlier student turn');
    expect(transcript).toContain('Earlier tutor turn');
    expect(transcript).toContain('Should map to assistant');
  });

  it('fills currentQuestion from question bank when omitted', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Student answer here.' }),
      })
      .mockResolvedValueOnce(mockOpenAIResponse(
        JSON.stringify({
          reply: 'Correct: OK\nMissing: Detail\nNext step: Read spectrum',
          score: 0.6,
          newDifficulty: 1,
          nextQuestion: 'Bank Q',
        }),
      ));

    vi.spyOn(Math, 'random').mockReturnValue(0);

    const blob = new Blob(['c'], { type: 'audio/webm' });
    const out = await dialog(blob, {
      difficulty: 1,
      points: 0,
      targetWord: 'W',
      analysisText: '',
      currentQuestion: '',
      fft: null,
      history: [],
    });

    expect(out.transcript).toContain('Student answer');
    expect(out.reply).toContain('Correct:');
  });
});
