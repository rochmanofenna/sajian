import { describe, it, expect } from 'vitest';
import { sanitizeJsx } from './jsx-sanitizer';
import { SanitizerError } from './sanitizer';

function call(source: string) {
  return () => sanitizeJsx(source);
}

describe('jsx-sanitizer — slot-tree reduction', () => {
  it('reduces a bare Motion primitive to a slot tree', () => {
    const out = sanitizeJsx(`<Motion enter="fade">{"hi"}</Motion>`);
    expect(out.kind).toBe('compile'); // expression container forces compile
  });

  it('reduces a pure literal Motion text to slot tree', () => {
    const out = sanitizeJsx(`<Motion enter="fade"><Text content="hi" /></Motion>`);
    expect(out.kind).toBe('slot_tree');
    if (out.kind !== 'slot_tree') throw new Error('');
    expect(out.tree.kind).toBe('motion');
    expect(out.tree.children?.[0]?.kind).toBe('text');
  });

  it('reduces a nested Overlay + Button', () => {
    const out = sanitizeJsx(
      `<Overlay anchor="bottom-right" offset_x={24} offset_y={24}>
         <Button content="Pesan" href="/menu" size="sm" />
       </Overlay>`,
    );
    expect(out.kind).toBe('slot_tree');
  });

  it('reduces JSX text children into text nodes', () => {
    const out = sanitizeJsx(`<Box><Text content="halo dunia" /></Box>`);
    expect(out.kind).toBe('slot_tree');
  });

  it('rejects spread inside an object literal passed as style', () => {
    expect(() =>
      sanitizeJsx(`function Section(){ return <Box style={{...someVar}} /> }`),
    ).toThrow(SanitizerError);
  });
});

describe('jsx-sanitizer — rejection: imports / exports / throws', () => {
  it('rejects import declarations', () => {
    expect(call(`import { x } from 'y'; <Box />`)).toThrow(/banned_declaration/);
  });
  it('rejects export declarations', () => {
    expect(call(`export default function X(){return <Box />}`)).toThrow(/banned_declaration/);
  });
  it('rejects throw', () => {
    expect(call(`function F(){throw new Error('x'); return <Box/>}`)).toThrow(/throw/);
  });
  it('rejects try/catch', () => {
    expect(
      call(`function F(){try{return <Box/>}catch(e){return <Box/>}}`),
    ).toThrow(/try_catch/);
  });
});

describe('jsx-sanitizer — rejection: dangerous globals', () => {
  it('rejects window', () => {
    expect(call(`<Box>{window.location}</Box>`)).toThrow(/banned_global/);
  });
  it('rejects document', () => {
    expect(call(`<Box>{document.cookie}</Box>`)).toThrow(/banned_global/);
  });
  it('rejects fetch', () => {
    expect(call(`<Box>{fetch('/x')}</Box>`)).toThrow(/banned_call/);
  });
  it('rejects eval', () => {
    expect(call(`<Box>{eval('1')}</Box>`)).toThrow(/banned_call/);
  });
  it('rejects Function constructor', () => {
    expect(call(`<Box>{new Function('')}</Box>`)).toThrow();
  });
  it('rejects localStorage / sessionStorage', () => {
    expect(call(`<Box>{localStorage.getItem('x')}</Box>`)).toThrow(/banned_global/);
    expect(call(`<Box>{sessionStorage.getItem('x')}</Box>`)).toThrow(/banned_global/);
  });
  it('rejects globalThis / self / process', () => {
    expect(call(`<Box>{globalThis.x}</Box>`)).toThrow(/banned_global/);
    expect(call(`<Box>{self.x}</Box>`)).toThrow(/banned_global/);
    expect(call(`<Box>{process.env.X}</Box>`)).toThrow(/banned_global/);
  });
  it('rejects setTimeout / setInterval', () => {
    expect(call(`<Box>{setTimeout(() => {}, 1)}</Box>`)).toThrow(/banned_call/);
    expect(call(`<Box>{setInterval(() => {}, 1)}</Box>`)).toThrow(/banned_call/);
  });
});

describe('jsx-sanitizer — rejection: prototype walks', () => {
  it('rejects x.constructor', () => {
    expect(call(`<Box>{x.constructor}</Box>`)).toThrow(/prototype_walk/);
  });
  it('rejects x.__proto__', () => {
    expect(call(`<Box>{x.__proto__}</Box>`)).toThrow(/prototype_walk/);
  });
  it('rejects x["constructor"]', () => {
    expect(call(`<Box>{x["constructor"]}</Box>`)).toThrow(/prototype_walk_computed/);
  });
  it('rejects x.prototype', () => {
    expect(call(`<Box>{x.prototype}</Box>`)).toThrow(/prototype_walk/);
  });
});

