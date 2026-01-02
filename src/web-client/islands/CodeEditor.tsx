import { useEffect, useRef } from "preact/hooks";

interface EditorProps {
  initialValue: string;
  language?: string;
  theme?: string;
  onChange?: (value: string) => void;
}

export default function CodeEditor({ initialValue, language = "markdown", theme = "vs-dark", onChange }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // deno-lint-ignore no-explicit-any
  const editorRef = useRef<any>(null);

  useEffect(() => {
    // Load Monaco from CDN
    // deno-lint-ignore no-explicit-any
    if (!(globalThis as any).monaco) {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js";
        script.onload = () => {
             // deno-lint-ignore no-explicit-any
            (globalThis as any).require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
             // deno-lint-ignore no-explicit-any
            (globalThis as any).require(['vs/editor/editor.main'], () => {
                initEditor();
            });
        };
        document.body.appendChild(script);
    } else {
        initEditor();
    }

    return () => {
        editorRef.current?.dispose();
    };
  }, []);

  const initEditor = () => {
      if (!containerRef.current) return;
      
      // deno-lint-ignore no-explicit-any
      editorRef.current = (globalThis as any).monaco.editor.create(containerRef.current, {
          value: initialValue,
          language: language,
          theme: theme,
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
      });

      editorRef.current.onDidChangeModelContent(() => {
          onChange?.(editorRef.current.getValue());
      });
  };

  return <div ref={containerRef} style={{ height: "100%", minHeight: "500px" }} class="border border-gray-700 rounded" />;
}

declare global {
  interface Window {
    monaco: any;
    require: any;
  }
}
