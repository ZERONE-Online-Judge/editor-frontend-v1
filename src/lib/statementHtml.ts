import { defaultSchema } from 'rehype-sanitize';
import type { Options } from 'rehype-sanitize';
import { defaultUrlTransform } from 'react-markdown';
import type { CSSProperties } from 'react';

export const statementSchema: Options = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'u',
    'small',
    'sup',
    'sub',
    'cite',
    'dl',
    'dt',
    'dd',
  ],
  strip: [
    ...(defaultSchema.strip || []),
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'form',
  ],
  attributes: {
    ...defaultSchema.attributes,
    code: [['className', /^language-./, 'math-inline', 'math-display']],
    div: [
      [
        'className',
        /^zoj-tex-(?:table(?:-ruled)?|center|flushleft|flushright|caption)$/,
      ],
    ],
    span: [
      [
        'className',
        /^zoj-tex-(?:smallcaps|roman|sans|size-(?:tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge))$/,
      ],
    ],
    td: [
      ...(defaultSchema.attributes?.td || []),
      'colSpan',
      'rowSpan',
      ['align', 'left', 'center', 'right'],
    ],
    th: [
      ...(defaultSchema.attributes?.th || []),
      'colSpan',
      'rowSpan',
      ['align', 'left', 'center', 'right'],
    ],
    img: [
      ...(defaultSchema.attributes?.img || []),
      'dataTexWidth',
      'dataTexHeight',
      'dataTexScale',
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'asset'],
    src: ['http', 'https', 'asset', 'blob', 'data'],
  },
};

export function statementUrl(value: string, key = 'href') {
  const url = value.trim();
  if (
    key === 'src' &&
    (/^blob:/i.test(url) ||
      /^data:image\/(?:png|gif|jpe?g|webp|avif);base64,[a-z\d+/=\s]+$/i.test(
        url,
      ))
  )
    return url;
  return defaultUrlTransform(url);
}

export function statementImageStyle(
  properties: Record<string, unknown>,
): CSSProperties {
  const dimension = (value: unknown) => {
    const match = /^(\d+(?:\.\d+)?)(px|%)$/.exec(String(value || ''));
    return match
      ? `${Math.min(match[2] === '%' ? 100 : 4096, Math.max(1, Number(match[1])))}${match[2]}`
      : undefined;
  };
  const raw = Number(properties['data-tex-scale']);
  const scale =
    Number.isFinite(raw) && raw > 0 ? Math.min(4, Math.max(0.1, raw)) : 1;
  return {
    width: dimension(properties['data-tex-width']),
    height: dimension(properties['data-tex-height']),
    maxWidth: `${100 / Math.max(1, scale)}%`,
    zoom: scale === 1 ? undefined : scale,
  };
}
