import { validateFile } from './private-storage.service';
describe('upload validation', () => {
  const file = (mimetype: string, buffer: Buffer) => ({ mimetype, buffer, size: buffer.length });
  it('accepts UTF-8 text within limit', () =>
    expect(() =>
      validateFile(file('text/plain', Buffer.from('A client brief')), 100, ['text/plain']),
    ).not.toThrow());
  it('rejects a disguised PDF', () =>
    expect(() =>
      validateFile(file('application/pdf', Buffer.from('<script>bad</script>')), 100, [
        'application/pdf',
      ]),
    ).toThrow());
  it('rejects an unapproved MIME type', () =>
    expect(() =>
      validateFile(file('image/svg+xml', Buffer.from('<svg/>')), 100, ['image/png']),
    ).toThrow());
  it('rejects empty or oversized content', () => {
    expect(() => validateFile(file('text/plain', Buffer.alloc(0)), 100, ['text/plain'])).toThrow();
    expect(() =>
      validateFile(file('text/plain', Buffer.alloc(101)), 100, ['text/plain']),
    ).toThrow();
  });
  it('rejects binary bytes declared as text', () =>
    expect(() =>
      validateFile(file('text/plain', Buffer.from([0, 255, 1])), 100, ['text/plain']),
    ).toThrow());

  it.each([Buffer.from([255, 254]), Buffer.from([7, 9, 10])])(
    'rejects malformed UTF-8 or binary control bytes declared as text',
    (buffer) => {
      expect(() => validateFile(file('text/plain', buffer), 100, ['text/plain'])).toThrow();
    },
  );
});
