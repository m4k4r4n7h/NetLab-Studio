import { describe, expect, it } from 'vitest';
import { htmlToPlainText, sanitizeHtml } from '../../src/utils/sanitizeHtml';

describe('HTML sanitisation', () => {
  it('removes scripts, styles, frames, forms, and event handlers', () => {
    const output = sanitizeHtml(
      '<div onclick="steal()"><script>alert(1)</script><style>body{display:none}</style>' +
      '<iframe src="https://example.test"></iframe><form><input value="x"></form><b>Safe</b></div>'
    );
    expect(output).not.toContain('script');
    expect(output).not.toContain('style');
    expect(output).not.toContain('iframe');
    expect(output).not.toContain('input');
    expect(output).not.toContain('onclick');
    expect(output).toContain('<b>Safe</b>');
  });

  it('keeps safe absolute and relative links', () => {
    const output = sanitizeHtml(
      '<a href="https://example.test/page">secure</a>' +
      '<a href="mailto:lab@example.test">mail</a>' +
      '<a href="/local/page">local</a>' +
      '<a href="relative.html">relative</a>'
    );
    expect(output).toContain('href="https://example.test/page"');
    expect(output).toContain('href="mailto:lab@example.test"');
    expect(output).toContain('href="/local/page"');
    expect(output).toContain('href="relative.html"');
  });

  it('removes unsafe and protocol-relative links while preserving their text', () => {
    const output = sanitizeHtml(
      '<a href="//evil.test/login">protocol relative</a>' +
      '<a href="javascript:alert(1)">script link</a>' +
      '<a href="data:text/html,<b>x</b>">data link</a>' +
      '<a href="\\\\evil.test/share">backslash link</a>'
    );
    expect(output).not.toContain('href=');
    expect(output).toContain('protocol relative');
    expect(output).toContain('script link');
    expect(output).toContain('data link');
    expect(output).toContain('backslash link');
  });

  it('produces plain text for summaries', () => {
    expect(htmlToPlainText('<p>Hello <strong>lab</strong></p>')).toBe('Hello lab');
  });
});
