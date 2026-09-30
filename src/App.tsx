import { useState, useRef, useEffect } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { 
  Upload, 
  Send, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Bot, 
  User, 
  Sparkles, 
  Menu, 
  X 
} from 'lucide-react';

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
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

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
        // Auto-close drawer on mobile on successful upload
        setIsSidebarOpen(false);
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

        const lines = buffer.split('\n\n');
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
    <div className="flex h-dvh w-full overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased">
      
      {/* Mobile Drawer Backdrop */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Panel (Collapsible Drawer on Mobile, Fixed Sidebar on Desktop) */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] transform bg-slate-900/95 lg:bg-slate-900/50 p-5 sm:p-6 border-r border-slate-800 flex flex-col justify-between transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="overflow-y-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-sky-400 shrink-0" />
              <h1 className="font-bold text-base sm:text-lg text-slate-50 truncate">Hybrid RAG Engine</h1>
            </div>
            
            {/* Mobile Close Drawer Button */}
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
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
                <Upload className="w-7 h-7 sm:w-8 sm:h-8 text-slate-400 mb-2" />
                <span className="text-xs sm:text-sm font-medium text-slate-300 break-all px-2 line-clamp-2">
                  {file ? file.name : 'Click to select PDF'}
                </span>
                <span className="text-[11px] text-slate-500 mt-1">PDF files only</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={!file || isUploading}
              className="w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold py-2.5 rounded-lg text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-500/10"
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
              className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
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
              <span className="break-words">{uploadStatus.text}</span>
            </div>
          )}
        </div>

        {/* System Info Footer */}
        <div className="pt-4 mt-auto">
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] sm:text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">Architecture Pipeline:</p>
            <p>• Dense: ChromaDB Vector Store</p>
            <p>• Sparse: BM25 Inverted Index</p>
            <p>• Re-Ranker: Cross-Encoder</p>
            <p>• Model: Gemini 3.6 Flash</p>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-950">
        
        {/* Top Header */}
        <header className="px-4 sm:px-8 py-3.5 sm:py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/90 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Menu Toggle Button */}
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 transition-colors shrink-0"
              aria-label="Open document menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="truncate">
              <h2 className="text-xs sm:text-sm font-semibold text-slate-200 truncate">Interactive Query Console</h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate hidden sm:block">
                Answers are grounded in top retrieved contexts after cross-encoder re-ranking.
              </p>
            </div>
          </div>

          {/* Quick Upload Indicator Badge on Mobile Header */}
          {uploadStatus?.type === 'success' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-mono text-emerald-400 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              PDF Ready
            </span>
          )}
        </header>

        {/* Chat Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-4">
              <Bot className="w-10 h-10 sm:w-12 sm:h-12 mb-3 text-slate-700" />
              <p className="text-xs sm:text-sm font-medium text-slate-300">No document ingested yet</p>
              <p className="text-[11px] sm:text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                Tap the menu button and select a PDF from the sidebar to trigger chunking, dense vector storage, and BM25 index creation.
              </p>
            </div>
          ) : (
            messages.map((msg: Message, index: number) => (
              <div
                key={index}
                className={`flex gap-2.5 sm:gap-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-400 shrink-0">
                    <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-sky-500 text-slate-950 font-medium rounded-tr-none shadow-md shadow-sky-500/10'
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none whitespace-pre-wrap break-words'
                  }`}
                >
                  {msg.text}
                  {msg.isStreaming && (
                    <span className="inline-block w-1.5 h-3.5 sm:h-4 ml-1 bg-sky-400 animate-pulse align-middle" />
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                    <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3.5 sm:p-6 border-t border-slate-800 bg-slate-900/30 shrink-0">
          <form onSubmit={handleSend} className="flex gap-2 sm:gap-3 max-w-4xl mx-auto">
            <input
              type="text"
              value={query}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              placeholder={
                uploadStatus?.type === 'success'
                  ? 'Ask a question about the PDF...'
                  : 'Please upload a PDF first...'
              }
              disabled={uploadStatus?.type !== 'success' || isStreaming}
              className="flex-1 bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors disabled:opacity-50 min-w-0"
            />
            <button
              type="submit"
              disabled={!query.trim() || isStreaming || uploadStatus?.type !== 'success'}
              className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 p-2.5 sm:p-3 rounded-xl transition-all shrink-0 flex items-center justify-center"
              aria-label="Send query"
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </form>
        </div>

      </main>
    </div>
  );
}