describe('jsx-sanitizer — rejection: JSX attribute hygiene', () => {
  it('rejects dangerouslySetInnerHTML', () => {
    expect(
      call(`<div dangerouslySetInnerHTML={{__html: 'x'}} />`),
    ).toThrow(/banned_attribute/);
  });
  it('rejects onClick', () => {
    expect(call(`<Button onClick={() => {}} content="x" />`)).toThrow(/event_handler/);
  });
  it('rejects ref', () => {
    expect(call(`<Box ref={r} />`)).toThrow(/banned_attribute/);
  });
  it('rejects spread attributes', () => {
    expect(call(`<Box {...props} />`)).toThrow(/spread_attr/);
  });
  it('rejects javascript: href', () => {
    expect(call(`<Button href="javascript:alert(1)" content="x" />`)).toThrow(
      /banned_url_prefix/,
    );
  });
  it('rejects data:text/html src', () => {
    expect(
      call(`<Image src="data:text/html,<script>1</script>" />`),
    ).toThrow(/banned_url_prefix/);
  });
});

describe('jsx-sanitizer — rejection: JSX structure', () => {
  it('rejects unknown capitalized component', () => {
    expect(call(`<Modal />`)).toThrow(/unknown_component/);
  });
  it('rejects unknown lowercase tag', () => {
    expect(call(`<marquee />`)).toThrow(/unknown_tag/);
  });
  it('rejects member-expression JSX name', () => {
    expect(call(`<React.Fragment />`)).toThrow(/jsx_member_element/);
  });
});

describe('jsx-sanitizer — rejection: language constructs', () => {
  it('rejects new expressions', () => {
    expect(call(`<Box>{new Date()}</Box>`)).toThrow(/new_expression/);
  });
  it('rejects ++/--', () => {
    expect(call(`function F(){let x=0;x++;return <Box/>}`)).toThrow(/update_expression/);
  });
  it('rejects assignment outside scope', () => {
    expect(call(`function F(){x = 1; return <Box/>}`)).toThrow(/assignment/);
  });
  it('rejects regex', () => {
    expect(call(`<Box>{/x/.test('x')}</Box>`)).toThrow(/regex/);
  });
  it('rejects tagged templates', () => {
    expect(call("<Box>{tag`x`}</Box>")).toThrow(/tagged_template/);
  });
  it('rejects sequence expression', () => {
    expect(call(`<Box>{(1, 2)}</Box>`)).toThrow(/sequence/);
  });
  it('rejects spread', () => {
    expect(call(`<Box>{[...x]}</Box>`)).toThrow();
  });
  it('rejects await / async', () => {
    expect(call(`<Box>{await p}</Box>`)).toThrow();
  });
});

describe('jsx-sanitizer — size limits', () => {
  it('rejects source over max_length', () => {
    const big = 'x'.repeat(9000);
    expect(() => sanitizeJsx(`<Text content="${big}" />`)).toThrow(/max_length/);
  });
  it('rejects empty source', () => {
    expect(call('')).toThrow(/empty/);
  });
  it('rejects non-parsable source', () => {
    expect(call(`<Box`)).toThrow(/parse_error/);
  });
});

describe('jsx-sanitizer — compile path', () => {
  it('routes hook usage to compile', () => {
    const out = sanitizeJsx(
      `function S(){ const [c, setC] = useState(0); return <Button content={c} href="/menu" /> }`,
    );
    expect(out.kind).toBe('compile');
  });

  it('routes conditional to compile', () => {
    const out = sanitizeJsx(
      `function S(){ return (true ? <Box/> : <Box/>) }`,
    );
    expect(out.kind).toBe('compile');
  });

  it('passes through strict sanitization before compile', () => {
    // useMemo is allowed — should compile, not throw.
    const out = sanitizeJsx(
      `function S(){ const m = useMemo(() => 1, []); return <Text content={"x" + m} /> }`,
    );
    expect(out.kind).toBe('compile');
  });
});

describe('jsx-sanitizer — error shape', () => {
  it('throws SanitizerError with path + rule', () => {
    let caught: SanitizerError | null = null;
    try {
      sanitizeJsx(`<Box>{window.x}</Box>`);
    } catch (err) {
      if (err instanceof SanitizerError) caught = err;
    }
    expect(caught).not.toBeNull();
    expect(caught?.rule).toMatch(/banned/);
    expect(caught?.path).toContain('program.body');
  });
});
