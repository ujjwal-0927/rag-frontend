import { useState, useRef, useEffect } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { Upload, Send, FileText, CheckCircle2, AlertCircle, Bot, User, Sparkles } from 'lucide-react';

// Type Definitions
interface Message {
  sender: 'user' | 'ai';
  text: string;
  isStreaming?: boolean;
}

interface UploadStatus {
  type: 'success' | 'error';
  text: string;
}

interface UploadApiResponse {
  status: string;
  filename: string;
  chunks_indexed: number;
  detail?: string;
}

export default function App(): React.JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const [query, setQuery] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle PDF Upload to FastAPI
  const handleUpload = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data: UploadApiResponse = await res.json();

      if (res.ok) {
        setUploadStatus({
          type: 'success',
          text: `Indexed ${data.chunks_indexed} chunks from "${data.filename}"`,
        });
        setMessages([
          {
            sender: 'ai',
            text: `Document "${data.filename}" processed successfully into Hybrid Vector & BM25 index. You can now ask any question grounded in this PDF!`,
          },
        ]);
      } else {
        setUploadStatus({ type: 'error', text: data.detail || 'Upload failed' });
      }
    } catch {
      setUploadStatus({ type: 'error', text: 'Cannot connect to backend server at localhost:8000' });
    } finally {
      setIsUploading(false);
    }
  };

  // Handle File Input Selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

// Handle Streaming Chat Response
const handleSend = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!query.trim() || isStreaming) return;

    const userText = query.trim();
    setQuery('');

    setMessages((prev) => [
      ...prev,
      { sender: 'user', text: userText },
      { sender: 'ai', text: '', isStreaming: true },
    ]);

    setIsStreaming(true);

    try {
      const response = await fetch(`${API_BASE_URL}/chat?query=${encodeURIComponent(userText)}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch response');
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split buffer by double newlines (SSE frame boundaries)
        const lines = buffer.split('\n\n');
        // Keep the last incomplete frame in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const rawJson = line.replace('data: ', '').trim();
            if (rawJson) {
              try {
                const parsed = JSON.parse(rawJson);
                accumulatedText += parsed.text;

                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  updated[lastIdx] = {
                    sender: 'ai',
                    text: accumulatedText,
                    isStreaming: true,
                  };
                  return [...updated];
                });
              } catch (e) {
                console.error('Failed to parse SSE frame:', e);
              }
            }
          }
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        updated[lastIdx].isStreaming = false;
        return [...updated];
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        updated[lastIdx] = {
          sender: 'ai',
          text: `Error: ${errorMessage}`,
          isStreaming: false,
        };
        return [...updated];
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      <aside className="w-80 border-r border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="w-6 h-6 text-sky-400" />
            <h1 className="font-bold text-lg text-slate-50">Hybrid RAG Engine</h1>
          </div>

          {/* Upload Box */}
          <form onSubmit={handleUpload} className="space-y-4">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              1. Ingest PDF Document
            </label>
            <div className="border-2 border-dashed border-slate-700 hover:border-sky-500/50 rounded-xl p-4 text-center transition-colors bg-slate-950/40 cursor-pointer">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
                id="pdf-upload"
              />
              <label htmlFor="pdf-upload" className="cursor-pointer flex flex-col items-center">
                <Upload className="w-8 h-8 text-slate-400 mb-2" />
                <span className="text-sm font-medium text-slate-300">
                  {file ? file.name : 'Click to select PDF'}
                </span>
                <span className="text-xs text-slate-500 mt-1">PDF files only</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={!file || isUploading}
              className="w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold py-2.5 rounded-lg text-sm transition-all flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <span>Indexing Chunks...</span>
              ) : (
                <>
                  <FileText className="w-4 h-4" /> Process & Index
                </>
              )}
            </button>
          </form>

          {/* Status Alert */}
          {uploadStatus && (
            <div
              className={`mt-4 p-3 rounded-lg text-xs flex items-start gap-2 ${
                uploadStatus.type === 'success'
                  ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/50'
                  : 'bg-rose-950/50 text-rose-400 border border-rose-800/50'
              }`}
            >
              {uploadStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{uploadStatus.text}</span>
            </div>
          )}
        </div>

        {/* System Info */}
        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-400 space-y-1">
          <p className="font-semibold text-slate-300">Architecture Pipeline:</p>
          <p>• Dense: ChromaDB Vector Store</p>
          <p>• Sparse: BM25 Inverted Index</p>
          <p>• Re-Ranker: Cross-Encoder</p>
          <p>• Model: Gemini 2.5 Flash</p>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col justify-between bg-slate-950">
        {/* Header */}
        <header className="px-8 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Interactive Query Console</h2>
            <p className="text-xs text-slate-400">
              Answers are grounded in top retrieved contexts after cross-encoder re-ranking.
            </p>
          </div>
        </header>

        {/* Chat Messages List */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
              <Bot className="w-12 h-12 mb-3 text-slate-700" />
              <p className="text-sm font-medium">No document ingested yet</p>
              <p className="text-xs text-slate-600 max-w-sm mt-1">
                Upload a PDF using the left panel to trigger chunking, dense vector storage, and BM25 index creation.
              </p>
            </div>
          ) : (
            messages.map((msg: Message, index: number) => (
              <div
                key={index}
                className={`flex gap-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-8 h-8 rounded-full bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-400 shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-2xl px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-sky-500 text-slate-950 font-medium rounded-tr-none'
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none whitespace-pre-wrap'
                  }`}
                >
                  {msg.text}
                  {msg.isStreaming && (
                    <span className="inline-block w-1.5 h-4 ml-1 bg-sky-400 animate-pulse align-middle" />
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-6 border-t border-slate-800 bg-slate-900/30">
          <form onSubmit={handleSend} className="flex gap-3 max-w-4xl mx-auto">
            <input
              type="text"
              value={query}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              placeholder={
                uploadStatus?.type === 'success'
                  ? 'Ask a question about the uploaded document...'
                  : 'Please upload a PDF first...'
              }
              disabled={uploadStatus?.type !== 'success' || isStreaming}
              className="flex-1 bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!query.trim() || isStreaming || uploadStatus?.type !== 'success'}
              className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 p-3 rounded-xl transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}