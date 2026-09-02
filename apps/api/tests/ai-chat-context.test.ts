import { describe, expect, it } from 'vitest';
import {
  detectReplyLanguage,
  fallbackChatReply,
  isHabitRelatedMessage,
  type ChatSnapshot,
} from '../src/modules/ai/ai-chat-context.js';

const emptySnapshot = (language: ChatSnapshot['language']): ChatSnapshot => ({
  userName: 'Parvej',
  today: '2026-09-02',
  activeHabits: 2,
  dueToday: 2,
  completedToday: 1,
  bestStreakTitle: 'Read 30 pages',
  bestStreak: 12,
  overallRate30: 0.8,
  focusedTitle: null,
  habitsText: '- Read 30 pages',
  progressText: 'Active habits: 2',
  language,
});

describe('chat language and scope', () => {
  it('detects Bangla, Banglish, and English', () => {
    expect(detectReplyLanguage('আজকে আমার স্ট্রিক কেমন?')).toBe('bangla');
    expect(detectReplyLanguage('Ami ajke habit miss korchi')).toBe('banglish');
    expect(detectReplyLanguage('How is my streak today?')).toBe('english');
  });

  it('treats weather as off-topic and habits as on-topic', () => {
    expect(isHabitRelatedMessage('what is the weather in Dhaka?')).toBe(false);
    expect(isHabitRelatedMessage('how do I improve my reading streak?')).toBe(true);
    expect(isHabitRelatedMessage('আজকে অভ্যাস লগ করবো?')).toBe(true);
  });

  it('fallback refuses off-topic in the user’s language and uses counts on-topic', () => {
    const off = fallbackChatReply('Who won the cricket match?', emptySnapshot('english'));
    expect(off.toLowerCase()).toContain('habit');

    const banglaOff = fallbackChatReply('আজকের খবর কী?', emptySnapshot('bangla'));
    expect(banglaOff).toContain('অভ্যাস');

    const on = fallbackChatReply('How is my progress?', emptySnapshot('english'));
    expect(on).toContain('2');
    expect(on).toContain('Read 30 pages');
  });
});
