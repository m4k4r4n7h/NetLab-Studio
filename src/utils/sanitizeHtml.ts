const ALLOWED_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul'
]);

const REMOVED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'select',
  'option',
  'textarea',
  'svg',
  'math',
  'template',
  'noscript',
  'audio',
  'video',
  'source',
  'track',
  'canvas'
]);

const ALLOWED_ATTRIBUTES = new Set(['href', 'title', 'colspan', 'rowspan']);

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[\u0000-\u0020]/g, '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(compact)) {
    return /^(https?:|mailto:)/i.test(compact) ? trimmed : null;
  }
  if (compact.startsWith('//') || compact.startsWith('\\\\')) return null;
  return trimmed;
}

function cleanNode(element: Element): void {
  const tag = element.tagName.toLowerCase();
  for (const child of [...element.children]) {
    cleanNode(child);
  }
  if (REMOVED_TAGS.has(tag)) {
    element.remove();
    return;
  }
  if (!ALLOWED_TAGS.has(tag)) {
    const parent = element.parentNode;
    if (!parent) {
      element.remove();
      return;
    }
    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    element.remove();
    return;
  }
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    if (!ALLOWED_ATTRIBUTES.has(name) || name.startsWith('on')) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (name === 'href') {
      const href = safeHref(attribute.value);
      if (!href) {
        element.removeAttribute(attribute.name);
      } else {
        element.setAttribute('href', href);
        element.setAttribute('rel', 'noreferrer noopener');
      }
    }
  }
}

export function sanitizeHtml(input: string): string {
  if (!input) return '';
  if (typeof DOMParser === 'undefined') {
    return input
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(input, 'text/html');
  const body = documentNode.body;
  for (const child of [...body.children]) {
    cleanNode(child);
  }
  for (const comment of collectComments(documentNode)) {
    comment.remove();
  }
  return body.innerHTML;
}

function collectComments(root: Document): Comment[] {
  const comments: Comment[] = [];
  const walker = root.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  let node = walker.nextNode();
  while (node) {
    comments.push(node as Comment);
    node = walker.nextNode();
  }
  return comments;
}

export function htmlToPlainText(input: string, limit = 400): string {
  const sanitized = sanitizeHtml(input);
  const text = sanitized
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
