import { RichTextEditor } from "@mantine/tiptap";
import Link from "@tiptap/extension-link";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

const extensions = [StarterKit, Link.configure({ openOnClick: false })];

export function MemoEditor({
  initial,
  onChange,
  label,
}: {
  readonly initial: string;
  readonly onChange: (html: string) => void;
  readonly label: string;
}) {
  const editor = useEditor({
    extensions,
    content: initial,
    immediatelyRender: false,
    onUpdate: ({ editor: next }) => {
      onChange(next.getHTML());
    },
  });

  return (
    <RichTextEditor editor={editor} aria-label={label}>
      <RichTextEditor.Toolbar>
        <RichTextEditor.Bold />
        <RichTextEditor.Italic />
        <RichTextEditor.Link />
        <RichTextEditor.BulletList />
      </RichTextEditor.Toolbar>
      <RichTextEditor.Content aria-label={label} />
    </RichTextEditor>
  );
}

export const memoPlainText = (html: string): string =>
  html
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
