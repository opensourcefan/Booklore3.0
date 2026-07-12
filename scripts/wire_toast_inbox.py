#!/usr/bin/env python3
"""Brace-aware toast→inbox wiring for notification redesign rounds."""
from __future__ import annotations

import re
import sys
from pathlib import Path

HELPER = '''
  private toastError(summary: string, detail: string, life?: number): void {
    this.failureNotifications.reportSafe(summary, detail);
    this.messageService.add({severity: 'error', summary, detail, ...(life != null ? {life} : {})});
  }
'''

def find_matching(text: str, open_idx: int, open_ch='{', close_ch='}'):
    depth = 0
    i = open_idx
    in_str = None
    escape = False
    while i < len(text):
        c = text[i]
        if in_str:
            if escape:
                escape = False
            elif c == '\\\\':
                escape = True
            elif c == in_str:
                in_str = None
        else:
            if c in ('"', "'", '`'):
                in_str = c
            elif c == open_ch:
                depth += 1
            elif c == close_ch:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1


def extract_prop(obj: str, name: str):
    m = re.search(rf'\b{name}\s*:', obj)
    if not m:
        return None
    i = m.end()
    while i < len(obj) and obj[i].isspace():
        i += 1
    start = i
    depth_brace = depth_paren = depth_brack = 0
    in_str = None
    escape = False
    while i < len(obj):
        c = obj[i]
        if in_str:
            if escape:
                escape = False
            elif c == '\\\\':
                escape = True
            elif c == in_str:
                in_str = None
            i += 1
            continue
        if c in ('"', "'", '`'):
            in_str = c
            i += 1
            continue
        if c == '{':
            depth_brace += 1
        elif c == '}':
            if depth_brace == depth_paren == depth_brack == 0:
                break
            depth_brace -= 1
        elif c == '(':
            depth_paren += 1
        elif c == ')':
            depth_paren -= 1
        elif c == '[':
            depth_brack += 1
        elif c == ']':
            depth_brack -= 1
        elif c == ',' and depth_brace == depth_paren == depth_brack == 0:
            break
        i += 1
    return obj[start:i].strip()


def ensure_infra(text: str, import_path: str) -> str:
    if 'FailureNotificationService' not in text:
        m = re.search(r"import \{[^}]*MessageService[^}]*\} from 'primeng/api';\n", text)
        if not m:
            raise SystemExit('no MessageService import')
        text = text[:m.end()] + f"import {{FailureNotificationService}} from '{import_path}';\n" + text[m.end():]
    if 'failureNotifications = inject(FailureNotificationService)' not in text:
        for pat in [
            r'(private (?:readonly )?messageService = inject\(MessageService\);)',
            r'(protected (?:readonly )?messageService = inject\(MessageService\);)',
            r'(messageService = inject\(MessageService\);)',
        ]:
            if re.search(pat, text):
                text = re.sub(
                    pat,
                    r'\1\n  private failureNotifications = inject(FailureNotificationService);',
                    text,
                    count=1,
                )
                break
        else:
            raise SystemExit('no messageService inject')
    if 'private toastError(' not in text:
        text = text.rstrip()
        assert text.endswith('}')
        text = text[:-1] + HELPER + '}\n'
    return text


def replace_error_adds(text: str) -> tuple[str, int]:
    count = 0
    out = []
    i = 0
    needle = 'this.messageService.add('
    while True:
        j = text.find(needle, i)
        if j < 0:
            out.append(text[i:])
            break
        paren = j + len(needle) - 1
        k = text.find('{', paren)
        if k < 0 or k > paren + 40:
            out.append(text[i:j + len(needle)])
            i = j + len(needle)
            continue
        end = find_matching(text, k)
        if end < 0:
            out.append(text[i:j + len(needle)])
            i = j + len(needle)
            continue
        obj = text[k + 1:end]
        if not re.search(r"severity\s*:\s*'error'", obj):
            out.append(text[i:end + 1])
            i = end + 1
            continue
        summary = extract_prop(obj, 'summary')
        detail = extract_prop(obj, 'detail')
        life = extract_prop(obj, 'life')
        if not summary or not detail:
            out.append(text[i:end + 1])
            i = end + 1
            continue
        after = end + 1
        while after < len(text) and text[after] in ' \t':
            after += 1
        if after < len(text) and text[after] == ')':
            after += 1
        if after < len(text) and text[after] == ';':
            after += 1
        if life:
            repl = f'this.toastError({summary}, {detail}, {life});'
        else:
            repl = f'this.toastError({summary}, {detail});'
        out.append(text[i:j])
        out.append(repl)
        count += 1
        i = after
    return ''.join(out), count


def wire(path: Path, import_path: str) -> int:
    text = ensure_infra(path.read_text(), import_path)
    text, n = replace_error_adds(text)
    path.write_text(text)
    return n


if __name__ == '__main__':
    # args: relpath import_path pairs
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
    args = sys.argv[2:]
    if len(args) % 2 != 0:
        raise SystemExit('usage: wire_toast_inbox.py ROOT relpath import_path ...')
    for i in range(0, len(args), 2):
        rel, ip = args[i], args[i + 1]
        n = wire(root / rel, ip)
        print(f'{n:2} {rel}')
